# GKE production runbook (cogbox.pazity.com)

```
deploy/
  gcp/
    README.md                 this runbook
    scripts/                  runnable steps (lib.sh + 00/10/20/30/31/40)
      00-project.sh           select project + enable APIs
      10-cluster-create.sh    Standard zonal cluster, Spot pool, autoscale 0-5, 40G pd-standard boot disks
      20-get-credentials.sh   kubeconfig for kubectl/helm
      30-park.sh / 31-wake.sh scale pool to 0 / back to 1
      40-dns.sh               Cloudflare A records (DNS-only) for cogbox + wildcards
    values-control-pazity.yaml  control overlay (fill REPLACE_ME: Cloud SQL, Memorystore, GCS, registry)
    values-region-pazity.yaml   shared-region overlay (proxy hosts, 30Gi standard storage)
```

## 0. Login (human does this — browser required)

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable container.googleapis.com compute.googleapis.com
```

Needed IAM on the operator: **Kubernetes Engine Admin** + **Compute Admin**
(+ **Service Account User** if cluster uses a custom service account).

## 1. Create the Standard cluster (single Spot pool, autoscale 0–5)

Runnable: `scripts/10-cluster-create.sh` (after `scripts/00-project.sh`).
Equivalent manual command (boot disks 40G pd-standard — system disk only;
app storage is claimed later at service init, section 3):

```bash
gcloud container clusters create cogbox-prod \
  --zone us-west4-b \
  --machine-type e2-standard-2 \
  --spot \
  --num-nodes 1 \
  --enable-autoscaling --min-nodes 0 --max-nodes 5 \
  --disk-size 40 --disk-type pd-standard \
  --quiet

gcloud container clusters get-credentials cogbox-prod --zone us-west4-b
```

Notes:

- `--spot` = Spot VMs (up to ~60-90% cheaper; 30s preemption notice, max 24h
  lifetime). Fine for a test pool and for runner pools; production splits a
  small regular system pool + Spot runner pools.
- `--min-nodes 0` lets the autoscaler drain to (near) zero when idle. Nodes
  hosting kube-system pods may linger — see parking below for true zero.
- Boot disks are 100G `pd-standard` (cheapest disk type).

## 2. Park to zero when idle / wake on demand

Runnable: `scripts/30-park.sh` / `scripts/31-wake.sh`. Manual equivalents:

```bash
# Park: everything to 0 (system pods go Pending; harmless while idle)
gcloud container clusters resize cogbox-prod \
  --node-pool default-pool --num-nodes 0 --zone us-west4-b --quiet

# Wake: back to 1, autoscaler takes it from there (1–5)
gcloud container clusters resize cogbox-prod \
  --node-pool default-pool --num-nodes 1 --zone us-west4-b --quiet
```

## 3. Persistent storage (claimed at service init, not cluster init)

App storage (snapshot-manager) is claimed by the region chart's PVC at
install time — nothing storage-related happens during cluster creation.
Cheapest durable option is the preinstalled `standard` StorageClass
(pd-standard zonal HDD); the pazity overlay starts at 30Gi:

```yaml
# values-region-pazity.yaml (excerpt)
snapshotManager:
  storage:
    driver: filesystem
    size: 30Gi
    storageClass: standard
```

Grow later without downtime (GKE `standard` allows expansion, ext4 resizes online):

```bash
kubectl patch pvc <claim-name> -n <region-ns> \
  -p '{"spec":{"resources":{"requests":{"storage":"60Gi"}}}}'
```

## 4. DNS (Cloudflare, DNS-only / grey cloud)

> Correction: DNS is managed by the **`cf`** CLI, not wrangler
> (`npm install --global cf` + `cf auth login`).
> Needed token permission: **Zone:DNS:Edit** on `pazity.com`.

After ingress-nginx is deployed, grab its external IP and run
`INGRESS_IP=<ip> scripts/40-dns.sh` (skips records that already match).
Manual equivalents (`cf` CLI — DNS is NOT wrangler; `cf auth login` first,
token needs **Zone:DNS:Edit** on `pazity.com`):

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Then (replace `INGRESS_IP`):

```bash
cf dns records create --zone pazity.com \
  --body '{"type":"A","name":"cogbox","content":"INGRESS_IP","ttl":120,"proxied":false}'
cf dns records create --zone pazity.com \
  --body '{"type":"A","name":"*.cogbox","content":"INGRESS_IP","ttl":120,"proxied":false}'
# Second-level wildcard: *.cogbox does NOT cover *.proxy.cogbox,
# which the region proxy needs for {{PORT}}-{{sandboxId}} previews:
cf dns records create --zone pazity.com \
  --body '{"type":"A","name":"*.proxy.cogbox","content":"INGRESS_IP","ttl":120,"proxied":false}'
```

`proxied:false` (grey cloud) is REQUIRED on all three: Cloudflare's edge
has no certificate for `*.proxy.*` depth and would break TLS handshakes;
Caddy/cert-manager terminates TLS at ingress instead.

Verify:

```bash
dig +short cogbox.pazity.com
dig +short proxy.cogbox.pazity.com
dig +short 3000-abc123.proxy.cogbox.pazity.com
# all three must return INGRESS_IP (never Cloudflare 104.x proxy IPs)
```

## 5. Telemetry (Grafana Cloud OTEL + PostHog US Cloud)

Control-plane telemetry flows `API -> in-cluster collector -> Grafana Cloud
OTLP`; product analytics goes direct to PostHog US Cloud. Both are already
wired in the chart (`deploy/helm/cogbox-control`); production only needs
secrets + the collector manifest.

```bash
# 5.1 Vendor credentials in Secret Manager (External Secrets reads
# `<release>-control/<KEY>`; <release> is your helm release name).
# Grafana Cloud: stack -> Connections -> OpenTelemetry (OTLP).
# PostHog: https://us.posthog.com -> Project settings -> Project API key.
# (The vendor OTLP endpoint itself is non-secret and lives in the
# observability collector Secret below; the API only talks to the
# in-cluster collector, so it needs no vendor URL.)
echo -n 'Authorization=Basic <base64(instanceId:apiToken)>' | gcloud secrets create <release>-control/OTEL_EXPORTER_OTLP_HEADERS --data-file=-
echo -n 'phc_...' | gcloud secrets create <release>-control/POSTHOG_API_KEY --data-file=-

# 5.2 Observability collector (same manifest as the dev track).
kubectl apply -f ../../dev/k3s/observability/otel-collector.yaml
kubectl -n observability create secret generic otel-vendor-creds \
  --from-literal=GRAFANA_OTLP_ENDPOINT='https://<region>.grafana.net/otlp' \
  --from-literal=GRAFANA_OTLP_AUTH='Basic <base64(instanceId:apiToken)>'

# 5.3 Verify: no `Exporting failed` in collector logs; traces for
# service `cogbox-api` appear in Grafana Tempo within ~1 min.
kubectl -n observability logs deploy/otel-collector --tail=20
```

Notes:

- Chart defaults are empty (= telemetry disabled), so clusters without
  these secrets behave exactly as before — no data leaves the cluster.
- The legacy upstream PostHog key (`phc_bYtE...` / CloudFront) was removed
  from `docker-compose`, docs, and default values; nothing reports to
  Daytona anymore.

## 6. Known gaps (not yet implemented)

### 6.1 Runner sandbox persistence ("No such container" on start)

Symptom: after a runner pod restarts, the sandboxes it hosts can no longer
be started — `STOP`/`START` jobs fail with `cannot kill container ... No
such container`. The control plane still tracks the sandbox, so it surfaces
as `error` instead of being recreated.

Cause: sandbox containers live in the runner's Docker data root
(`/var/lib/docker`), and nothing persists it:

- The region chart (`values-region-pazity.yaml` -> `runner-daemonset.yaml`)
  defaults to host-Docker mode (`runner.hostPaths.dockerSock.enabled: true`),
  but the `runtime-installer` init container runs `install-runtime.sh`, which
  is currently a **placeholder stub** — no Docker is installed on the nodes.
- GKE nodes use the default **Container-Optimized OS (`cos_containerd`)**,
  which has no package manager and no `dockerd`; GKE ships no Debian image.
  The upstream (Daytona) installer is apt/yum-based and therefore **cannot
  run on COS**.
- The only runner that runs today is the TEST `manifests/runner-shared.yaml`
  (internal dind, `emptyDir` for `/var/lib/cogbox`, no `/var/lib/docker`) —
  same bug on pod restart.

Dev/k3s fix (implemented in this branch): the region chart now supports
`runner.hostPaths.varLibDocker`, a node-local `hostPath` mounted at
`/var/lib/docker`, enabled in `deploy/dev/k3s/values-region-dev.yaml`. It
makes sandbox containers survive runner **pod** restarts/rollouts. It is
node-local: it does **not** survive **node** replacement (Spot preemption,
park/wake resize, autoscaler scale-in).

Options for cloud (deferred):

- **Path A (upstream/Daytona model).** Give runners a dedicated
  `UBUNTU_CONTAINERD` Spot node pool (GKE's only apt-based image — see the
  pool-split note in §1) and implement `install-runtime.sh` for real: install
  Docker, create a host-local XFS loopback for `/var/lib/docker` with project
  quotas (`prjquota`), write `{"icc": false, "live-restore": true}`, and
  refuse migration when `/var/lib/docker/containers` is non-empty. The XFS
  file must fit the 40G boot disk. Enables Sysbox isolation later.
- **Path B (quick, stays on COS).** Set `dockerSock.enabled: false` and
  `varLibDocker.enabled: true` in the GCP region overlay — same as k3s. No
  installer, no XFS, no Sysbox; per-sandbox disk quota is not enforced.

Either way, surviving **node** loss additionally needs object-storage backups
plus a control-plane restore path (application code, out of scope here).

### 6.2 Object storage (GCS) not usable yet

- The prod overlays still carry placeholders: `values-control-pazity.yaml`
  (`s3.defaultBucket: REPLACE_ME_GCS_BUCKET`, `registry.*:
  REPLACE_ME_ARTIFACT_REGISTRY_*`) and `values-region-pazity.yaml`
  (`AWS_DEFAULT_BUCKET: REPLACE_ME_GCS_REGION_BUCKET`).
- Even once filled, **GCS XML interop is incompatible with the API's AWS SDK
  v3 client** (`apps/api/src/sandbox/managers/volume.manager.ts` — a
  `forcePathStyle` `S3Client`): SDK v3's default `x-id` query parameter and
  checksum header are rejected by GCS with `InvalidArgument`, so the API
  fails at boot in `VolumeManager.testConnection()` (see the note in
  `manifests/infra.yaml`). Fixing this is a **code** change (SDK checksum
  config / middleware), not chart-only.
- rustfs cannot front GCS: it has no GCS backend (its gateway/tier features
  are tiering + site replication, and it stores to its own disks), so it is a
  self-hosted object store, not a GCS proxy.
- In TEST, rustfs backs runner volumes (`manifests/runner-shared.yaml`) but
  its data is `emptyDir` -> ephemeral. Deploy-only mitigation: give rustfs a
  `standard` PVC (RWO) instead of `emptyDir`.
