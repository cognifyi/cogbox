#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 26: point the public hostnames at the system node's Elastic IP via
# Cloudflare (grey cloud, so Let's Encrypt HTTP-01 and the proxy wildcard
# DNS-01 both work). The records are shared with the GCP track; explicit
# cogbox/*.cogbox/*.proxy.cogbox records take precedence over the account-wide
# *.pazity.com tunnel record.
# Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need curl python3 dig
load_state
: "${DOMAIN:?run 20-cluster.sh first}"
: "${PUBLIC_IP:?run 25-entry.sh first}"
: "${CF_TOKEN_FILE:?}"

[ -s "$CF_TOKEN_FILE" ] || {
  echo "missing Cloudflare API token: $CF_TOKEN_FILE" >&2
  exit 1
}
CF_TOKEN="$(tr -d '\r\n' < "$CF_TOKEN_FILE")"

cf() { # <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $CF_TOKEN" \
      -H 'Content-Type: application/json' \
      --data "$body" \
      "https://api.cloudflare.com/client/v4$path"
  else
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $CF_TOKEN" \
      "https://api.cloudflare.com/client/v4$path"
  fi
}

CF_ZONE_ID="${CF_ZONE_ID:-}"
if [ -z "$CF_ZONE_ID" ]; then
  CF_ZONE_ID="$(cf GET "/zones?name=$DOMAIN_ZONE&status=active" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("result",[]);print(r[0]["id"] if r else "")')"
fi
[ -n "$CF_ZONE_ID" ] || { echo "Cloudflare zone $DOMAIN_ZONE not found by this token" >&2; exit 1; }
echo "==> zone $DOMAIN_ZONE ($CF_ZONE_ID)"

urlq() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }

record_info() { # <name> -> "<id> <type>"
  cf GET "/zones/$CF_ZONE_ID/dns_records?name=$(urlq "$1")" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("result",[]);print((r[0]["id"]+" "+r[0]["type"]) if r else "")'
}

upsert_a() { # <name> <ip>
  local name="$1" ip="$2" info id type body
  info="$(record_info "$name")"
  id="${info%% *}"; type="${info#* }"
  if [ -n "$id" ] && [ "$type" != "A" ]; then
    cf DELETE "/zones/$CF_ZONE_ID/dns_records/$id" >/dev/null
    echo "    removed existing $type $name"
    id=""
  fi
  body="$(python3 -c 'import json,sys;print(json.dumps({"type":"A","name":sys.argv[1],"content":sys.argv[2],"ttl":300,"proxied":False}))' "$name" "$ip")"
  if [ -n "$id" ]; then
    cf PUT "/zones/$CF_ZONE_ID/dns_records/$id" "$body" >/dev/null
    echo "    updated $name -> $ip"
  else
    cf POST "/zones/$CF_ZONE_ID/dns_records" "$body" >/dev/null
    echo "    created $name -> $ip"
  fi
}

echo "==> DNS A records (grey cloud)"
upsert_a "$DOMAIN" "$PUBLIC_IP"
upsert_a "*.$DOMAIN" "$PUBLIC_IP"
upsert_a "*.proxy.$DOMAIN" "$PUBLIC_IP"

NS="$(dig +short NS "$DOMAIN_ZONE" | head -n1)"
NS="${NS:-1.1.1.1}"
echo "==> resolve check (authoritative NS $NS)"
for name in "$DOMAIN" "keycloak.$DOMAIN" "proxy.$DOMAIN" "snapshots.$DOMAIN" "ssh.$DOMAIN"; do
  printf '    %-38s %s\n' "$name" "$(dig +short A "$name" "@$NS" | head -n1)"
done

save_state "CF_ZONE_ID=$CF_ZONE_ID" "CF_ZONE=$DOMAIN_ZONE"

echo
echo "OK: DNS points cogbox.$DOMAIN_ZONE and its subdomains at $PUBLIC_IP"
echo "    note: the account-wide *.pazity.com tunnel record still covers other"
echo "          names; the cogbox records above are more specific."
