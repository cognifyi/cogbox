#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 95: collect and write credentials to /tmp
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl
load_state

OUT="/tmp/cogbox-credentials-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "# Cogbox credentials $(date -u)"
  echo "DOMAIN=$DOMAIN"
  echo "API_URL=https://$DOMAIN/api"
  echo "DASHBOARD_URL=https://$DOMAIN/dashboard/"
  echo "KEYCLOAK_URL=https://keycloak.$DOMAIN"
  echo "---"
  [ -f "$WORK_DIR/keycloak-admin-password.txt" ] && echo "KEYCLOAK_ADMIN_USER=admin" && echo "KEYCLOAK_ADMIN_PASSWORD=$(cat "$WORK_DIR/keycloak-admin-password.txt")"
  [ -f "$WORK_DIR/admin-api-key.txt" ] && echo "ADMIN_API_KEY=$(cat "$WORK_DIR/admin-api-key.txt")"
  [ -f "$WORK_DIR/runner-token.txt" ] && echo "RUNNER_TOKEN=$(cat "$WORK_DIR/runner-token.txt")"
  [ -f "$WORK_DIR/region-keys.env" ] && { echo "---"; cat "$WORK_DIR/region-keys.env"; }
  echo "---"
  echo "DB_USERS:"
  kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -t -A -F'|' -c "SELECT email, role FROM \"user\" ORDER BY \"createdAt\";" 2>&1 || true
  echo "---"
  echo "ORGS:"
  kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -t -A -F'|' -c "SELECT id, name FROM organization;" 2>&1 || true
} > "$OUT"
KC_PWD="$(cat "$WORK_DIR/keycloak-admin-password.txt" 2>/dev/null || echo "")"
echo "$KC_PWD" | kubectl -n control exec -i deploy/keycloak -- sh -c 'cat > /tmp/kc-pass && chmod 600 /tmp/kc-pass' 2>/dev/null || true
{
  echo "---"
  echo "KEYCLOAK_REALM_USERS:"
  kube -n control exec deploy/keycloak -- sh -c "/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password \$(cat /tmp/kc-pass) >/dev/null && /opt/keycloak/bin/kcadm.sh get users -r cogbox --fields username,email" 2>&1 | grep -v '^Logging' | grep -v '^$' || true
  echo "---"
  echo "DASHBOARD_USER=$(kube -n control get secret keycloak-dashboard -o jsonpath='{.data.username}' | base64 -d 2>/dev/null || true)"
  echo "DASHBOARD_PASSWORD=$(kube -n control get secret keycloak-dashboard -o jsonpath='{.data.password}' | base64 -d 2>/dev/null || true)"
  echo "DASHBOARD_LOGIN_URL=https://$DOMAIN/dashboard/"
} >> "$OUT"
chmod 600 "$OUT"
echo "wrote $OUT"
cat "$OUT"
