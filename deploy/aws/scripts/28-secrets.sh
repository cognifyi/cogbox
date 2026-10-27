#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 28: move cluster secrets into AWS Secrets Manager and sync them back with
# External Secrets Operator (ESO). Run after 50-region.sh (it captures the
# control and region secrets). Idempotent.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm aws python3
load_state
: "${AWS_REGION:?}"
: "${ACCOUNT_ID:?}"
: "${CLUSTER:?}"
: "${DOMAIN:?}"

SECRETSTORE="aws-secretsmanager"
SM_PREFIX="cogbox/$CLUSTER"

echo "==> ESO IRSA role"
OIDC_ISSUER="$(aws eks describe-cluster --name "$CLUSTER" --query 'cluster.identity.oidc.issuer' --output text)"
OIDC_HOST="${OIDC_ISSUER#https://}"
OIDC_ARN="$(aws iam list-open-id-connect-providers \
  --query "OpenIDConnectProviderList[?contains(Arn, '${OIDC_HOST}')].Arn" --output text 2>/dev/null || true)"
if [ -z "$OIDC_ARN" ] || [ "$OIDC_ARN" = "None" ]; then
  OIDC_ARN="$(aws iam create-open-id-connect-provider \
    --url "$OIDC_ISSUER" --client-id-list sts.amazonaws.com \
    --query 'OpenIDConnectProviderArn' --output text)"
fi

ESO_ROLE_NAME="${CLUSTER}-eso"
ESO_TRUST="$(python3 -c "import json,sys; print(json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Federated':sys.argv[1]},'Action':'sts:AssumeRoleWithWebIdentity','Condition':{'StringEquals':{sys.argv[2]+':sub':'system:serviceaccount:external-secrets:external-secrets',sys.argv[2]+':aud':'sts.amazonaws.com'}}}]}))" "$OIDC_ARN" "$OIDC_HOST")"
if aws iam get-role --role-name "$ESO_ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ESO_ROLE_NAME" --policy-document "$ESO_TRUST" >/dev/null
else
  aws iam create-role --role-name "$ESO_ROLE_NAME" --assume-role-policy-document "$ESO_TRUST" >/dev/null
fi
ESO_ROLE_ARN="$(aws iam get-role --role-name "$ESO_ROLE_NAME" --query 'Role.Arn' --output text)"
cat > "$WORK_DIR/eso-policy.json" <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["secretsmanager:GetSecretValue","secretsmanager:DescribeSecret"],"Resource":"arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:${SM_PREFIX}/*"}]}
JSON
aws iam put-role-policy --role-name "$ESO_ROLE_NAME" --policy-name eso-read --policy-document "file://$WORK_DIR/eso-policy.json" >/dev/null

echo "==> install External Secrets Operator"
helm repo add external-secrets https://charts.external-secrets.io >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true
helm_ upgrade --install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace \
  --set installCRDs=true --timeout 10m >/dev/null
kubectl -n external-secrets annotate sa external-secrets \
  eks.amazonaws.com/role-arn="$ESO_ROLE_ARN" --overwrite >/dev/null
kubectl -n external-secrets rollout restart deploy/external-secrets >/dev/null
kubectl -n external-secrets rollout status deploy/external-secrets --timeout=300s >/dev/null

cat > "$WORK_DIR/eso-secretstore.yaml" <<YAML
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: $SECRETSTORE
spec:
  provider:
    aws:
      service: SecretsManager
      region: $AWS_REGION
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets
            namespace: external-secrets
YAML
kubectl apply -f "$WORK_DIR/eso-secretstore.yaml" >/dev/null

echo "==> migrate Kubernetes secrets -> Secrets Manager"
ESO_MANIFESTS="$WORK_DIR/eso-externalsecrets.yaml"
: > "$ESO_MANIFESTS"
for ref in \
  control/cogbox-infra \
  control/cogbox-s3 \
  control/keycloak-admin \
  control/keycloak-smtp \
  control/cogbox-eks-secrets \
  region-shared/region-shared-creds; do
  ns="${ref%%/*}"; name="${ref##*/}"
  if ! kubectl -n "$ns" get secret "$name" >/dev/null 2>&1; then
    echo "    skip $ns/$name (missing)"
    continue
  fi
  payload="$(mktemp)"
  kubectl -n "$ns" get secret "$name" -o json | python3 -c '
import base64, json, sys
d = json.load(sys.stdin)
out = {}
for k, v in (d.get("data") or {}).items():
    out[k] = base64.b64decode(v).decode("utf-8", "surrogateescape")
json.dump(out, sys.stdout)
' > "$payload"
  if aws secretsmanager describe-secret --region "$AWS_REGION" --secret-id "$SM_PREFIX/$ns/$name" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --region "$AWS_REGION" \
      --secret-id "$SM_PREFIX/$ns/$name" --secret-string "file://$payload" >/dev/null
  else
    aws secretsmanager create-secret --region "$AWS_REGION" \
      --name "$SM_PREFIX/$ns/$name" --secret-string "file://$payload" >/dev/null
  fi
  rm -f "$payload"
  cat >> "$ESO_MANIFESTS" <<YAML
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: $name
  namespace: $ns
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: $SECRETSTORE
    kind: ClusterSecretStore
  target:
    name: $name
    creationPolicy: Merge
    deletionPolicy: Retain
  dataFrom:
    - extract:
        key: $SM_PREFIX/$ns/$name
YAML
  echo "    synced $ns/$name"
done

kubectl apply -f "$ESO_MANIFESTS" >/dev/null

echo "==> wait for ExternalSecrets"
for i in $(seq 1 60); do
  notready="$(kubectl get externalsecret -A -o json 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin)
bad=[]
for x in d.get("items",[]):
    conds={c.get("type"):c.get("status") for c in (x.get("status",{}).get("conditions") or [])}
    if conds.get("Ready")!="True": bad.append(x["metadata"]["namespace"]+"/"+x["metadata"]["name"])
print(" ".join(bad))
')"
  [ -z "$notready" ] && break
  echo "    pending: $notready"
  sleep 5
done
kubectl get externalsecret -A

# Refresh consumers so they pick up ESO-owned values.
echo "==> restart consumers"
kubectl -n control rollout restart deploy/control-control-api deploy/keycloak deploy/registry >/dev/null 2>&1 || true
kubectl -n region-shared rollout restart deploy/region-shared-proxy deploy/region-shared-snapshots deploy/region-shared-ssh-gateway >/dev/null 2>&1 || true
kubectl -n region-shared rollout restart ds/region-shared-runner >/dev/null 2>&1 || true
kubectl -n control rollout status deploy/control-control-api --timeout=600s >/dev/null || true
kubectl -n control rollout status deploy/keycloak --timeout=600s >/dev/null || true
kubectl -n control rollout status deploy/registry --timeout=300s >/dev/null || true

echo
echo "OK: secrets are in AWS Secrets Manager and synced by ESO"
echo "    prefix: $SM_PREFIX"
