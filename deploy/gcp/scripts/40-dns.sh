#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 40: create the three Cloudflare DNS records (DNS-only/grey cloud REQUIRED).
# Usage: INGRESS_IP=1.2.3.4 ./40-dns.sh   (get the IP from ingress-nginx svc)
# Requires: cf logged in with Zone:DNS:Edit on pazity.com. Idempotent: skips
# records that already exist with the same content.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need cf
INGRESS_IP="${INGRESS_IP:?set INGRESS_IP to the ingress-nginx external IP}"

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
echo "OK: DNS records ensured (verify with dig +short)"
