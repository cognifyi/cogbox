#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 25: internet-facing NLB in front of ingress-nginx (hostPort 80/443) and the
# SSH gateway NodePort (default 30222). TLS still terminates in ingress-nginx.
# The NLB re-originates client-IP traffic from inside the VPC, so the node SG
# rule for the VPC CIDR is sufficient (preserve_client_ip is disabled).
# Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws python3
load_state
: "${VPC_ID:?run 20-cluster.sh first}"
: "${SUBNET_IDS:?run 20-cluster.sh first}"
: "${SYSTEM_NODE_IP:?run 20-cluster.sh first}"
: "${CLUSTER_SG:?run 20-cluster.sh first}"

TG_HTTP_NAME="$NLB_NAME-http"
TG_HTTPS_NAME="$NLB_NAME-https"
TG_SSH_NAME="$NLB_NAME-ssh"

mapfile -t SUBNETS < <(tr ',' '\n' <<<"$SUBNET_IDS")
[ "${#SUBNETS[@]}" -ge 2 ] || { echo "NLB needs at least two subnets" >&2; exit 1; }

echo "==> load balancer $NLB_NAME"
NLB_ARN="$(aws elbv2 describe-load-balancers --names "$NLB_NAME" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)"
if [ -z "$NLB_ARN" ] || [ "$NLB_ARN" = "None" ]; then
  NLB_ARN="$(aws elbv2 create-load-balancer \
    --name "$NLB_NAME" \
    --type network \
    --scheme internet-facing \
    --subnets "${SUBNETS[@]}" \
    --tags Key=app,Value=cogbox Key=purpose,Value=eks-validation \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
  echo "    created"
else
  echo "    exists"
fi
aws elbv2 wait load-balancer-available --load-balancer-arns "$NLB_ARN"
NLB_DNS="$(aws elbv2 describe-load-balancers --load-balancer-arns "$NLB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text)"
echo "    dns=$NLB_DNS"

echo "==> target groups"
ensure_tg() { # <name> <port>
  local name="$1" port="$2" arn
  arn="$(aws elbv2 describe-target-groups --names "$name" \
    --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)"
  if [ -z "$arn" ] || [ "$arn" = "None" ]; then
    arn="$(aws elbv2 create-target-group \
      --name "$name" \
      --protocol TCP \
      --port "$port" \
      --vpc-id "$VPC_ID" \
      --target-type instance \
      --health-check-protocol TCP \
      --health-check-port traffic-port \
      --query 'TargetGroups[0].TargetGroupArn' --output text)"
    echo "    created $name:$port" >&2
  else
    echo "    exists  $name:$port" >&2
  fi
  aws elbv2 modify-target-group-attributes --target-group-arn "$arn" \
    --attributes Key=preserve_client_ip.enabled,Value=false \
                 Key=deregistration_delay.timeout_seconds,Value=30 >/dev/null
  printf '%s' "$arn"
}
TG_HTTP="$(ensure_tg "$TG_HTTP_NAME" 80)"
TG_HTTPS="$(ensure_tg "$TG_HTTPS_NAME" 443)"
TG_SSH="$(ensure_tg "$TG_SSH_NAME" "$SSH_NODE_PORT")"

echo "==> register system node + attach to ASG ${CLUSTER}-system"
INSTANCE_ID="$(aws ec2 describe-instances \
  --filters "Name=private-ip-address,Values=$SYSTEM_NODE_IP" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ] || {
  echo "could not find the system node instance for $SYSTEM_NODE_IP" >&2
  exit 1
}
for tg in "$TG_HTTP" "$TG_HTTPS" "$TG_SSH"; do
  aws elbv2 register-targets --target-group-arn "$tg" --targets Id="$INSTANCE_ID" >/dev/null
done
aws autoscaling attach-load-balancer-target-groups \
  --auto-scaling-group-name "${CLUSTER}-system" \
  --target-group-arns "$TG_HTTP" "$TG_HTTPS" "$TG_SSH" >/dev/null
echo "    instance=$INSTANCE_ID"

echo "==> listeners"
ensure_listener() { # <port> <tg-arn>
  local port="$1" tg="$2" arn
  arn="$(aws elbv2 describe-listeners --load-balancer-arn "$NLB_ARN" --output json \
    | python3 -c "import json,sys;ls=json.load(sys.stdin)['Listeners'];print(next((l['ListenerArn'] for l in ls if l['Port']==$port),''))")"
  if [ -z "$arn" ]; then
    aws elbv2 create-listener --load-balancer-arn "$NLB_ARN" \
      --protocol TCP --port "$port" \
      --default-actions "Type=forward,TargetGroupArn=$tg" >/dev/null
    echo "    created :$port" >&2
  else
    echo "    exists  :$port" >&2
  fi
}
ensure_listener 80 "$TG_HTTP"
ensure_listener 443 "$TG_HTTPS"
ensure_listener 2222 "$TG_SSH"

echo "==> node SG: SSH NodePort from the VPC"
VPC_CIDR="$(aws ec2 describe-vpcs --vpc-ids "$VPC_ID" \
  --query 'Vpcs[0].CidrBlock' --output text)"
aws ec2 authorize-security-group-ingress --group-id "$CLUSTER_SG" \
  --protocol tcp --port "$SSH_NODE_PORT" --cidr "$VPC_CIDR" >/dev/null 2>&1 || true
echo "    $CLUSTER_SG tcp/$SSH_NODE_PORT <- $VPC_CIDR"

save_state \
  "NLB_ARN=$NLB_ARN" \
  "NLB_DNS=$NLB_DNS" \
  "TG_HTTP=$TG_HTTP" \
  "TG_HTTPS=$TG_HTTPS" \
  "TG_SSH=$TG_SSH" \
  "SSH_NODE_PORT=$SSH_NODE_PORT"

echo
echo "OK: NLB ready"
echo "    http  : http://$NLB_DNS"
echo "    https : https://$NLB_DNS (self-signed until 27-tls.sh finishes)"
echo "    ssh   : ssh://$NLB_DNS:2222 (NodePort $SSH_NODE_PORT)"
