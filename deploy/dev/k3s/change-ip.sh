#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Move the dev track to a new box LAN IP (the box is on DHCP/WiFi and its
# address changes, e.g. 10.168.1.234 <-> 192.168.1.102).
#
# What it does (today's proven procedure, in order):
#   1. Cloudflare: point the 3 LAN-only A records at NEW_IP
#      (needs cf auth: `cf auth login` or CLOUDFLARE_API_TOKEN; skipped with
#      a warning if unauthenticated -- do it manually then).
#   2. Box dnsmasq: rewrite address + listen-address, restart.
#   3. Box k3s: rewrite node-ip + tls-san, restart (endpoints converge,
#      apiserver cert regenerates with the new SAN).
#   4. Laptop: refresh k3s-dev-config from the box (proper CA, no insecure).
#   5. Verify: node InternalIP, kubernetes endpoints, ingress controller,
#      runner scheduled.
#
# Usage: ./change-ip.sh <new-lan-ip> [ssh-user@ssh-host]
#   e.g. ./change-ip.sh 10.168.1.234
#        ./change-ip.sh 192.168.1.102 kk@192.168.1.102
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEW_IP="${1:?usage: $0 <new-lan-ip> [ssh-target]}"
SSH_TARGET="${2:-kk@$NEW_IP}"
KUBECONFIG_OUT="${KUBECONFIG:-$HOME/.kube/k3s-dev-config}"
ZONE="pazity.com"
NAMES="cogboxdev.pazity.com *.cogboxdev.pazity.com *.proxy.cogboxdev.pazity.com"

ssh_opts="-o ConnectTimeout=10 -o BatchMode=yes"

echo "==> [1/5] Cloudflare A records -> $NEW_IP"
CF_OK=true
for n in $NAMES; do
  # shellcheck disable=SC2086
  id=$(cf dns records list -z "$ZONE" --name "$n" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null || true)
  if [ -z "$id" ]; then CF_OK=false; echo "  !! cf lookup failed for $n (auth?)"; continue; fi
  cf dns records update -z "$ZONE" --body "{\"id\":\"$id\",\"type\":\"A\",\"name\":\"$n\",\"content\":\"$NEW_IP\",\"ttl\":300,\"proxied\":false,\"comment\":\"dev k3s LAN-only\"}" >/dev/null 2>&1 \
    && echo "  $n -> $NEW_IP" \
    || { CF_OK=false; echo "  !! update failed for $n"; }
done
# shellcheck disable=SC2086
$CF_OK || echo "  !! CF step incomplete: run 'cf auth login' and re-run, or edit the 3 A records by hand."

echo "==> [2/5] box dnsmasq"
# shellcheck disable=SC2086
ssh $ssh_opts "$SSH_TARGET" "printf 'address=/.cogboxdev.pazity.com/%s\nlisten-address=127.0.0.1,%s\nbind-interfaces\n' '$NEW_IP' '$NEW_IP' | sudo tee /etc/dnsmasq.d/cogboxdev.conf >/dev/null && sudo systemctl restart dnsmasq && sleep 1 && systemctl is-active dnsmasq"

echo "==> [3/5] box k3s node-ip + tls-san + restart"
# shellcheck disable=SC2086
ssh $ssh_opts "$SSH_TARGET" "printf 'node-ip: %s\ntls-san:\n  - %s\n' '$NEW_IP' '$NEW_IP' | sudo tee /etc/rancher/k3s/config.yaml >/dev/null && sudo systemctl restart k3s && sleep 5 && systemctl is-active k3s"

echo "==> [4/5] refresh laptop kubeconfig"
# shellcheck disable=SC2086
ssh $ssh_opts "$SSH_TARGET" "sudo cat /etc/rancher/k3s/k3s.yaml" 2>/dev/null \
  | sed "s/127\.0\.0\.1/$NEW_IP/" > "$KUBECONFIG_OUT"
export KUBECONFIG="$KUBECONFIG_OUT"

echo "==> [5/5] verify"
for i in $(seq 1 12); do
  READY=$(kubectl get nodes --no-headers 2>/dev/null | awk '$2=="Ready"' | head -1 || true)
  [ -n "$READY" ] && break
  sleep 10
done
kubectl get nodes -o wide --no-headers
kubectl get endpoints kubernetes 2>/dev/null | tail -1
kubectl get pods -n ingress-nginx --no-headers
kubectl get pods -n region-dev --no-headers -l app.kubernetes.io/component=runner

echo
echo "OK: dev track moved to $NEW_IP"
echo "Reminder: give the box a static DHCP reservation to stop doing this dance."
