#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 40: create the Cloudflare DNS records (DNS-only/grey cloud REQUIRED).
# Usage: INGRESS_IP=1.2.3.4 [SSH_LB_IP=5.6.7.8] ./40-dns.sh
# (get INGRESS_IP from ingress-nginx svc; SSH_LB_IP from the ssh-gateway
# LoadBalancer svc — a different IP than ingress, so ssh.cogbox needs its
# own record; the *.cogbox wildcard does NOT cover it correctly for SSH
# since it points at ingress).
# Requires: cf logged in with Zone:DNS:Edit on pazity.com. Idempotent: skips
# records that already exist with the same content.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need cf
INGRESS_IP="${INGRESS_IP:?set INGRESS_IP to the ingress-nginx external IP}"
SSH_LB_IP="${SSH_LB_IP:-}"

record() { # name content
  local name="$1" content="$2"
  if cf dns records list --zone "$DOMAIN_ZONE" --name "$name.$DOMAIN_ZONE" 2>/dev/null \
    | grep -q "\"content\": *\"$content\""; then
    echo "exists: $name.$DOMAIN_ZONE -> $content"
  else
    cf dns records create --zone "$DOMAIN_ZONE" \
      --body "{\"type\":\"A\",\"name\":\"$name\",\"content\":\"$content\",\"ttl\":120,\"proxied\":false}"
  fi
}

# NOTE: *.cogbox does NOT cover *.proxy.cogbox (second-level wildcard),
# which the region proxy needs for {{PORT}}-{{sandboxId}} previews.
record "cogbox" "$INGRESS_IP"
record "*.cogbox" "$INGRESS_IP"
record "*.proxy.cogbox" "$INGRESS_IP"
if [ -n "$SSH_LB_IP" ]; then
  # NOTE: the name must be "ssh.cogbox" (relative to the zone) — a bare
  # "ssh" would create ssh.pazity.com instead!
  record "ssh.cogbox" "$SSH_LB_IP"
fi
echo "OK: DNS records ensured (verify with dig +short)"
