# GKE production runbook (cogbox.pazity.com)

Zone: `us-west4-b` · machines: `e2-standard-2` · **Spot** · autoscale 0–5 ·
storage: 100Gi `standard` (pd-standard zonal, cheapest) ·
domain: `cogbox.pazity.com` + `*.cogbox.pazity.com` (Cloudflare DNS-only).

## 0. Login (human does this — browser required)

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable container.googleapis.com compute.googleapis.com
```

Needed IAM on the operator: **Kubernetes Engine Admin** + **Compute Admin**
(+ **Service Account User** if cluster uses a custom service account).

## 1. Create the Standard cluster (single Spot pool, autoscale 0–5)

```bash
gcloud container clusters create cogbox-prod \
  --zone us-west4-b \
  --machine-type e2-standard-2 \
  --spot \
  --num-nodes 1 \
  --enable-autoscaling --min-nodes 0 --max-nodes 5 \
  --disk-size 100 --disk-type pd-standard \
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

```bash
# Park: everything to 0 (system pods go Pending; harmless while idle)
gcloud container clusters resize cogbox-prod \
  --node-pool default-pool --num-nodes 0 --zone us-west4-b --quiet

# Wake: back to 1, autoscaler takes it from there (1–5)
gcloud container clusters resize cogbox-prod \
  --node-pool default-pool --num-nodes 1 --zone us-west4-b --quiet
```

## 3. 100G cheapest persistent storage

GKE preinstalls the `standard` StorageClass (pd-standard, zonal HDD —
lowest cost). Claim 100Gi from it (follows the node zone `us-west4-b`):

```yaml
# deploy/gcp/pvc-snapshots-100g.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: region-shared-snapshots
  namespace: region-shared
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: standard # pd-standard zonal = cheapest
  resources:
    requests: { storage: 100Gi }
```

```bash
kubectl apply -f deploy/gcp/pvc-snapshots-100g.yaml
```

Point the region chart at it via
`snapshotManager.storage.filesystem.existingClaim: region-shared-snapshots`
(or let the chart create its own 100Gi PVC with `storageClass: standard`).

## 4. DNS (Cloudflare, DNS-only / grey cloud)

> Correction: DNS is managed by the **`cf`** CLI, not wrangler
> (`npm install --global cf` + `cf auth login`).
> Needed token permission: **Zone:DNS:Edit** on `pazity.com`.

After ingress-nginx is deployed, grab its external IP:

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
