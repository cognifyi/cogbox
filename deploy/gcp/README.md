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
