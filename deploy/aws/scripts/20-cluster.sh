#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 20: EKS cluster + self-managed node groups + core add-ons.
#   system pool: 1x on-demand t3.large  (control plane + in-cluster infra)
#   runner pool: 1x on-demand t3.xlarge (privileged runner + sandboxes)
#
# Node groups are self-managed Auto Scaling groups, not EKS managed node
# groups: this account's SCP denies ec2:CreateFleet, which managed node
# groups use internally (creation stalls in CREATING forever, or fails with
# "not authorized to perform: ec2:CreateFleet"). Plain ASGs use
# ec2:RunInstances, which is allowed.
#
# Spot is denied by the same SCP (DenySpotMarketType), so capacityType is
# ON_DEMAND. Needs 6 vCPU total in the account quota.
# Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws kubectl python3
load_state
: "${CLUSTER_ROLE_ARN:?run 10-iam.sh first}"
: "${NODE_ROLE_ARN:?run 10-iam.sh first}"
: "${SUBNET_IDS:?run 00-preflight.sh first}"

CAPACITY_TYPE="ON_DEMAND"
[ "${SPOT_ALLOWED:-false}" = "true" ] && CAPACITY_TYPE="SPOT"
echo "==> capacity type: $CAPACITY_TYPE"

cluster_status() {
  aws eks describe-cluster --name "$CLUSTER" --query 'cluster.status' --output text 2>/dev/null || echo MISSING
}

echo "==> EKS control plane ($CLUSTER, k8s $K8S_VERSION)"
if [ "$(cluster_status)" = "MISSING" ]; then
  aws eks create-cluster \
    --name "$CLUSTER" \
    --role-arn "$CLUSTER_ROLE_ARN" \
    --kubernetes-version "$K8S_VERSION" \
    --resources-vpc-config "subnetIds=$SUBNET_IDS,endpointPublicAccess=true,endpointPrivateAccess=true" \
    --access-config authenticationMode=API_AND_CONFIG_MAP,bootstrapClusterCreatorAdminPermissions=true \
    --tags app=cogbox,purpose=eks-validation >/dev/null
  echo "    creating (this takes ~10-15 min)"
else
  echo "    exists ($(cluster_status))"
fi

for _ in $(seq 1 90); do
  st="$(cluster_status)"
  [ "$st" = "ACTIVE" ] && break
  [ "$st" = "FAILED" ] && { echo "cluster FAILED" >&2; exit 1; }
  sleep 10
done
[ "$(cluster_status)" = "ACTIVE" ] || { echo "cluster did not become ACTIVE" >&2; exit 1; }
echo "    ACTIVE"

echo "==> kubeconfig"
aws eks update-kubeconfig --name "$CLUSTER" --region "$AWS_REGION" --alias "$CLUSTER" >/dev/null
kube config current-context

echo "==> control-plane access (443 from the VPC; kubectl and the nodes need it)"
SG_ID="$(aws eks describe-cluster --name "$CLUSTER" \
  --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)"
VPC_CIDR="$(aws ec2 describe-vpcs --vpc-ids "$VPC_ID" --query 'Vpcs[0].CidrBlock' --output text)"
for port in 443 80; do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port "$port" --cidr "$VPC_CIDR" >/dev/null 2>&1 || true
done
echo "    sg=$SG_ID cidr=$VPC_CIDR ports=443,80"

echo "==> core add-ons"
addon_status() {
  aws eks describe-addon --cluster-name "$CLUSTER" --addon-name "$1" \
    --query 'addon.status' --output text 2>/dev/null || echo MISSING
}
for addon in vpc-cni kube-proxy coredns; do
  if [ "$(addon_status "$addon")" = "MISSING" ]; then
    aws eks create-addon --cluster-name "$CLUSTER" --addon-name "$addon" \
      --resolve-conflicts OVERWRITE >/dev/null
    echo "    $addon: creating"
  else
    echo "    $addon: exists ($(addon_status "$addon"))"
  fi
done
# Add-ons report DEGRADED while there are no schedulable nodes ("all pods
# unscheduled"), which is expected before the node groups exist. Only hard
# failures abort here; ACTIVE is asserted after the nodes join.
for addon in vpc-cni kube-proxy coredns; do
  for _ in $(seq 1 12); do
    st="$(addon_status "$addon")"
    if [ "$st" = "CREATE_FAILED" ] || [ "$st" = "DELETE_FAILED" ]; then
      echo "    $addon: $st" >&2; exit 1
    fi
    [ "$st" = "ACTIVE" ] && break
    sleep 5
  done
  echo "    $addon: $(addon_status "$addon")"
done

NODE_ROLE_NAME="${NODE_ROLE_ARN##*/}"
NODE_INSTANCE_PROFILE="${NODE_INSTANCE_PROFILE:-$NODE_ROLE_NAME}"

echo "==> node bootstrap config"
API_ENDPOINT="$(aws eks describe-cluster --name "$CLUSTER" --query 'cluster.endpoint' --output text)"
CA_DATA="$(aws eks describe-cluster --name "$CLUSTER" --query 'cluster.certificateAuthority.data' --output text)"
SERVICE_CIDR="$(aws eks describe-cluster --name "$CLUSTER" \
  --query 'cluster.kubernetesNetworkConfig.serviceIpv4Cidr' --output text)"
AMI_ID="$(aws ssm get-parameter \
  --name "/aws/service/eks/optimized-ami/$K8S_VERSION/amazon-linux-2023/x86_64/standard/recommended/image_id" \
  --query 'Parameter.Value' --output text)"
ROOT_DEVICE="$(aws ec2 describe-images --image-ids "$AMI_ID" \
  --query 'Images[0].RootDeviceName' --output text)"
echo "    ami: $AMI_ID ($ROOT_DEVICE, AL2023, k8s $K8S_VERSION)"

ensure_node_role_mapping() {
  # Self-managed nodes authenticate through the aws-auth ConfigMap (the
  # cluster is in API_AND_CONFIG_MAP mode, so the map is authoritative for
  # principals without an access entry).
  local cm; cm="$(mktemp)"
  if ! kube -n kube-system get configmap aws-auth -o json > "$cm" 2>/dev/null; then
    cat <<EOF | kube apply -f - >/dev/null
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: $NODE_ROLE_ARN
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
EOF
    echo "    aws-auth: created"
    rm -f "$cm"
    return
  fi
  if grep -q "$NODE_ROLE_ARN" "$cm"; then
    echo "    aws-auth: node role already mapped"
    rm -f "$cm"
    return
  fi
  python3 - "$cm" "$NODE_ROLE_ARN" <<'PY'
import json, sys
path, role = sys.argv[1], sys.argv[2]
cm = json.load(open(path))
entry = (
    f"- rolearn: {role}\n"
    "  username: system:node:{{EC2PrivateDNSName}}\n"
    "  groups:\n"
    "    - system:bootstrappers\n"
    "    - system:nodes\n"
)
existing = cm.get("data", {}).get("mapRoles", "")
merged = (existing.rstrip("\n") + "\n" + entry) if existing.strip() else entry
cm.setdefault("data", {})["mapRoles"] = merged
json.dump(cm, open(path, "w"))
PY
  kube apply -f "$cm" >/dev/null
  echo "    aws-auth: node role mapped"
  rm -f "$cm"
}
ensure_node_role_mapping

asg_inservice() {
  aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$1" \
    --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`] | length(@)' \
    --output text 2>/dev/null || echo 0
}

create_nodegroup() { # <name> <type> <disk> <labels> <taints|->
  local name="$1" itype="$2" disk="$3" labels="$4" taints="$5"
  local lt="$CLUSTER-$name" asg="$CLUSTER-$name"
  local ud="$WORK_DIR/userdata-$name.yaml"
  local ltd="$WORK_DIR/launch-template-$name.json"
  local flags="      - --node-labels=$labels"

  if [ "$taints" != "-" ]; then
    flags="$flags
      - --register-with-taints=$taints"
  fi

  # nodeadm NodeConfig: AL2023 self-managed nodes need the cluster metadata in
  # their user data (name, endpoint, CA, service CIDR). Plain YAML is accepted
  # by nodeadm; the MIME wrapper is not needed and tripped the decoder here.
  cat > "$ud" <<EOF
apiVersion: node.eks.aws/v1alpha1
kind: NodeConfig
spec:
  cluster:
    name: $CLUSTER
    apiServerEndpoint: $API_ENDPOINT
    certificateAuthority: $CA_DATA
    cidr: $SERVICE_CIDR
  kubelet:
    flags:
$flags
EOF

  python3 - "$ud" "$ltd" "$AMI_ID" "$itype" "$disk" "$NODE_INSTANCE_PROFILE" \
    "$ACCOUNT_ID" "$ROOT_DEVICE" "$name" "$SG_ID" <<'PY'
import base64, json, sys
ud_path, out, ami, itype, disk, profile, account, root_dev, name, sg = sys.argv[1:11]
lt = {
    "ImageId": ami,
    "InstanceType": itype,
    "IamInstanceProfile": {
        "Arn": f"arn:aws:iam::{account}:instance-profile/{profile}",
    },
    # Self-managed nodes do not get the cluster security group automatically
    # (managed node groups do). Without it the control plane cannot reach
    # kubelet on 10250, which breaks logs/exec/port-forward.
    "SecurityGroupIds": [sg],
    "UserData": base64.b64encode(open(ud_path, "rb").read()).decode(),
    "MetadataOptions": {"HttpTokens": "required", "HttpPutResponseHopLimit": 2},
    "BlockDeviceMappings": [{
        "DeviceName": root_dev,
        "Ebs": {
            "VolumeSize": int(disk),
            "VolumeType": "gp3",
            "DeleteOnTermination": True,
        },
    }],
    "TagSpecifications": [{
        "ResourceType": "instance",
        "Tags": [
            {"Key": "Name", "Value": name},
            {"Key": "app", "Value": "cogbox"},
            {"Key": "purpose", "Value": "eks-validation"},
        ],
    }],
}
json.dump(lt, open(out, "w"))
PY

  local lt_changed=false
  if aws ec2 describe-launch-templates --launch-template-names "$lt" \
      --query 'LaunchTemplates[0].LaunchTemplateName' --output text 2>/dev/null | grep -qx "$lt"; then
    aws ec2 describe-launch-template-versions --launch-template-name "$lt" \
      --versions '$Latest' --query 'LaunchTemplateVersions[0].LaunchTemplateData' \
      --output json > "$WORK_DIR/lt-current-$name.json"
    if python3 - "$ltd" "$WORK_DIR/lt-current-$name.json" <<'PY'
import json, sys
desired = json.load(open(sys.argv[1]))
current = json.load(open(sys.argv[2]))

def norm(d):
    return {
        "ImageId": d.get("ImageId"),
        "InstanceType": d.get("InstanceType"),
        "UserData": d.get("UserData"),
        "IamInstanceProfile": (d.get("IamInstanceProfile") or {}).get("Arn"),
        "VolumeSize": ((d.get("BlockDeviceMappings") or [{}])[0].get("Ebs") or {}).get("VolumeSize"),
        "SecurityGroupIds": d.get("SecurityGroupIds"),
    }

sys.exit(0 if norm(desired) == norm(current) else 1)
PY
    then
      echo "    $lt: unchanged"
    else
      aws ec2 create-launch-template-version --launch-template-name "$lt" \
        --launch-template-data "file://$ltd" --source-version '$Latest' >/dev/null
      echo "    $lt: new version (instance type / user data / disk changed)"
      lt_changed=true
    fi
  else
    aws ec2 create-launch-template --launch-template-name "$lt" \
      --version-description cogbox --launch-template-data "file://$ltd" >/dev/null
    echo "    $lt: launch template created"
  fi

  if aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$asg" \
      --query 'AutoScalingGroups[0].AutoScalingGroupName' --output text 2>/dev/null | grep -qx "$asg"; then
    aws autoscaling update-auto-scaling-group --auto-scaling-group-name "$asg" \
      --launch-template "LaunchTemplateName=$lt,Version=\$Latest" >/dev/null
    echo "    $asg: exists (launch template -> \$Latest)"
    if [ "$lt_changed" = true ] && [ "$(asg_inservice "$asg")" -ge 1 ]; then
      aws autoscaling start-instance-refresh --auto-scaling-group-name "$asg" \
        --preferences '{"MinHealthyPercentage":0,"InstanceWarmup":60}' >/dev/null 2>&1 || true
      echo "    $asg: instance refresh started (launch template changed)"
    fi
  else
    aws autoscaling create-auto-scaling-group \
      --auto-scaling-group-name "$asg" \
      --launch-template "LaunchTemplateName=$lt,Version=\$Latest" \
      --min-size 1 --max-size 1 --desired-capacity 1 \
      --vpc-zone-identifier "$SUBNET_IDS" \
      --tags \
        "Key=Name,Value=$asg,PropagateAtLaunch=true" \
        "Key=kubernetes.io/cluster/$CLUSTER,Value=owned,PropagateAtLaunch=true" \
        "Key=app,Value=cogbox,PropagateAtLaunch=true" >/dev/null
    echo "    $asg: creating"
  fi
}

echo "==> node groups (self-managed)"
create_nodegroup "system" "$SYSTEM_INSTANCE_TYPE" 40 \
  "cogbox.io/pool=standard,cogbox.io/role=system" "-"
create_nodegroup "runner" "$RUNNER_INSTANCE_TYPE" 60 \
  "cogbox.io/pool=runner,cogbox.io/role=runner" \
  "cogbox.io/runner=true:NoSchedule"

for ng in system runner; do
  asg="$CLUSTER-$ng"
  for _ in $(seq 1 60); do
    n="$(asg_inservice "$asg")"
    [ "${n:-0}" -ge 1 ] && break
    sleep 10
  done
  n="$(asg_inservice "$asg")"
  if [ "${n:-0}" -lt 1 ]; then
    echo "$asg has no InService instance" >&2
    aws autoscaling describe-scaling-activities --auto-scaling-group-name "$asg" \
      --max-items 5 --query 'Activities[].[Cause,StatusCode,StatusMessage]' --output text >&2 || true
    exit 1
  fi
  echo "    $asg: $n InService"
done

echo "==> waiting for nodes"
# Poll instead of `kubectl wait`: a long-lived watch through the public
# endpoint has proven flaky here (and stale NotReady node objects block --all).
for _ in $(seq 1 90); do
  ready="$(kube get nodes -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>/dev/null | grep -c '^True$' || true)"
  [ "${ready:-0}" -ge 2 ] && break
  sleep 10
done
kube get nodes -L cogbox.io/pool

echo "==> add-on health"
for addon in vpc-cni kube-proxy coredns; do
  for _ in $(seq 1 60); do
    st="$(addon_status "$addon")"
    [ "$st" = "ACTIVE" ] && break
    if [ "$st" = "CREATE_FAILED" ] || [ "$st" = "DELETE_FAILED" ]; then
      echo "    $addon: $st" >&2; exit 1
    fi
    sleep 10
  done
  echo "    $addon: $(addon_status "$addon")"
done

echo "==> node ports / ingress (hostPort 80/443 from the VPC)"
for port in 80 443; do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port "$port" --cidr "$VPC_CIDR" >/dev/null 2>&1 || true
done
echo "    sg=$SG_ID cidr=$VPC_CIDR ports=80,443"

SYSTEM_NODE_NAME="$(kube get nodes -l cogbox.io/role=system -o jsonpath='{.items[0].metadata.name}')"
SYSTEM_NODE_IP="$(kube get node "$SYSTEM_NODE_NAME" \
  -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}')"
# Shared with the GCP track: the clusters are mutually exclusive, so both use
# cogbox.pazity.com. Set DOMAIN explicitly to override (e.g. a nip.io domain
# for a purely in-VPC smoke test).
DOMAIN="${DOMAIN:-cogbox.$DOMAIN_ZONE}"
save_state \
  "SYSTEM_NODE_NAME=$SYSTEM_NODE_NAME" \
  "SYSTEM_NODE_IP=$SYSTEM_NODE_IP" \
  "DOMAIN=$DOMAIN" \
  "CLUSTER_SG=$SG_ID" \
  "CAPACITY_TYPE=$CAPACITY_TYPE" \
  "NODE_INSTANCE_PROFILE=$NODE_INSTANCE_PROFILE"

echo
echo "OK: cluster ready"
echo "    api host : $DOMAIN"
echo "    proxy    : proxy.$DOMAIN"
echo "    keycloak : keycloak.$DOMAIN"
echo "    nodes    : $(kube get nodes --no-headers | wc -l)"
echo "    note: ingress-nginx hostPort-binds 80/443 on the system node;"
echo "          25-entry.sh publishes those ports through an Elastic IP."
