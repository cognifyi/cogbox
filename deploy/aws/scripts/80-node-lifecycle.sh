#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
CLUSTER="${CLUSTER:-cogbox-eks}"
SYSTEM_ASG="${SYSTEM_ASG:-$CLUSTER-system}"
RUNNER_ASG="${RUNNER_ASG:-$CLUSTER-runner}"
EIP_TAG="${EIP_TAG:-$CLUSTER-entry}"
EIP_ALLOC="${EIP_ALLOC:-}"
SYSTEM_DESIRED="${SYSTEM_DESIRED:-}"
RUNNER_DESIRED="${RUNNER_DESIRED:-}"
TIMEOUT="${TIMEOUT:-900}"
STATE_DIR="${STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/cogbox-eks}"
STATE_FILE="$STATE_DIR/$CLUSTER.env"
KUBE=1
FULL_VERIFY=0
ASSUME_YES=0
DRY_RUN=0
ACTION=""

usage() {
  cat <<EOF
Usage: $(basename "$0") <down|up> [options]

Options:
  --region <region>          AWS region (default: $REGION)
  --cluster <name>           Cluster prefix (default: $CLUSTER)
  --system-asg <name>        System ASG (default: $SYSTEM_ASG)
  --runner-asg <name>        Runner ASG (default: $RUNNER_ASG)
  --eip-alloc <id>           Elastic IP allocation id (default: discover $EIP_TAG)
  --system-desired <n>       Restore system capacity (default: saved or 1)
  --runner-desired <n>       Restore runner capacity (default: saved or 1)
  --timeout <seconds>        Wait timeout (default: $TIMEOUT)
  --state-dir <dir>          State directory (default: $STATE_DIR)
  --no-kubeconfig            Do not update kubeconfig or run kubectl checks
  --full-verify              Run 60-verify.sh after recovery
  --skip-verify              Skip Kubernetes and service checks
  --yes                      Do not prompt for down
  --dry-run                  Print the planned changes without changing AWS
  -h, --help                 Show this help
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

while [ $# -gt 0 ]; do
  case "$1" in
    down|up) ACTION="$1" ;;
    --region) REGION="$2"; shift ;;
    --cluster) CLUSTER="$2"; shift ;;
    --system-asg) SYSTEM_ASG="$2"; shift ;;
    --runner-asg) RUNNER_ASG="$2"; shift ;;
    --eip-alloc) EIP_ALLOC="$2"; shift ;;
    --system-desired) SYSTEM_DESIRED="$2"; shift ;;
    --runner-desired) RUNNER_DESIRED="$2"; shift ;;
    --timeout) TIMEOUT="$2"; shift ;;
    --state-dir) STATE_DIR="$2"; shift ;;
    --no-kubeconfig) KUBE=0 ;;
    --full-verify) FULL_VERIFY=1 ;;
    --skip-verify) KUBE=0 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
[ -n "$ACTION" ] || { usage; exit 2; }
need aws
mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/$CLUSTER.env"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$STATE_DIR/$CLUSTER.lock"
  flock -n 9 || die "another $CLUSTER lifecycle operation is running"
fi

asg_query() {
  aws autoscaling describe-auto-scaling-groups --region "$REGION" \
    --auto-scaling-group-names "$1" --query "$2" --output text
}

asg_caps() {
  local caps
  caps="$(asg_query "$1" 'AutoScalingGroups[0].[MinSize,DesiredCapacity,MaxSize]')"
  [ -n "$caps" ] && [ "$caps" != "None" ] || die "ASG not found: $1"
  read -r ASG_MIN ASG_DESIRED ASG_MAX <<< "$caps"
}

asg_instances() {
  asg_query "$1" 'AutoScalingGroups[0].Instances[].InstanceId' | tr '\t' '\n' | sed '/^$/d'
}

instance_state() {
  aws ec2 describe-instances --region "$REGION" --instance-ids "$1" \
    --query 'Reservations[0].Instances[0].State.Name' --output text 2>/dev/null || echo terminated
}

wait_asg_empty() {
  local asg="$1" ids="$2" deadline=$((SECONDS + TIMEOUT)) id state
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ -z "$(asg_instances "$asg")" ]; then
      local ok=1
      for id in $ids; do
        state="$(instance_state "$id")"
        [ "$state" = "terminated" ] || { ok=0; break; }
      done
      [ "$ok" = 1 ] && return 0
    fi
    sleep 10
  done
  die "timeout waiting for $asg to terminate its instances"
}

wait_eip_free() {
  local deadline=$((SECONDS + TIMEOUT)) assoc
  while [ "$SECONDS" -lt "$deadline" ]; do
    assoc="$(aws ec2 describe-addresses --region "$REGION" --allocation-ids "$EIP_ALLOC" \
      --query 'Addresses[0].AssociationId' --output text 2>/dev/null || true)"
    [ -z "$assoc" ] || [ "$assoc" = "None" ] && return 0
    sleep 5
  done
  die "timeout waiting for EIP $EIP_ALLOC to disassociate"
}

wait_instance_running() {
  local id="$1" deadline=$((SECONDS + TIMEOUT)) state
  while [ "$SECONDS" -lt "$deadline" ]; do
    state="$(instance_state "$id")"
    [ "$state" = "running" ] && return 0
    sleep 5
  done
  die "timeout waiting for instance $id to run"
}

wait_volume_available() {
  local vol="$1" deadline=$((SECONDS + TIMEOUT)) state
  [ -n "$vol" ] || return 0
  while [ "$SECONDS" -lt "$deadline" ]; do
    state="$(aws ec2 describe-volumes --region "$REGION" --volume-ids "$vol" \
      --query 'Volumes[0].State' --output text 2>/dev/null || true)"
    [ "$state" = "available" ] && return 0
    sleep 5
  done
  die "timeout waiting for volume $vol to become available"
}

discover_eip() {
  [ -n "$EIP_ALLOC" ] && return 0
  EIP_ALLOC="$(aws ec2 describe-addresses --region "$REGION" \
    --filters "Name=tag:Name,Values=$EIP_TAG" \
    --query 'Addresses[0].AllocationId' --output text 2>/dev/null || true)"
  [ -n "$EIP_ALLOC" ] && [ "$EIP_ALLOC" != "None" ] \
    || die "no Elastic IP tagged Name=$EIP_TAG; pass --eip-alloc"
}

postgres_volume() {
  local ns=control pvc=postgres-data pv
  command -v kubectl >/dev/null 2>&1 || return 0
  kubectl get namespace "$ns" >/dev/null 2>&1 || return 0
  pv="$(kubectl -n "$ns" get pvc "$pvc" -o jsonpath='{.spec.volumeName}' 2>/dev/null || true)"
  [ -n "$pv" ] || return 0
  kubectl get pv "$pv" -o jsonpath='{.spec.csi.volumeHandle}{"\n"}' 2>/dev/null || true
}

save_state() {
  local tmp="$STATE_FILE.tmp"
  {
    echo "REGION=$REGION"
    echo "CLUSTER=$CLUSTER"
    echo "SYSTEM_ASG=$SYSTEM_ASG"
    echo "RUNNER_ASG=$RUNNER_ASG"
    echo "EIP_ALLOC=$EIP_ALLOC"
    echo "RESTORE_SYSTEM_DESIRED=$RESTORE_SYSTEM_DESIRED"
    echo "RESTORE_RUNNER_DESIRED=$RESTORE_RUNNER_DESIRED"
    echo "POSTGRES_VOLUME=$POSTGRES_VOLUME"
  } > "$tmp"
  mv "$tmp" "$STATE_FILE"
  chmod 600 "$STATE_FILE"
}

load_state() {
  [ -f "$STATE_FILE" ] || return 0
  local key val
  while IFS='=' read -r key val; do
    case "$key" in
      EIP_ALLOC) [ -n "${EIP_ALLOC:-}" ] || EIP_ALLOC="$val" ;;
      POSTGRES_VOLUME) [ -n "${POSTGRES_VOLUME:-}" ] || POSTGRES_VOLUME="$val" ;;
      RESTORE_SYSTEM_DESIRED) RESTORE_SYSTEM_DESIRED="${RESTORE_SYSTEM_DESIRED:-$val}" ;;
      RESTORE_RUNNER_DESIRED) RESTORE_RUNNER_DESIRED="${RESTORE_RUNNER_DESIRED:-$val}" ;;
    esac
  done < "$STATE_FILE"
}

wait_node_ready() {
  local dns="$1" deadline=$((SECONDS + TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if kubectl get "node/$dns" >/dev/null 2>&1; then
      kubectl wait --for=condition=Ready "node/$dns" --timeout="${TIMEOUT}s" >/dev/null && return 0
    fi
    sleep 5
  done
  die "timeout waiting for node $dns"
}

check_desired() {
  local name="$1" desired="$2" max="$3"
  [ "$desired" -ge 1 ] || die "$name desired capacity must be >= 1"
  [ "$desired" -le "$max" ] || die "$name desired $desired exceeds max $max; raise the ASG max first"
}

do_down() {
  asg_caps "$SYSTEM_ASG"; local sys_min=$ASG_MIN sys_des=$ASG_DESIRED sys_max=$ASG_MAX
  asg_caps "$RUNNER_ASG"; local run_min=$ASG_MIN run_des=$ASG_DESIRED run_max=$ASG_MAX
  discover_eip
  POSTGRES_VOLUME="${POSTGRES_VOLUME:-$(postgres_volume)}"
  RESTORE_SYSTEM_DESIRED="${SYSTEM_DESIRED:-$sys_des}"
  RESTORE_RUNNER_DESIRED="${RUNNER_DESIRED:-$run_des}"
  [ "$RESTORE_SYSTEM_DESIRED" -ge 1 ] || RESTORE_SYSTEM_DESIRED=1
  [ "$RESTORE_RUNNER_DESIRED" -ge 1 ] || RESTORE_RUNNER_DESIRED=1
  check_desired "$SYSTEM_ASG" "$RESTORE_SYSTEM_DESIRED" "$sys_max"
  check_desired "$RUNNER_ASG" "$RESTORE_RUNNER_DESIRED" "$run_max"
  local sys_ids run_ids
  sys_ids="$(asg_instances "$SYSTEM_ASG")"
  run_ids="$(asg_instances "$RUNNER_ASG")"

  echo "Cluster: $CLUSTER ($REGION)"
  echo "System: $SYSTEM_ASG min=$sys_min desired=$sys_des max=$sys_max"
  echo "Runner: $RUNNER_ASG min=$run_min desired=$run_des max=$run_max"
  echo "EIP: $EIP_ALLOC"
  echo "Postgres volume: ${POSTGRES_VOLUME:-unknown}"
  echo "Restore capacity: system=$RESTORE_SYSTEM_DESIRED runner=$RESTORE_RUNNER_DESIRED"

  if [ "$DRY_RUN" = 1 ]; then
    echo "DRY-RUN: would scale $RUNNER_ASG and $SYSTEM_ASG to 0"
    return 0
  fi
  if [ "$ASSUME_YES" != 1 ]; then
    read -r -p "Scale both node groups to 0? [y/N] " answer
    case "$answer" in y|Y|yes|YES) ;; *) die "aborted" ;; esac
  fi

  save_state
  aws autoscaling update-auto-scaling-group --region "$REGION" \
    --auto-scaling-group-name "$RUNNER_ASG" --min-size 0 --desired-capacity 0
  aws autoscaling update-auto-scaling-group --region "$REGION" \
    --auto-scaling-group-name "$SYSTEM_ASG" --min-size 0 --desired-capacity 0

  wait_asg_empty "$RUNNER_ASG" "$run_ids"
  wait_asg_empty "$SYSTEM_ASG" "$sys_ids"
  wait_eip_free
  wait_volume_available "$POSTGRES_VOLUME"
  echo "OK: nodes scaled to 0; EIP $EIP_ALLOC is free; persistent volume is detached"
}

do_up() {
  load_state
  [ -n "${EIP_ALLOC:-}" ] || discover_eip
  [ -n "${EIP_ALLOC:-}" ] && [ "$EIP_ALLOC" != "None" ] || die "no EIP allocation id"
  [ -n "${RESTORE_SYSTEM_DESIRED:-}" ] || RESTORE_SYSTEM_DESIRED="${SYSTEM_DESIRED:-1}"
  [ -n "${RESTORE_RUNNER_DESIRED:-}" ] || RESTORE_RUNNER_DESIRED="${RUNNER_DESIRED:-1}"
  [ -z "${SYSTEM_DESIRED:-}" ] || RESTORE_SYSTEM_DESIRED="$SYSTEM_DESIRED"
  [ -z "${RUNNER_DESIRED:-}" ] || RESTORE_RUNNER_DESIRED="$RUNNER_DESIRED"

  asg_caps "$SYSTEM_ASG"; local sys_max=$ASG_MAX
  asg_caps "$RUNNER_ASG"; local run_max=$ASG_MAX
  check_desired "$SYSTEM_ASG" "$RESTORE_SYSTEM_DESIRED" "$sys_max"
  check_desired "$RUNNER_ASG" "$RESTORE_RUNNER_DESIRED" "$run_max"

  echo "Cluster: $CLUSTER ($REGION)"
  echo "EIP: $EIP_ALLOC"
  echo "Restore capacity: system=$RESTORE_SYSTEM_DESIRED runner=$RESTORE_RUNNER_DESIRED"

  if [ "$DRY_RUN" = 1 ]; then
    echo "DRY-RUN: would restore ASGs, re-associate $EIP_ALLOC, then verify services"
    return 0
  fi

  aws autoscaling update-auto-scaling-group --region "$REGION" \
    --auto-scaling-group-name "$SYSTEM_ASG" --min-size 1 --desired-capacity "$RESTORE_SYSTEM_DESIRED"
  aws autoscaling update-auto-scaling-group --region "$REGION" \
    --auto-scaling-group-name "$RUNNER_ASG" --min-size 1 --desired-capacity "$RESTORE_RUNNER_DESIRED"

  local instance_id="" deadline=$((SECONDS + TIMEOUT)) eni current public_ip
  while [ "$SECONDS" -lt "$deadline" ]; do
    instance_id="$(asg_query "$SYSTEM_ASG" 'AutoScalingGroups[0].Instances[0].InstanceId' 2>/dev/null || true)"
    [ -n "$instance_id" ] && [ "$instance_id" != "None" ] && break
    sleep 5
  done
  [ -n "$instance_id" ] && [ "$instance_id" != "None" ] || die "system ASG did not launch an instance"
  wait_instance_running "$instance_id"

  eni="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$instance_id" \
    --query 'Reservations[0].Instances[0].NetworkInterfaces[?Attachment.DeviceIndex==`0`].NetworkInterfaceId' \
    --output text)"
  [ -n "$eni" ] || die "could not find primary ENI for $instance_id"
  current="$(aws ec2 describe-addresses --region "$REGION" --allocation-ids "$EIP_ALLOC" \
    --query 'Addresses[0].InstanceId' --output text)"
  if [ "$current" != "$instance_id" ]; then
    local args=(--region "$REGION" --network-interface-id "$eni" --allocation-id "$EIP_ALLOC")
    [ -n "$current" ] && [ "$current" != "None" ] && args+=(--allow-reassociation)
    aws ec2 associate-address "${args[@]}" >/dev/null
  fi
  public_ip="$(aws ec2 describe-addresses --region "$REGION" --allocation-ids "$EIP_ALLOC" \
    --query 'Addresses[0].PublicIp' --output text)"
  deadline=$((SECONDS + TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    current="$(aws ec2 describe-addresses --region "$REGION" --allocation-ids "$EIP_ALLOC" \
      --query 'Addresses[0].InstanceId' --output text)"
    [ "$current" = "$instance_id" ] && break
    sleep 5
  done
  [ "$current" = "$instance_id" ] || die "EIP did not associate with $instance_id"
  echo "OK: $instance_id -> $eni, EIP $public_ip"

  if [ "$KUBE" = 0 ]; then
    echo "Skipped Kubernetes checks (--no-kubeconfig/--skip-verify)"
    return 0
  fi
  command -v kubectl >/dev/null 2>&1 || die "kubectl not found; use --skip-verify or install kubectl"
  aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER" --alias "$CLUSTER" >/dev/null

  local node_dns
  node_dns="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$instance_id" \
    --query 'Reservations[0].Instances[0].PrivateDnsName' --output text)"
  wait_node_ready "$node_dns"
  echo "OK: node $node_dns is Ready"

  local runner_id="" runner_dns="" ready_count
  deadline=$((SECONDS + TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    runner_id="$(asg_query "$RUNNER_ASG" 'AutoScalingGroups[0].Instances[0].InstanceId' 2>/dev/null || true)"
    [ -n "$runner_id" ] && [ "$runner_id" != "None" ] && break
    sleep 5
  done
  [ -n "$runner_id" ] && [ "$runner_id" != "None" ] || die "runner ASG did not launch an instance"
  wait_instance_running "$runner_id"
  runner_dns="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$runner_id" \
    --query 'Reservations[0].Instances[0].PrivateDnsName' --output text)"
  wait_node_ready "$runner_dns"
  kubectl label node -l cogbox.io/role=runner cogbox.io/region=shared-us --overwrite >/dev/null
  deadline=$((SECONDS + TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    ready_count="$(kubectl get nodes -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' | grep -c '^True$' || true)"
    [ "$ready_count" -ge $((1 + RESTORE_RUNNER_DESIRED)) ] && break
    sleep 5
  done
  echo "OK: system and runner nodes are Ready"

  kubectl -n control rollout status statefulset/postgres --timeout="${TIMEOUT}s"
  kubectl -n control rollout status deploy/keycloak --timeout="${TIMEOUT}s"
  kubectl -n control rollout status deploy/control-control-api --timeout="${TIMEOUT}s"
  kubectl -n control rollout status deploy/registry --timeout="${TIMEOUT}s"
  kubectl -n region-shared rollout status deploy/region-shared-proxy --timeout="${TIMEOUT}s"
  kubectl -n region-shared rollout status deploy/region-shared-snapshots --timeout="${TIMEOUT}s"
  kubectl -n region-shared rollout status deploy/region-shared-ssh-gateway --timeout="${TIMEOUT}s"
  kubectl -n region-shared rollout status ds/region-shared-runner --timeout="${TIMEOUT}s"

  local deadline2=$((SECONDS + TIMEOUT)) notready
  while [ "$SECONDS" -lt "$deadline2" ]; do
    notready="$(kubectl get externalsecret -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}={.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>/dev/null | grep -v '=True$' || true)"
    [ -z "$notready" ] && break
    sleep 5
  done
  [ -z "$notready" ] || die "ExternalSecrets not ready: $notready"
  echo "OK: ExternalSecrets synced"

  for ref in control/cogbox-infra control/cogbox-s3 control/keycloak-admin control/keycloak-dashboard \
             control/cogbox-eks-secrets region-shared/region-shared-creds; do
    kubectl -n "${ref%%/*}" get secret "${ref##*/}" >/dev/null || die "missing secret $ref"
  done
  [ "$(kubectl -n control get pvc postgres-data -o jsonpath='{.status.phase}')" = "Bound" ] \
    || die "postgres-data PVC is not Bound"
  kubectl -n control exec postgres-0 -- pg_isready -U cogbox -d cogbox >/dev/null
  echo "OK: persistent secrets and Postgres are ready"

  if kubectl -n control get deploy/curlbox >/dev/null 2>&1; then
    kubectl -n control rollout status deploy/curlbox --timeout="${TIMEOUT}s" >/dev/null
    kubectl -n control exec deploy/curlbox -- curl -fsS --max-time 10 http://registry:6000/v2/ >/dev/null
  else
    kubectl -n control exec deploy/registry -- wget -qO- --timeout=10 http://localhost:6000/v2/ >/dev/null
  fi
  echo "OK: registry API is ready"

  if [ "$FULL_VERIFY" = 1 ]; then
    local verify="${VERIFY_SCRIPT:-}"
    [ -n "$verify" ] || verify="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/60-verify.sh"
    [ -x "$verify" ] || die "60-verify.sh not found; set VERIFY_SCRIPT"
    "$verify"
  fi
  echo "OK: recovery complete"
}

case "$ACTION" in
  down) do_down ;;
  up) do_up ;;
  *) usage; exit 2 ;;
esac
