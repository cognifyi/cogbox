#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 99: destroy everything this track created. The EKS control plane bills even
# with zero nodes, so this is the only thing that actually stops the meter.
#   ./99-destroy.sh            # prompt
#   CONFIRM=yes ./99-destroy.sh
#   PURGE=1 CONFIRM=yes ./99-destroy.sh   # also delete deploy/aws/.work state
# VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws
load_state

: "${CLUSTER:=cogbox-eks}"
ACCOUNT_ID="${ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
BUCKET="${BUCKET:-cogbox-eks-$ACCOUNT_ID-$AWS_REGION}"
S3_USER="${S3_USER:-$CLUSTER-s3}"
CLUSTER_ROLE="$CLUSTER-cluster"
NODE_ROLE="$CLUSTER-node"

if [ "${CONFIRM:-}" != "yes" ]; then
  cat <<EOF
This deletes:
  EKS cluster      $CLUSTER (and its node groups)
  Auto Scaling     $CLUSTER-system, $CLUSTER-runner (+ launch templates)
  IAM              role/$CLUSTER_ROLE, role/$NODE_ROLE, instance profile/$NODE_ROLE
  IAM user         $S3_USER (policies + access keys)
  S3 bucket        s3://$BUCKET (all objects/versions)
  CloudWatch log   /aws/eks/$CLUSTER/cluster
  Elastic IP       ${PUBLIC_IP:-none} (${EIP_ALLOCATION_ID:-none}) unless KEEP_EIP=1
EOF
  read -r -p "Type 'yes' to continue: " ans
  [ "$ans" = "yes" ] || { echo "aborted"; exit 1; }
fi

echo "==> helm releases (best effort)"
for rel in "$RELEASE_REGION:$REGION_NS" "$RELEASE_CONTROL:$CONTROL_NS"; do
  ns="${rel#*:}"; name="${rel%%:*}"
  helm_ -n "$ns" uninstall "$name" >/dev/null 2>&1 || true
done

echo "==> managed node groups (none by design; removes leftovers)"
for ng in $(aws eks list-nodegroups --cluster-name "$CLUSTER" --query 'nodegroups[]' --output text 2>/dev/null || true); do
  echo "    $ng: deleting"
  aws eks delete-nodegroup --cluster-name "$CLUSTER" --nodegroup-name "$ng" >/dev/null
  aws eks wait nodegroup-deleted --cluster-name "$CLUSTER" --nodegroup-name "$ng"
done

echo "==> self-managed node groups"
for asg in "$CLUSTER-system" "$CLUSTER-runner"; do
  if aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$asg" \
      --query 'AutoScalingGroups[0].AutoScalingGroupName' --output text 2>/dev/null | grep -qx "$asg"; then
    aws autoscaling delete-auto-scaling-group --auto-scaling-group-name "$asg" --force-delete >/dev/null
    echo "    $asg: deleting (instances terminated)"
  else
    echo "    $asg: absent"
  fi
done
for asg in "$CLUSTER-system" "$CLUSTER-runner"; do
  for _ in $(seq 1 60); do
    aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$asg" \
      --query 'AutoScalingGroups[0].AutoScalingGroupName' --output text 2>/dev/null \
      | grep -qx "$asg" || break
    sleep 5
  done
done

echo "==> Elastic IP (public entry)"
if [ "${KEEP_EIP:-0}" = "1" ]; then
  echo "    kept (KEEP_EIP=1): ${PUBLIC_IP:-unknown} (${EIP_ALLOCATION_ID:-unknown})"
elif [ -n "${EIP_ALLOCATION_ID:-}" ]; then
  if aws ec2 describe-addresses --allocation-ids "$EIP_ALLOCATION_ID" >/dev/null 2>&1; then
    for _ in $(seq 1 30); do
      assoc="$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOCATION_ID" \
        --query 'Addresses[0].AssociationId' --output text 2>/dev/null || true)"
      [ -z "$assoc" ] || [ "$assoc" = "None" ] && break
      aws ec2 disassociate-address --association-id "$assoc" >/dev/null 2>&1 || true
      sleep 5
    done
    if aws ec2 release-address --allocation-id "$EIP_ALLOCATION_ID" >/dev/null 2>&1; then
      echo "    released ${PUBLIC_IP:-$EIP_ALLOCATION_ID}"
    else
      echo "    WARN could not release $EIP_ALLOCATION_ID; release manually" >&2
    fi
  else
    echo "    absent/already released"
  fi
else
  echo "    absent"
fi

echo "==> NLB (only if the account later allows ELB)"
if [ -n "${NLB_ARN:-}" ]; then
  aws elbv2 delete-load-balancer --load-balancer-arn "$NLB_ARN" >/dev/null 2>&1 \
    && echo "    deleted" || echo "    absent"
else
  echo "    absent (EIP entry in use)"
fi

echo "==> launch templates"
for lt in "$CLUSTER-system" "$CLUSTER-runner"; do
  aws ec2 delete-launch-template --launch-template-name "$lt" >/dev/null 2>&1 \
    && echo "    $lt: deleted" || echo "    $lt: absent"
done

echo "==> EKS cluster"
if aws eks describe-cluster --name "$CLUSTER" >/dev/null 2>&1; then
  aws eks delete-cluster --name "$CLUSTER" >/dev/null
  aws eks wait cluster-deleted --name "$CLUSTER"
  echo "    deleted"
else
  echo "    absent"
fi

echo "==> kubeconfig entry"
if kube config get-contexts -o name 2>/dev/null | grep -qx "$CLUSTER"; then
  kube config delete-context "$CLUSTER" >/dev/null 2>&1 || true
  kube config delete-cluster "$(kube config view -o jsonpath="{.contexts[?(@.name==\"$CLUSTER\")].context.cluster}" 2>/dev/null)" >/dev/null 2>&1 || true
  echo "    removed"
else
  echo "    absent"
fi

echo "==> CloudWatch log group"
aws logs delete-log-group --log-group-name "/aws/eks/$CLUSTER/cluster" >/dev/null 2>&1 \
  && echo "    deleted" || echo "    absent"

echo "==> IAM: instance profile + roles"
if aws iam get-instance-profile --instance-profile-name "$NODE_ROLE" >/dev/null 2>&1; then
  aws iam remove-role-from-instance-profile --instance-profile-name "$NODE_ROLE" \
    --role-name "$NODE_ROLE" >/dev/null 2>&1 || true
  aws iam delete-instance-profile --instance-profile-name "$NODE_ROLE" >/dev/null
  echo "    instance profile: deleted"
fi
for role in "$NODE_ROLE" "$CLUSTER_ROLE"; do
  if aws iam get-role --role-name "$role" >/dev/null 2>&1; then
    for p in $(aws iam list-attached-role-policies --role-name "$role" \
        --query 'AttachedPolicies[].PolicyArn' --output text); do
      aws iam detach-role-policy --role-name "$role" --policy-arn "$p" >/dev/null
    done
    for p in $(aws iam list-role-policies --role-name "$role" \
        --query 'PolicyNames[]' --output text); do
      aws iam delete-role-policy --role-name "$role" --policy-name "$p" >/dev/null
    done
    aws iam delete-role --role-name "$role" >/dev/null
    echo "    role/$role: deleted"
  else
    echo "    role/$role: absent"
  fi
done

echo "==> IAM: S3 user ($S3_USER)"
if aws iam get-user --user-name "$S3_USER" >/dev/null 2>&1; then
  for k in $(aws iam list-access-keys --user-name "$S3_USER" \
      --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
    aws iam delete-access-key --user-name "$S3_USER" --access-key-id "$k"
  done
  for p in $(aws iam list-user-policies --user-name "$S3_USER" \
      --query 'PolicyNames[]' --output text); do
    aws iam delete-user-policy --user-name "$S3_USER" --policy-name "$p"
  done
  for p in $(aws iam list-attached-user-policies --user-name "$S3_USER" \
      --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-user-policy --user-name "$S3_USER" --policy-arn "$p"
  done
  aws iam delete-user --user-name "$S3_USER"
  echo "    deleted"
else
  echo "    absent"
fi

echo "==> S3 bucket ($BUCKET)"
if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  for up in $(aws s3api list-multipart-uploads --bucket "$BUCKET" \
      --query 'Uploads[].[Key,UploadId]' --output text 2>/dev/null | tr '\t' ':'); do
    aws s3api abort-multipart-upload --bucket "$BUCKET" \
      --key "${up%%:*}" --upload-id "${up#*:}" >/dev/null 2>&1 || true
  done
  while :; do
    aws s3api list-object-versions --bucket "$BUCKET" --max-keys 1000 \
      --output json > "$tmp/versions.json"
    python3 - "$tmp/versions.json" "$tmp/delete.json" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
objs = [{"Key": o["Key"], "VersionId": o["VersionId"]}
        for o in d.get("Versions", []) + d.get("DeleteMarkers", [])]
json.dump({"Objects": objs, "Quiet": True}, open(dst, "w"))
PY
    n="$(python3 -c "import json;print(len(json.load(open('$tmp/delete.json'))['Objects']))")"
    [ "$n" -eq 0 ] && break
    aws s3api delete-objects --bucket "$BUCKET" --delete "file://$tmp/delete.json" >/dev/null
  done
  aws s3api delete-bucket --bucket "$BUCKET"
  echo "    deleted"
else
  echo "    absent"
fi

if [ "${PURGE:-0}" = "1" ]; then
  echo "==> local state"
  rm -rf "$WORK_DIR"
  echo "    removed $WORK_DIR"
fi

echo
echo "OK: teardown requested. Verify nothing bills:"
echo "    aws eks list-clusters"
echo "    aws ec2 describe-instances --filters Name=instance-state-name,Values=running \\"
echo "        --query 'Reservations[].Instances[].[InstanceId,InstanceType,LaunchTime]'"
echo "    aws ec2 describe-addresses --query 'Addresses[].[PublicIp,AllocationId,AssociationId]'"
echo "    aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName'"
