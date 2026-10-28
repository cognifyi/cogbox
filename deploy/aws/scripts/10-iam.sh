#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 10: IAM + S3. Cluster role, node role, and the static S3 principal the API
# and runner use (the API requires static keys today; IRSA is a follow-up).
# Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws python3
load_state
: "${ACCOUNT_ID:?run 00-preflight.sh first}"
: "${BUCKET:?run 00-preflight.sh first}"

CLUSTER_ROLE="$CLUSTER-cluster"
NODE_ROLE="$CLUSTER-node"
S3_USER="$CLUSTER-s3"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

echo "==> IAM: cluster role ($CLUSTER_ROLE)"
cat > "$tmp/cluster-trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"eks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
if ! aws iam get-role --role-name "$CLUSTER_ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$CLUSTER_ROLE" \
    --assume-role-policy-document "file://$tmp/cluster-trust.json" \
    --tags Key=app,Value=cogbox Key=purpose,Value=eks-validation >/dev/null
  echo "    created"
else
  echo "    exists"
fi
aws iam attach-role-policy --role-name "$CLUSTER_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy >/dev/null

echo "==> IAM: node role ($NODE_ROLE)"
cat > "$tmp/node-trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
if ! aws iam get-role --role-name "$NODE_ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$NODE_ROLE" \
    --assume-role-policy-document "file://$tmp/node-trust.json" \
    --tags Key=app,Value=cogbox Key=purpose,Value=eks-validation >/dev/null
  echo "    created"
else
  echo "    exists"
fi
for p in AmazonEKSWorkerNodePolicy AmazonEC2ContainerRegistryReadOnly AmazonEKS_CNI_Policy; do
  aws iam attach-role-policy --role-name "$NODE_ROLE" \
    --policy-arn "arn:aws:iam::aws:policy/$p" >/dev/null
done

# Node groups are self-managed (the account SCP denies ec2:CreateFleet, which
# EKS managed node groups require), so the role needs an instance profile that
# a launch template can reference.
if ! aws iam get-instance-profile --instance-profile-name "$NODE_ROLE" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$NODE_ROLE" >/dev/null
  echo "    instance profile created"
else
  echo "    instance profile exists"
fi
if ! aws iam get-instance-profile --instance-profile-name "$NODE_ROLE" \
  --query 'InstanceProfile.Roles[].RoleName' --output text | grep -qw "$NODE_ROLE"; then
  aws iam add-role-to-instance-profile --instance-profile-name "$NODE_ROLE" \
    --role-name "$NODE_ROLE" >/dev/null
  echo "    role added to instance profile"
fi

echo "==> S3 principal ($S3_USER)"
cat > "$tmp/s3-policy.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListAll",
      "Effect": "Allow",
      "Action": ["s3:ListAllMyBuckets", "s3:GetAccountPublicAccessBlock"],
      "Resource": "*"
    },
    {
      "Sid": "BucketLifecycle",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket", "s3:DeleteBucket", "s3:GetBucketLocation",
        "s3:ListBucket", "s3:ListBucketMultipartUploads",
        "s3:GetBucketTagging", "s3:PutBucketTagging",
        "s3:GetBucketVersioning", "s3:PutBucketVersioning",
        "s3:GetBucketPublicAccessBlock", "s3:PutBucketPublicAccessBlock"
      ],
      "Resource": "arn:aws:s3:::cogbox-*"
    },
    {
      "Sid": "ObjectLifecycle",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject", "s3:PutObject", "s3:DeleteObject",
        "s3:GetObjectTagging", "s3:PutObjectTagging", "s3:DeleteObjectTagging",
        "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::cogbox-*/*"
    }
  ]
}
JSON
if ! aws iam get-user --user-name "$S3_USER" >/dev/null 2>&1; then
  aws iam create-user --user-name "$S3_USER" \
    --tags Key=app,Value=cogbox Key=purpose,Value=eks-validation >/dev/null
  echo "    user created"
else
  echo "    user exists"
fi
aws iam put-user-policy --user-name "$S3_USER" \
  --policy-name "${S3_USER}-s3" --policy-document "file://$tmp/s3-policy.json"

if [ -z "${S3_ACCESS_KEY_ID:-}" ] || [ -z "${S3_SECRET_ACCESS_KEY:-}" ]; then
  # The API demands static credentials (S3_ACCESS_KEY/S3_SECRET_KEY). Create
  # one access key and persist it in .work/aws.env (mode 0600).
  if ! aws iam create-access-key --user-name "$S3_USER" --output json > "$tmp/ak.json" 2>"$tmp/ak.err"; then
    if grep -q LimitExceeded "$tmp/ak.err"; then
      echo "    access-key limit reached; rotating existing keys"
      for k in $(aws iam list-access-keys --user-name "$S3_USER" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
        aws iam delete-access-key --user-name "$S3_USER" --access-key-id "$k"
      done
      aws iam create-access-key --user-name "$S3_USER" --output json > "$tmp/ak.json"
    else
      cat "$tmp/ak.err" >&2; exit 1
    fi
  fi
  S3_ACCESS_KEY_ID="$(jsonget "['AccessKey']['AccessKeyId']" < "$tmp/ak.json")"
  S3_SECRET_ACCESS_KEY="$(jsonget "['AccessKey']['SecretAccessKey']" < "$tmp/ak.json")"
  echo "    access key created"
else
  echo "    access key reused from state"
fi

echo "==> S3 bucket ($BUCKET)"
if ! aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  aws s3api create-bucket --bucket "$BUCKET" \
    --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  echo "    created"
else
  echo "    exists"
fi
aws s3api put-bucket-tagging --bucket "$BUCKET" \
  --tagging 'TagSet=[{Key=app,Value=cogbox},{Key=purpose,Value=eks-validation}]' 2>/dev/null || true

CLUSTER_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$CLUSTER_ROLE"
NODE_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$NODE_ROLE"
NODE_INSTANCE_PROFILE="$NODE_ROLE"
save_state \
  "CLUSTER_ROLE_ARN=$CLUSTER_ROLE_ARN" \
  "NODE_ROLE_ARN=$NODE_ROLE_ARN" \
  "NODE_INSTANCE_PROFILE=$NODE_INSTANCE_PROFILE" \
  "S3_USER=$S3_USER" \
  "S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID" \
  "S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY" \
  "BUCKET=$BUCKET"

echo
echo "OK: IAM roles + S3 bucket ready"
echo "    cluster role: $CLUSTER_ROLE_ARN"
echo "    node role:    $NODE_ROLE_ARN"
echo "    bucket:       s3://$BUCKET"
