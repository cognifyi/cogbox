#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 25: stable public entry via an Elastic IP on the system node.
# This AWS account cannot create load balancers (ELBv2 returns
# OperationNotPermitted even with free quota), so the EIP plays the role of
# deploy/gcp's reserved static IP: DNS points at it and ingress-nginx
# terminates TLS on the node's hostPort 80/443. 50-region.sh adds a socat
# hostPort 2222 -> SSH gateway entry; NodePort 30222 remains as a fallback.
# Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws python3
load_state
: "${SYSTEM_NODE_IP:?run 20-cluster.sh first}"
: "${CLUSTER_SG:?run 20-cluster.sh first}"

EIP_TAG="$CLUSTER-entry"
INSTANCE_ID="$(aws ec2 describe-instances \
  --filters "Name=private-ip-address,Values=$SYSTEM_NODE_IP" \
            "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ] || {
  echo "could not find the system node instance for $SYSTEM_NODE_IP" >&2
  exit 1
}

echo "==> elastic IP ($EIP_TAG)"
EIP_ALLOCATION_ID="${EIP_ALLOCATION_ID:-}"
if [ -z "$EIP_ALLOCATION_ID" ] || [ "$EIP_ALLOCATION_ID" = "None" ]; then
  EIP_ALLOCATION_ID="$(aws ec2 describe-addresses \
    --filters "Name=tag:Name,Values=$EIP_TAG" \
    --query 'Addresses[0].AllocationId' --output text 2>/dev/null || true)"
fi
if [ -z "$EIP_ALLOCATION_ID" ] || [ "$EIP_ALLOCATION_ID" = "None" ]; then
  EIP_ALLOCATION_ID="$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$EIP_TAG},{Key=app,Value=cogbox}]" \
    --query 'AllocationId' --output text)"
  echo "    allocated $EIP_ALLOCATION_ID"
else
  echo "    exists    $EIP_ALLOCATION_ID"
fi

CURRENT_INSTANCE="$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOCATION_ID" \
  --query 'Addresses[0].InstanceId' --output text)"
if [ "$CURRENT_INSTANCE" = "$INSTANCE_ID" ]; then
  echo "    associated with $INSTANCE_ID"
else
  # EKS nodes can have multiple ENIs; AssociateAddress then requires the
  # primary interface instead of the instance ID.
  ENI_ID="$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].NetworkInterfaces[?Attachment.DeviceIndex==`0`].NetworkInterfaceId' \
    --output text)"
  args=(--network-interface-id "$ENI_ID" --allocation-id "$EIP_ALLOCATION_ID")
  if [ -n "$CURRENT_INSTANCE" ] && [ "$CURRENT_INSTANCE" != "None" ]; then
    args+=(--allow-reassociation)
  fi
  aws ec2 associate-address "${args[@]}" >/dev/null
  echo "    associated with $INSTANCE_ID ($ENI_ID)"
fi

PUBLIC_IP="$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOCATION_ID" \
  --query 'Addresses[0].PublicIp' --output text)"
[ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ] || {
  echo "EIP has no public address yet" >&2
  exit 1
}

echo "==> node SG: public 80/443 + SSH NodePort"
for port in 80 443 2222 "$SSH_NODE_PORT"; do
  aws ec2 authorize-security-group-ingress --group-id "$CLUSTER_SG" \
    --protocol tcp --port "$port" --cidr 0.0.0.0/0 >/dev/null 2>&1 || true
  echo "    $CLUSTER_SG tcp/$port <- 0.0.0.0/0"
done

save_state \
  "EIP_ALLOCATION_ID=$EIP_ALLOCATION_ID" \
  "PUBLIC_IP=$PUBLIC_IP" \
  "ENTRY_MODE=eip"

echo
echo "OK: public entry ready"
echo "    eip   : $PUBLIC_IP"
echo "    http  : http://$DOMAIN"
echo "    https : https://$DOMAIN (cert-manager; run 27-tls.sh after this)"
echo "    ssh   : ssh://ssh.$DOMAIN:2222 (fallback NodePort :$SSH_NODE_PORT)"
echo "    note  : the EIP association is lost if the system ASG replaces the"
echo "            node; re-run this script after a replacement."
