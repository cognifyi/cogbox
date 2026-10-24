# GKE production runbook (cogbox.pazity.com)

```
deploy/
  gcp/
    README.md                 this runbook
    scripts/                  runnable steps (lib.sh + 00/10/20/25/30/31/40)
      00-project.sh           select project + enable APIs
      10-cluster-create.sh    Standard zonal cluster, two Spot pools (app + runner), 40G pd-standard boot disks
      20-get-credentials.sh   kubeconfig for kubectl/helm
      25-runner-tokens.sh     one control-plane runner token per replica (statefulset mode)
      30-park.sh / 31-wake.sh scale both pools to 0 / back to 1
      40-dns.sh               Cloudflare A records (DNS-only) for cogbox + wildcards
    values-control-pazity.yaml  control overlay (fill REPLACE_ME: Cloud SQL, Memorystore, GCS, registry)
    values-region-pazity.yaml   shared-region overlay (proxy hosts, 30Gi standard storage)
```

## 0. Login (human does this — browser required)

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable container.googleapis.com compute.googleapis.com \
  iam.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com
```

Needed IAM on the operator: **Kubernetes Engine Admin** + **Compute Admin**
(+ **Service Account User** if cluster uses a custom service account, and
**Secret Manager Admin** to create runner/vendor secrets).

## 1. Create the Standard cluster (two Spot pools)

Runnable: `scripts/10-cluster-create.sh` (after `scripts/00-project.sh`).
It creates an **app pool** (GKE's `default-pool`, labeled
`cogbox.io/pool=standard`, autoscale 1–2) and a **runner pool**
(`runner-pool`, labeled `cogbox.io/pool=runner`, tainted
`cogbox.io/runner=NoSchedule`, autoscale 0–5). Both use Spot VMs. It also
creates a Cloud Router/NAT for private-node egress (image pulls, external
APIs). The script is idempotent: an existing cluster is kept and a missing
runner pool or NAT is added.

Equivalent manual commands (boot disks 40G pd-standard — system disk only;
app storage is claimed later at service init, section 3):

```bash
gcloud container clusters create cogbox-prod \
  --zone us-west4-b \
  --machine-type e2-standard-4 \
  --spot \
  --node-labels cogbox.io/region=shared,cogbox.io/pool=standard \
  --num-nodes 1 \
  --enable-autoscaling --min-nodes 1 --max-nodes 2 \
  --disk-size 40 --disk-type pd-standard \
  --quiet

gcloud container node-pools create runner-pool \
  --cluster cogbox-prod --zone us-west4-b \
  --machine-type e2-standard-4 \
  --spot \
  --node-labels cogbox.io/region=shared,cogbox.io/pool=runner \
  --node-taints cogbox.io/runner=NoSchedule:NoSchedule \
  --num-nodes 1 \
  --enable-autoscaling --min-nodes 0 --max-nodes 5 \
  --disk-size 40 --disk-type pd-standard \
  --quiet

# Private nodes need NAT for Docker Hub / other non-Google egress.
gcloud compute routers create cogbox-router --network default --region us-west4
gcloud compute routers nats create cogbox-nat --router cogbox-router \
  --region us-west4 --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges

gcloud container clusters get-credentials cogbox-prod --zone us-west4-b
```

Notes:

- `--spot` = Spot VMs (up to ~60-90% cheaper; 30s preemption notice, max 24h
  lifetime). Both pools are Spot; the taint keeps application pods off the
  runner pool, so a runner preemption cannot take the API down with it.
- `e2-standard-4` gives 4 vCPU / 16 GiB per node. A runner reserves
  `1c/2Gi`, leaving room for roughly three 1c/1Gi sandboxes per runner node.
  Use `APP_MACHINE` / `RUNNER_MACHINE` to override.
- Node labels are set at pool creation (`--node-labels`), not by hand, so
  autoscaler-created nodes inherit them. The region overlay selects
  `cogbox.io/pool=runner` for the runner workload.
- `--min-nodes 1` keeps the control plane available; the runner pool can
  drain to 0. Nodes hosting kube-system pods may linger — see parking below
  for true zero.

## 2. Park to zero when idle / wake on demand

Runnable: `scripts/30-park.sh` / `scripts/31-wake.sh`. The scripts scale
workloads first, then set both pools to max 0 and resize to 0. Wake restores
app 1–2 / runner 0–5 and brings one node of each pool up. Manual equivalents:

```bash
# Park: both pools to 0 (system pods go Pending; harmless while idle)
for pool in default-pool runner-pool; do
  gcloud container node-pools update "$pool" --cluster cogbox-prod \
    --zone us-west4-b --enable-autoscaling --min-nodes 0 --max-nodes 0 --quiet
  gcloud container clusters resize cogbox-prod \
    --node-pool "$pool" --num-nodes 0 --zone us-west4-b --quiet
done

# Wake: app 1-2, runner 0-5; bring one node of each pool up
gcloud container node-pools update default-pool --cluster cogbox-prod \
  --zone us-west4-b --enable-autoscaling --min-nodes 1 --max-nodes 2 --quiet
gcloud container node-pools update runner-pool --cluster cogbox-prod \
  --zone us-west4-b --enable-autoscaling --min-nodes 0 --max-nodes 5 --quiet
gcloud container clusters resize cogbox-prod \
  --node-pool default-pool --num-nodes 1 --zone us-west4-b --quiet
gcloud container clusters resize cogbox-prod \
  --node-pool runner-pool --num-nodes 1 --zone us-west4-b --quiet
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

## 6. Known gaps and operational notes

### 6.1 Runner sandbox persistence ("No such container" on start)

Symptom (before this change): after a runner pod restarted, the sandboxes it
hosted could no longer be started — `STOP`/`START` jobs failed with `cannot
kill container ... No such container`. The control plane still tracked the
sandbox, so it surfaced as `error` instead of being recreated.

Cause: sandbox containers live in the runner's Docker data root
(`/var/lib/docker`), and nothing persisted it. The region chart defaulted to
host-Docker mode (`runner.hostPaths.dockerSock.enabled: true`), but the
`runtime-installer` init container is a placeholder and GKE's default
Container-Optimized OS (`cos_containerd`) has no package manager or `dockerd`.

GCP production now uses **Path B** in `values-region-pazity.yaml`:

```yaml
runner:
  hostPaths:
    dockerSock:
      enabled: false
    varLibDocker:
      enabled: true
```

The runner image already starts its own `dockerd`; the chart skips the
runtime-installer init container when the host socket is disabled, and mounts
a node-local `hostPath` at `/var/lib/docker`. Sandbox containers therefore
survive a runner **container/pod restart on the same node** (for example, a
pod deleted and recreated while the node keeps its `hostPath`). It is
node-local: it does **not** survive a rollout/reschedule to another node, a
node drain, or node replacement (Spot preemption, park/wake resize,
autoscaler scale-in). Surviving node loss needs object-storage backups plus a
control-plane restore path (application code, out of scope here).

The StatefulSet uses `updateStrategy: OnDelete`, so an image upgrade does not
silently move a busy runner to another node. Drain/stop sandboxes, delete the
runner pod, then let it be recreated.

Path A (host Docker on an Ubuntu node pool, XFS project quotas, Sysbox) is
still the option for per-sandbox disk quota and stronger isolation; it
requires a real `install-runtime.sh` and a non-COS node image.

### 6.2 Runner capacity autoscaling

The region overlay sets `runner.mode: statefulset` and
`runner.autoscaler.enabled: true` (max 5 replicas). StatefulSet pods have
stable ordinals and each ordinal gets its **own** control-plane Runner:

- `token-0..token-4` live in the `<release>-runner-tokens` Secret.
- Pod ordinal N reads `token-N` via the `token-selector` init container.
- The control plane keys a Runner by API key, so replicas must never share a
  token: they would overwrite the same `domain`/`apiUrl`/metrics and jobs
  could run on the wrong node.

Provision the tokens after the control plane is up and the shared region is
registered, before installing the region chart:

```bash
PROJECT=<gcp-project> \
REGION_ID=<shared-region-uuid> \
ADMIN_API_KEY=<system-admin-api-key> \
./scripts/25-runner-tokens.sh
```

The script calls `POST /api/admin/runners` once per replica (`runner-0..4`),
stores the returned key in Secret Manager as
`<release>-runner-token-N`, and is safe to re-run (existing secrets are
skipped). `RUNNER_COUNT` must match `runner.autoscaler.maxReplicas` (5).
The chart's ExternalSecret maps those to `token-0..4`; wait for it to be
`Ready` before the StatefulSet starts.

The runner StatefulSet uses `hostPort` 3003/2220, so Kubernetes schedules at
most one runner per node; pending runner pods make Cluster Autoscaler grow
`runner-pool` (0–5 nodes).

A CronJob (`region-shared-runner-autoscaler`, every minute) queries each
runner's **authenticated** `/info` endpoint (`Authorization: Bearer token-N`),
sums `currentAllocatedCpu`, and scales the StatefulSet up by one when
allocated CPU reaches `currentReplicas * cpuPerRunner * targetUtilization`
(default `3 * 0.8`). The CronJob mounts the token Secret, so it needs no
control-plane admin key and no `secrets` RBAC. The `alpine/k8s` image ships
kubectl/curl/jq; keep its minor version within one of the cluster API server.
It never scales from zero (park stays parked) and never scales down: deleting
a runner pod can kill a runner that is hosting sandboxes. To shrink,
drain/stop sandboxes first, then
`kubectl scale statefulset region-shared-runner --replicas=N` (or use
`30-park.sh`).

When `runner.autoscaler.enabled=true`, the chart omits `spec.replicas` so a
`helm upgrade` does not reset the count owned by the autoscaler/park scripts;
the StatefulSet defaults to 1 on first install. `30-park.sh` suspends the
CronJob and scales to 0; `31-wake.sh` scales back to 1 and resumes it.

Token rotation: create a new Runner with a new token, update the
`<release>-runner-token-N` secret, delete the pod (it re-registers with the
new key), then delete the old Runner record. Switching an existing release
from `deployment` to `statefulset` requires deleting the old Deployment first
(the resource kind cannot be changed in place).

### 6.3 Object storage (GCS) status

- The prod overlays still carry placeholders: `values-control-pazity.yaml`
  (`s3.defaultBucket: REPLACE_ME_GCS_BUCKET`, `registry.*:
  REPLACE_ME_ARTIFACT_REGISTRY_*`) and `values-region-pazity.yaml`
  (`AWS_DEFAULT_BUCKET: REPLACE_ME_GCS_REGION_BUCKET`).
- GCS XML interop rejects the AWS SDK v3 synthetic `x-id` query parameter.
  `s3.disableXId: true` (mapped to `S3_DISABLE_X_ID`) strips it; AWS S3 keeps
  the default (`false`). The GCP control overlays enable it, and the API
  returns the flag to the TypeScript/Go SDKs via the push-access response.
- Remaining GCS gaps: the checksum header may still need separate handling,
  and push-access credentials still use AWS STS `AssumeRole`, which GCS does
  not implement. The API's own S3 client uses static HMAC keys, so x-id no
  longer blocks `VolumeManager.testConnection()`, but SDK snapshot uploads
  through push access need a different credential path.
- rustfs cannot front GCS: it has no GCS backend (its gateway/tier features
  are tiering + site replication, and it stores to its own disks), so it is a
  self-hosted object store, not a GCS proxy.
- In TEST, rustfs backs runner volumes (`manifests/runner-shared.yaml`) but
  its data is `emptyDir` -> ephemeral. Deploy-only mitigation: give rustfs a
  `standard` PVC (RWO) instead of `emptyDir`.

**Decision:** x-id is fixed, but GCS is not fully usable for SDK push access
until credential issuance (and any checksum differences) are addressed. If
production instead uses in-cluster rustfs (or another S3-compatible endpoint)
and the overlays are changed accordingly, no GCS code change is required for
this deployment.
