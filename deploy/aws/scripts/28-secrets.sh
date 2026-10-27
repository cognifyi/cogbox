#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 28: install External Secrets Operator and sync secrets to AWS Secrets Manager
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm aws
load_state
: "${AWS_REGION:?}"
: "${CLUSTER:?}"

echo "==> install External Secrets Operator"
helm repo add external-secrets https://charts.external-secrets.io >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true
helm upgrade --install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace \
  --set installCRDs=true \
  --timeout 10m >/dev/null
kubectl rollout status deployment/external-secrets -n external-secrets --timeout=300s >/dev/null

echo "==> store secrets in AWS Secrets Manager"
SM_PREFIX="cogbox/${CLUSTER}"
put_sm() {
  local name="$1" val="$2"
  aws secretsmanager create-secret --name "$SM_PREFIX/$name" --secret-string "$val" --region "$AWS_REGION" >/dev/null 2>&1 || \
  aws secretsmanager put-secret-value --secret-id "$SM_PREFIX/$name" --secret-string "$val" --region "$AWS_REGION" >/dev/null
}

# ensure values exist
PG_PASS=$(kube -n control get secret cogbox-infra -o jsonpath='{.data.postgres-password}' 2>/dev/null | base64 -d 2>/dev/null || openssl rand -hex 16)
REDIS_PASS=$(kube -n control get secret cogbox-infra -o jsonpath='{.data.redis-password}' 2>/dev/null | base64 -d 2>/dev/null || openssl rand -hex 16)
KC_USER=$(kube -n control get secret keycloak-admin -o jsonpath='{.data.username}' 2>/dev/null | base64 -d 2>/dev/null || echo admin)
KC_PASS=$(kube -n control get secret keycloak-admin -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null || cat "$WORK_DIR/keycloak-admin-password.txt" 2>/dev/null || openssl rand -hex 24)
KC_SMTP_HOST=$(kube -n control get secret keycloak-smtp -o jsonpath='{.data.host}' 2>/dev/null | base64 -d 2>/dev/null || echo maildev)
KC_SMTP_PORT=$(kube -n control get secret keycloak-smtp -o jsonpath='{.data.port}' 2>/dev/null | base64 -d 2>/dev/null || echo 1025)
KC_SMTP_FROM=$(kube -n control get secret keycloak-smtp -o jsonpath='{.data.from}' 2>/dev/null | base64 -d 2>/dev/null || echo noreply@$DOMAIN)
KC_SMTP_USER=$(kube -n control get secret keycloak-smtp -o jsonpath='{.data.user}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
KC_SMTP_PASS=$(kube -n control get secret keycloak-smtp -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null || echo "")

put_sm postgres-password "$PG_PASS"
put_sm redis-password "$REDIS_PASS"
put_sm keycloak-admin-username "$KC_USER"
put_sm keycloak-admin-password "$KC_PASS"
put_sm keycloak-smtp-host "$KC_SMTP_HOST"
put_sm keycloak-smtp-port "$KC_SMTP_PORT"
put_sm keycloak-smtp-from "$KC_SMTP_FROM"
put_sm keycloak-smtp-user "$KC_SMTP_USER"
put_sm keycloak-smtp-password "$KC_SMTP_PASS"

echo "==> create IRSA for ESO (use node role or create)"
# simple approach: use node instance profile via Pod Identity not required; create SA with role if exists
SA_ROLE_NAME="${CLUSTER}-eso"
POLICY_ARN="arn:aws:iam::aws:policy/SecretsManagerReadWrite"
aws iam get-role --role-name "$SA_ROLE_NAME" >/dev/null 2>&1 || \
aws iam create-role --role-name "$SA_ROLE_NAME" --assume-role-policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Federated\":\"arn:aws:iam::${ACCOUNT_ID}:oidc-provider/$(aws eks describe-cluster --name $CLUSTER --query 'cluster.identity.oidc.issuer' --output text | sed 's|https://||')\"},\"Action\":\"sts:AssumeRoleWithWebIdentity\",\"Condition\":{\"StringEquals\":{\"$(aws eks describe-cluster --name $CLUSTER --query 'cluster.identity.oidc.issuer' --output text | sed 's|https://||'):sub\":\"system:serviceaccount:external-secrets:external-secrets\"}}}]}" >/dev/null 2>&1 || true
aws iam attach-role-policy --role-name "$SA_ROLE_NAME" --policy-arn "$POLICY_ARN" >/dev/null 2>&1 || true

ROLE_ARN=$(aws iam get-role --role-name "$SA_ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [ -n "$ROLE_ARN" ] && [ "$ROLE_ARN" != "None" ]; then
  kubectl -n external-secrets annotate sa external-secrets eks.amazonaws.com/role-arn="$ROLE_ARN" --overwrite >/dev/null 2>&1 || true
fi

cat > "$WORK_DIR/eso-secretstore.yaml" <<YAML
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secretsmanager
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

cat > "$WORK_DIR/eso-externalsecrets.yaml" <<YAML
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: cogbox-infra
  namespace: control
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: cogbox-infra
    creationPolicy: Owner
  data:
  - secretKey: postgres-password
    remoteRef:
      key: $SM_PREFIX/postgres-password
  - secretKey: redis-password
    remoteRef:
      key: $SM_PREFIX/redis-password
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: keycloak-admin
  namespace: control
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: keycloak-admin
    creationPolicy: Owner
  data:
  - secretKey: username
    remoteRef:
      key: $SM_PREFIX/keycloak-admin-username
  - secretKey: password
    remoteRef:
      key: $SM_PREFIX/keycloak-admin-password
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: keycloak-smtp
  namespace: control
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: keycloak-smtp
    creationPolicy: Owner
  data:
  - secretKey: host
    remoteRef:
      key: $SM_PREFIX/keycloak-smtp-host
  - secretKey: port
    remoteRef:
      key: $SM_PREFIX/keycloak-smtp-port
  - secretKey: from
    remoteRef:
      key: $SM_PREFIX/keycloak-smtp-from
  - secretKey: user
    remoteRef:
      key: $SM_PREFIX/keycloak-smtp-user
  - secretKey: password
    remoteRef:
      key: $SM_PREFIX/keycloak-smtp-password
YAML
kubectl apply -f "$WORK_DIR/eso-externalsecrets.yaml" >/dev/null

echo "OK: ESO installed and secrets synced from Secrets Manager"
