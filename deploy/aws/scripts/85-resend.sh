#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 85: configure Resend SMTP for Keycloak and control mail
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl python3
load_state
: "${DOMAIN:?run 20-cluster.sh first}"

if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "==> RESEND_API_KEY not set in env; prompting or using existing secret"
fi

WORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.work"
mkdir -p "$WORK_DIR"

if [ -n "${RESEND_API_KEY:-}" ]; then
  RESEND_KEY="$RESEND_API_KEY"
elif [ -f "$WORK_DIR/resend-api-key.txt" ]; then
  RESEND_KEY="$(cat "$WORK_DIR/resend-api-key.txt")"
else
  read -r -p "Enter Resend API key (re_xxx): " RESEND_KEY
  echo "$RESEND_KEY" > "$WORK_DIR/resend-api-key.txt"
  chmod 600 "$WORK_DIR/resend-api-key.txt"
fi

[ -z "$RESEND_KEY" ] && { echo "missing Resend key" >&2; exit 1; }

MAIL_FROM="${MAIL_FROM:-noreply@$DOMAIN}"

echo "==> update Keycloak SMTP secret (control namespace)"
kube -n control create secret generic keycloak-smtp \
  --from-literal=host=smtp.resend.com \
  --from-literal=port=587 \
  --from-literal=from="$MAIL_FROM" \
  --from-literal=user=resend \
  --from-literal=password="$RESEND_KEY" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null

echo "==> update Keycloak realm SMTP settings"
python3 <<PY
import json, os, subprocess, sys
domain = os.environ['DOMAIN']
mail_from = os.environ['MAIL_FROM']
resend_key = os.environ['RESEND_KEY']
realm_path = f"{os.environ['WORK_DIR']}/keycloak-realm.json"
if not os.path.exists(realm_path):
    # regenerate from dev template
    src = f"{os.environ['REPO_ROOT']}/deploy/dev/k3s/keycloak-realm-dev.json"
    old = "cogboxdev.pazity.com"
    def walk(o):
        if isinstance(o, str): return o.replace("https://" + old, "https://" + domain).replace(old, domain)
        if isinstance(o, list): return [walk(x) for x in o]
        if isinstance(o, dict): return {k: walk(v) for k, v in o.items()}
        return o
    realm = walk(json.load(open(src)))
else:
    realm = json.load(open(realm_path))
realm.setdefault('smtpServer', {})['host'] = 'smtp.resend.com'
realm['smtpServer']['port'] = '587'
realm['smtpServer']['from'] = mail_from
realm['smtpServer']['fromDisplayName'] = 'Cogbox'
realm['smtpServer']['starttls'] = 'true'
realm['smtpServer']['auth'] = 'true'
realm['smtpServer']['user'] = 'resend'
realm['smtpServer']['password'] = resend_key
realm['smtpServer']['ssl'] = 'false'
json.dump(realm, open(realm_path,'w'), indent=2)
# update configmap
subprocess.run(['kubectl','-n','control','create','configmap','keycloak-realm','--from-file=cogbox-realm.json='+realm_path,'--dry-run=client','-o','yaml'],stdout=open('/tmp/kc-realm.yaml','w'))
subprocess.run(['kubectl','apply','-f','/tmp/kc-realm.yaml'],check=False)
PY
echo "==> restart Keycloak to pick up SMTP config"
kube -n control rollout restart deploy/keycloak >/dev/null || true
wait_pod_ready control app=keycloak 900

echo "==> test email (optional) - use Resend API directly"
curl -sS https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"$MAIL_FROM\",\"to\":[\"delivered@resend.dev\"],\"subject\":\"Cogbox test\",\"html\":\"<p>test</p>\"}" 2>&1 | head -c 200; echo

echo
echo "OK: Resend configured"
