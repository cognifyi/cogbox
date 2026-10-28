# AWS EKS validation runbook

A deliberately small, self-contained EKS deployment used to validate the
control plane + shared region against **real AWS S3**. It mirrors
`deploy/gcp` and exists to answer two questions:

1. Does the S3 code path work against real S3 (the GCS XML-interop endpoint
   rejected the AWS SDK v3 serializer, which is what broke the GCP track)?
2. Does the chart set fit a minimal node footprint?

Like the GCP track this is **validation infrastructure, not production**:
single-AZ-ish resources, hostPath storage, static S3 keys, one runner node.

```
deploy/aws/
  README.md                     this runbook
  values-control-eks.yaml       control overlay (__DOMAIN__ / __BUCKET__ placeholders)
  values-region-eks.yaml        shared-region overlay (runner limits, real-S3 snapshot driver)
  manifests/
    infra.yaml                  Postgres / Redis / registry / maildev on hostPath
    keycloak.yaml               Keycloak + realm import + TLS ingress
    ingress-nginx-values.yaml   hostPort 80/443 (no ELB)
    cluster-issuers.yaml        cert-manager ClusterIssuers (Cloudflare DNS-01 + HTTP-01)
    ssh-entry.yaml              socat hostPort 2222 -> SSH gateway (NLB replacement)
  scripts/
    00-preflight.sh             account, plan, VPC, Spot capability, state file
    10-iam.sh                   cluster/node roles, instance profile, S3 user + bucket
    20-cluster.sh               EKS control plane, add-ons, self-managed node groups
    25-entry.sh                 allocate/associate the system-node Elastic IP + SG
    25-nlb.sh                   optional NLB path (blocked in this account; see below)
    26-dns.sh                   Cloudflare A records for the shared domain
    27-tls.sh                   cert-manager + Let's Encrypt issuers
    30-infra.sh                 ingress-nginx, data services, Keycloak (HTTPS)
    40-control.sh               control chart (migrations + API) against real S3
    50-region.sh                shared region registration, runner, SSH entry, chart
    60-verify.sh                health, Keycloak, runner, S3, snapshot→sandbox→exec E2E
    80-scale.sh                 scale the runner/system ASGs
    99-destroy.sh               delete everything (stops billing)
```

State (passwords, keys, rendered values) lives in `deploy/aws/.work/`
(git-ignored, mode 0700).

## 0. Prerequisites

- AWS CLI v2 **2.32+**, logged in (`aws login`, or `aws login --remote` on a
  headless box) with the target account/region.
- `kubectl`, `helm`, `openssl`, `ssh-keygen`, `python3`, `dig`.
- Default VPC with public subnets and DNS hostnames enabled.
- A project (account) that allows EKS, EC2, S3 and Cloudflare API access.
- A Cloudflare API token with `Zone.DNS:Edit` for `pazity.com`, stored in
  `deploy/aws/.work/cf-api-token` (mode 0600). The DNS zone is shared with the
  GCP track; never create/delete it, only the records below.

## 1. Pre-flight

```bash
./deploy/aws/scripts/00-preflight.sh
```

Writes `deploy/aws/.work/aws.env`. It records the account, default VPC/subnets,
bucket name and whether Spot is usable. Spot is probed with `RunInstances
--dry-run`, so nothing is launched.

## 2. Plan constraints found in this account

These shaped the design and will bite anyone re-running this on a FREE plan:

| Constraint | Effect |
|---|---|
| SCP denies `ec2:CreateFleet` | **EKS managed node groups cannot be used** — they stall in `CREATING`. The script uses self-managed Auto Scaling groups (`RunInstances`), with AL2023 `nodeadm` user data and an `aws-auth` mapping. |
| SCP denies Spot (`DenySpotMarketType`) | `capacityType=ON_DEMAND`. |
| Free plan allows only Free-Tier-eligible instance types | `t3.large`/`t3.xlarge` are rejected with _"instance type is not eligible for Free Tier"_. Eligible in `us-east-2`: `t3.micro/small`, `t4g.micro/small`, `t8i.micro/small`, `c7i-flex.large` (2c/4g), **`m7i-flex.large` (2c/8g)**. |
| No 4-vCPU eligible type | The runner pool gets its own `m7i-flex.large`; the runner pod limit is 1.9 CPU / 7 Gi (enough for dockerd + one 1 CPU sandbox). |
| 8 vCPU standard quota | 2 nodes × 2 vCPU = 4, leaving headroom for the operator box. |
| **ELB creation is denied account-wide** | `CreateLoadBalancer` returns `OperationNotPermitted` even though the NLB quota is 50. The public entry is a **system-node Elastic IP** (`25-entry.sh`), with ingress-nginx on hostPorts 80/443. `25-nlb.sh` is retained for accounts that later allow ELB. |
| AL2023 root is XFS with `noquota` | Docker rejects `--storage-opt size` ("overlay over xfs with 'pquota'"). `values-region-eks.yaml` puts dockerd's data root on a **30 GiB XFS loopback with `prjquota`**, persisted under `/var/lib/cogbox-docker`, so sandbox disk quotas work. |

On a PAID plan, set `SYSTEM_INSTANCE_TYPE` / `RUNNER_INSTANCE_TYPE`
(`t3.large` + `t3.xlarge` is the intended sizing) and delete the ASGs first:
`aws autoscaling delete-auto-scaling-group --auto-scaling-group-name … --force-delete`.

## 3. Cluster, public entry, DNS and TLS

```bash
./deploy/aws/scripts/10-iam.sh      # roles, instance profile, S3 user + bucket
./deploy/aws/scripts/20-cluster.sh  # ~10-15 min for the control plane
./deploy/aws/scripts/25-entry.sh    # EIP + security group
./deploy/aws/scripts/26-dns.sh      # Cloudflare A records
./deploy/aws/scripts/27-tls.sh      # cert-manager + Let's Encrypt issuers
```

`20-cluster.sh` is idempotent: it creates the control plane, installs
`vpc-cni`/`kube-proxy`/`coredns`, then two self-managed node groups:

| Pool | Type | Disk | Labels | Taints |
|---|---|---|---|---|
| system | `m7i-flex.large` (2c/8g) | 40 GiB gp3 | `cogbox.io/pool=standard`, `cogbox.io/role=system` | — |
| runner | `m7i-flex.large` (2c/8g) | 60 GiB gp3 | `cogbox.io/pool=runner`, `cogbox.io/role=runner` | `cogbox.io/runner=true:NoSchedule` |

It stores `DOMAIN=cogbox.pazity.com` in the state file. The public hostname
layout matches GCP:

- `cogbox.pazity.com` — API/dashboard
- `keycloak.cogbox.pazity.com`
- `proxy.cogbox.pazity.com` and `*.proxy.cogbox.pazity.com`
- `snapshots.cogbox.pazity.com`
- `ssh.cogbox.pazity.com` (port 2222)

`25-entry.sh` allocates an Elastic IP (idempotently reuses
`EIP_ALLOCATION_ID`), associates it with the system node's **primary ENI**, and
opens 80/443/2222/30222. EKS nodes have multiple ENIs, so the script uses
`--network-interface-id` rather than `--instance-id`.

> The EIP association is lost if the system ASG replaces the node. Re-run
> `25-entry.sh` and then `26-dns.sh` after a replacement.

`26-dns.sh` upserts grey-cloud A records for `cogbox.pazity.com`,
`*.cogbox.pazity.com` and `*.proxy.cogbox.pazity.com`. The account-wide
`*.pazity.com` Cloudflare Tunnel record remains for other names; the more
specific cogbox records win. Resolve checks query the zone's authoritative NS
because public resolvers may cache the old wildcard.

`27-tls.sh` installs cert-manager and two ClusterIssuers:
`public-http01` (Let's Encrypt HTTP-01) and `wildcard-dns01` (Cloudflare
DNS-01 for `*.proxy.cogbox.pazity.com`). The Cloudflare token is stored in the
`cloudflare-api-token` Secret in `cert-manager`.

## 4. In-cluster infrastructure

```bash
./deploy/aws/scripts/30-infra.sh
```

- ingress-nginx with `hostPort` 80/443 on the system node — **no ELB**.
- Postgres 18, Redis 7, `registry:2.8.2`, maildev (hostPath under
  `/var/lib/cogbox/*`, system node).
- Keycloak 26.8.0 in production mode against Postgres, TLS via
  `keycloak-tls`; realm `cogbox` redirect URIs are rewritten to HTTPS,
  including the wildcard proxy hosts.

## 5. Control plane and shared region

```bash
./deploy/aws/scripts/40-control.sh
./deploy/aws/scripts/50-region.sh
```

`40-control.sh` generates the `cogbox-eks-secrets` Secret (encryption keys,
registry/API keys, admin key) and renders `values-control-eks.yaml` with the
account's real bucket. The API's `VolumeManager` calls S3 `ListBuckets` at
boot, so a running API already proves S3 connectivity.

`50-region.sh` handles the built-in `shared` region directly in Postgres
(the org API does not update an existing region): proxy/toolbox/SSH/snapshot
URLs, API-key hashes, the three `docker_registry` rows, Redis cache
invalidation, runner registration, SSH keypairs, `region-shared-creds`, the
runner Service, the SSH NodePort fallback, the region chart and the SSH
`:2222` socat entry.

The runner chart sets `RESOURCE_LIMITS_DISABLED=false`; its entrypoint mounts
the loopback XFS with `prjquota` before dockerd starts, so sandbox disk quotas
(`disk: 5`) are enforced. The dind data survives runner pod restarts but not
node replacement.

## 6. Verify

```bash
./deploy/aws/scripts/60-verify.sh              # core checks + snapshot→sandbox→exec
SNAPSHOT=1 ./deploy/aws/scripts/60-verify.sh   # also upload a sandbox snapshot to S3
```

Checks: TLS certificates (`cogbox-api-tls`, `keycloak-tls`,
`proxy-wildcard-tls`, `snapshots-tls`), `/api/health`,
`/api/health/ready`, Keycloak discovery issuer, proxy `/health`, runner
heartbeat (`runner.state=ready` in Postgres), bucket existence, then:

1. create (or reuse) a snapshot from `cognifyi/sandbox:latest-slim`
   (1 CPU / 1 GiB / 5 GiB) and wait for `active` (the snapshot manager pulls
   to S3 asynchronously),
2. create a sandbox from it targeting the registered region,
3. wait for `started`,
4. POST `/sandboxes/<id>/toolbox/process/execute` on the runner
   (`region-shared-runner.region-shared.svc.cluster.local:3003`) and assert
   `cogbox-eks-ok` and the 5 GiB overlay in the output.

The API also creates the general `cognifyi/sandbox:latest-slim` snapshot at
startup once a runner is ready; a restart while the runner was still starting
logs `No runners are configured...` and is retried on the next API start.

## 7. Cost control

| Item | Approx. |
|---|---|
| EKS control plane | $0.10/hr (always) |
| 2 × `m7i-flex.large` on-demand | ~$0.19/hr |
| EBS gp3 (40 + 60 GiB) | ~$0.01/hr |
| **Total** | **~$0.30/hr** |

The control plane bills even with zero nodes, so scaling to zero does not stop
the meter — only teardown does.

```bash
./deploy/aws/scripts/80-scale.sh runner-off   # drop the expensive pool
./deploy/aws/scripts/80-scale.sh status
```

## 8. Teardown

```bash
CONFIRM=yes ./deploy/aws/scripts/99-destroy.sh
KEEP_EIP=1 CONFIRM=yes ./deploy/aws/scripts/99-destroy.sh   # keep the address
```

Deletes: helm releases (control + region namespaces) → managed node groups
(none by design) → ASGs (force, instances terminated) → Elastic IP (unless
`KEEP_EIP=1`) → optional NLB → launch templates → EKS cluster → kubeconfig
context → CloudWatch log group → instance profile/roles → S3 user (keys +
policies) → bucket (all versions) → `.work` only with `PURGE=1`.

Cloudflare A records are **not** deleted: the zone is shared with the GCP
track. Remove them manually only if both tracks are retired.

Then confirm nothing is left:

```bash
aws eks list-clusters
aws ec2 describe-instances --filters Name=instance-state-name,Values=running \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,LaunchTime]'
aws ec2 describe-addresses \
  --query 'Addresses[].[PublicIp,AllocationId,AssociationId]'
```

## 9. Known limitations / follow-ups

- **No ELB.** The account denies `CreateLoadBalancer`. The EIP + hostPort
  ingress is a single-node entry; replacing the system node requires re-running
  `25-entry.sh`. `25-nlb.sh` is ready for accounts where ELB works.
- **Static S3 credentials.** The API requires `S3_ACCESS_KEY`/`S3_SECRET_KEY`,
  so the track uses an IAM user. IRSA (`s3:GetObject` etc. on the node role)
  is the production follow-up, but it needs an API change.
- **hostPath storage.** Postgres/registry data lives on the system node's disk;
  scaling the system pool to 0 destroys it. Production: EBS CSI + gp3 PVCs,
  or RDS/ElastiCache.
- **One node per pool.** No autoscaling, no PDB/HPA, single API replica.
- **Runner capacity.** 2 vCPU / 8 GiB limits dind + roughly one small sandbox.
- **XFS loopback.** The runner's dind data root is a 30 GiB sparse XFS image
  with project quotas under `/var/lib/cogbox-docker`; it is node-local and not
  backed up.
- **Shared DNS/TLS.** `cogbox.pazity.com` and its subdomains are shared with
  the GCP track; only one cluster should be active at a time.
- `aws-auth` ConfigMap is still used for node authorization (`API_AND_CONFIG_MAP`
  mode); access entries are the modern alternative.
