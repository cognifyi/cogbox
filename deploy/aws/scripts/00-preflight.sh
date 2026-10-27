#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 00: pre-flight. Account, plan, tooling, default VPC, Spot capability.
# Writes deploy/aws/.work/aws.env (never committed).
# VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws kubectl helm openssl python3 ssh-keygen

echo "==> account"
ID_JSON="$(aws sts get-caller-identity --output json)"
echo "$ID_JSON"
ACCOUNT_ID="$(printf '%s' "$ID_JSON" | jsonget "['Account']")"

echo "==> plan"
PLAN="$(aws freetier get-account-plan-state --output json)"
PLAN_TYPE="$(printf '%s' "$PLAN" | jsonget "['accountPlanType']")"
CREDITS="$(printf '%s' "$PLAN" | jsonget "['accountPlanRemainingCredits']['amount']")"
echo "plan=$PLAN_TYPE credits=\$$CREDITS"
case "$PLAN_TYPE" in
  FREE) echo "    free-tier SCP applies (Spot is denied by policy — verified below)" ;;
  PAID) echo "    paid plan" ;;
  *)    echo "    unknown plan type $PLAN_TYPE (continuing)" ;;
esac

echo "==> tooling"
aws --version
kubectl version --client=true 2>/dev/null | head -1
helm version --short

echo "==> ec2 vcpu quota (Standard on-demand)"
VCPU_QUOTA="$(aws service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A \
  --query 'Quota.Value' --output text 2>/dev/null || echo unknown)"
echo "    standard on-demand vCPU quota: $VCPU_QUOTA"
if [ "$VCPU_QUOTA" != "unknown" ] && [ "${VCPU_QUOTA%.*}" -lt 6 ]; then
  echo "!! fewer than 6 vCPUs available; system(t3.large=2) + runner(t3.xlarge=4) will not fit" >&2
fi

echo "==> spot capability (DryRun, launches nothing)"
AMI="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)"
set +e
SPOT_OUT="$(aws ec2 run-instances --dry-run --image-id "$AMI" --instance-type t3.small \
  --instance-market-options 'MarketType=spot' --count 1 2>&1)"
SPOT_RC=$?
set -e
SPOT_ALLOWED=false
if printf '%s' "$SPOT_OUT" | grep -q 'DryRunOperation'; then
  SPOT_ALLOWED=true
  echo "    spot available"
elif printf '%s' "$SPOT_OUT" | grep -qE 'UnauthorizedOperation|explicit deny'; then
  echo "    spot DENIED by account policy -> on-demand only"
else
  echo "    could not determine spot support (rc=$SPOT_RC): $SPOT_OUT"
fi

echo "==> default VPC"
VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)}"
[ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ] || { echo "no default VPC found; set VPC_ID" >&2; exit 1; }
# EKS requires the control-plane subnets to span at least two AZs.
# Nodes (ASGs) are pinned to us-east-2c by 20-cluster.sh.
SUBNET_IDS="$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[].SubnetId' --output text | tr '\t' ',')"
echo "    vpc=$VPC_ID subnets=$SUBNET_IDS (nodes pinned to us-east-2c)"
aws ec2 describe-vpc-attribute --vpc-id "$VPC_ID" --attribute enableDnsHostnames \
  --query 'EnableDnsHostnames.Value' --output text | grep -qx True \
  || { echo "DNS hostnames must be enabled on $VPC_ID" >&2; exit 1; }

echo "==> subnet tags (EKS/ELB discovery)"
for s in ${SUBNET_IDS//,/ }; do
  aws ec2 create-tags --resources "$s" --tags \
    "Key=kubernetes.io/cluster/$CLUSTER,Value=shared" \
    "Key=kubernetes.io/role/elb,Value=1" >/dev/null
done
echo "    tagged"

BUCKET="${BUCKET:-cogbox-eks-$ACCOUNT_ID-$AWS_REGION}"
save_state \
  "ACCOUNT_ID=$ACCOUNT_ID" \
  "AWS_REGION=$AWS_REGION" \
  "CLUSTER=$CLUSTER" \
  "VPC_ID=$VPC_ID" \
  "SUBNET_IDS=$SUBNET_IDS" \
  "SPOT_ALLOWED=$SPOT_ALLOWED" \
  "BUCKET=$BUCKET"

echo
echo "OK: preflight done (state: $STATE_FILE)"
