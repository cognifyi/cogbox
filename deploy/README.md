# Production deployment bundle

Multitenant production deployment for Cogbox. Two Helm charts plus a
hardened Compose file for the pilot stage. Everything here is referenced by
the [Multitenant Production Deployment](../apps/docs/src/content/docs/en/multitenant-production.mdx) guide.

```
deploy/
  helm/cogbox-control/      control plane: API + migrations + ingress (HA, 1x per platform)
    values.yaml             cloud-agnostic defaults (quotas ON, rate limits ON)
    values-gcp.yaml         GCP landing-zone overrides (Cloud SQL, Memorystore, GCS)
  helm/cogbox-region/       data plane: proxy + snapshot-manager + runner pool + SSH gateway
    values.yaml             one release PER REGION (shared / dedicated / custom)
    values-gcp-shared.yaml  GCP shared-region example (GKE Standard, GCS, regional PD)
  compose/
    docker-compose.control.yaml   pilot-stage control plane on a single host
    .env.example                  every secret/key the platform needs, in one place
```

## Pilot path (single host control plane + remote runners)

```bash
cp deploy/compose/.env.example deploy/compose/.env   # fill in for real
openssl rand -hex 32   # use for ENCRYPTION_KEY / ENCRYPTION_SALT / *_API_KEY

docker compose -f deploy/compose/docker-compose.control.yaml \
  --env-file deploy/compose/.env up -d

# migrations run from the API image (same toolchain as CI release jobs)
docker compose -f deploy/compose/docker-compose.control.yaml \
  --env-file deploy/compose/.env run --rm api yarn migration:run:init
docker compose -f deploy/compose/docker-compose.control.yaml \
  --env-file deploy/compose/.env run --rm api yarn migration:run:pre-deploy
# ... start API, then:
docker compose -f deploy/compose/docker-compose.control.yaml \
  --env-file deploy/compose/.env run --rm api yarn migration:run:post-deploy
```

## Kubernetes path (production)

Control plane first, then one release per region:

```bash
helm upgrade --install control ./deploy/helm/cogbox-control \
  -n control --create-namespace -f deploy/helm/cogbox-control/values-gcp.yaml

# register the region at the control plane, store returned keys in Secret Manager
./scripts/register-region.sh shared-us   # (see docs §6.6 curl flow)

helm upgrade --install region-shared-us ./deploy/helm/cogbox-region \
  -n region-shared-us --create-namespace -f deploy/helm/cogbox-region/values-gcp-shared.yaml
```

Validate charts without a cluster:

```bash
helm lint deploy/helm/cogbox-control deploy/helm/cogbox-region
helm template ctl deploy/helm/cogbox-control -f deploy/helm/cogbox-control/values-gcp.yaml | grep -c '^kind:'
helm template region-shared-us deploy/helm/cogbox-region -f deploy/helm/cogbox-region/values-gcp-shared.yaml | grep -c '^kind:'
```

## Verified locally (kind, single node)

The full loop was exercised on `kind` and every bug found was fixed in the charts:

- Control: API + pre/post migration hooks, `/api/health` + authed `/api/health/ready`, `/api/config` serving OIDC/proxy-template/snapshot to region proxies, admin bootstrap, `POST /api/regions` issuing real `proxyApiKey`/`sshGatewayApiKey`/snapshot creds, admin runner registration, runner heartbeat → `ready` (score reported).
- Region: proxy boots with the real region key (`/health` ok), snapshot-manager + SSH gateway Running, runner DaemonSet schedules via node labels with node-pool tolerations.
- Bugs fixed along the way: hook-ordered ServiceAccount/ConfigMap/Secret (weight -10), checksum auto-rollout on values change, boot-required registry/proxy/snapshot keys, legacy global service keys, `OPENFEATURE_FORCE_ENABLED_FLAGS`, optional docker-sock mount, init-container ConfigMap mount, nsenter-via-stdin pattern, `RUNNER_DOMAIN` optional (region IDs aren't valid hostnames), Helm 3-way-merge poisoning by duplicate list entries.
- Known kind limits (not chart bugs): no Docker on kind nodes, so sandboxes can't actually execute there — runner registers and heartbeats fine; `LoadBalancer` stays Pending without MetalLB (use `ClusterIP` + port-forward locally).

## GCP landing zone (summary — full version in the docs guide)

| Need | GCP service | Notes |
| --- | --- | --- |
| Kubernetes | GKE **Standard** | Autopilot forbids privileged pods → runner DaemonSet requires Standard; taint runner pools `cogbox.io/runner=NoSchedule` |
| Postgres | Cloud SQL (private IP, HA) | `db.host` = private IP, TLS on + verify on |
| Redis | Memorystore (AUTH on) | `redis.host` = private IP |
| Object storage | GCS bucket + HMAC keys | `https://storage.googleapis.com`; snapshot-manager uses `filesystem` driver on regional PD by default |
| DNS + wildcard TLS | Cloud DNS + cert-manager `ClusterIssuer` DNS-01/CloudDNS | `proxy.` + `*.proxy.` records; DNS-only (no CDN proxying on the wildcard) |
| Images | Artifact Registry (or Docker Hub) | Pin `imageTag`, preferably `imageDigest` |
| Secrets | Secret Manager + External Secrets Operator | `secrets.useExternalSecrets=true`, store `secretstore-gcp` |
| Ingress | ingress-nginx + cert-manager | GCE ingress cannot do DNS-01 wildcards as flexibly |

## Secret inventory (where each key comes from)

Control plane (`<release>-control/*` in Secret Manager):

| Key | Consumer | Source |
| --- | --- | --- |
| `ENCRYPTION_KEY` / `ENCRYPTION_SALT` | API data protection | `openssl rand -hex 32`, generated once |
| `DB_PASSWORD` | API → Cloud SQL | Cloud SQL user password |
| `REDIS_PASSWORD` | API/proxy → Memorystore | Memorystore AUTH string |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | API → GCS | GCS HMAC keys of the platform service account |
| `TRANSIENT_REGISTRY_PASSWORD` | API → transient registry | Registry admin password |
| `INTERNAL_REGISTRY_PASSWORD` | API → internal registry | Registry admin password |
| `PROXY_API_KEY` | Legacy global proxy key (every API-key request compares first) | Single-region: = region key; multi-region: random |
| `SSH_GATEWAY_API_KEY` | Legacy global gateway key (same) | Same rule as above |
| `OIDC_CLIENT_SECRET` | API → IdP | IdP client page (empty for public clients) |
| `OIDC_MANAGEMENT_API_CLIENT_SECRET` | API → Auth0 M2M | Auth0 M2M app (only if IdP-backed user admin) |
| `SMTP_USER` / `SMTP_PASSWORD` | API → relay | SendGrid/SES/Mailgun |
| `OTEL_COLLECTOR_API_KEY` | API → collector | Generated once |
| `HEALTH_CHECK_API_KEY` | Probes → `/api/health/ready` | `openssl rand -hex 32` |
| `ADMIN_API_KEY` | Bootstrap admin | `openssl rand -hex 32`, rotate after use |

Per region (`<release>/*` in Secret Manager, from `POST /regions` + keygen):

| Key | Consumer | Source |
| --- | --- | --- |
| `PROXY_API_KEY` | Proxy → API (also secures preview cookies) | Region registration response |
| `SSH_API_KEY` | SSH gateway → API | Region registration / regenerate endpoint |
| `SNAP_USER` / `SNAP_PASS` | Snapshot-manager basic auth | Region registration response |
| `RUNNER_TOKEN` | Runner pool → API | Admin API (shared) / `POST /runners` (custom) |
| `SSH_PRIVATE_KEY` / `SSH_HOST_KEY` / `SSH_PUBLIC_KEY` | Gateway + runner pool | Generated keypair per region |
| `SNAP_S3_ACCESS_KEY` / `SNAP_S3_SECRET_KEY` | Snapshot-manager → bucket | Region bucket HMAC keys (only for `s3` driver) |

## Auth options (Auth0 is NOT required)

The API accepts any RS256 OIDC issuer via JWKS and JIT-provisions users/orgs.
Pick by operations, not protocol:

| Provider | Model | Use when | Note |
| --- | --- | --- | --- |
| Keycloak | Self-hosted (free) | Full control / data residency / no per-seat cost | Run HA on the same cluster; back up its DB |
| Auth0 | SaaS | Zero-ops login, social/enterprise connections | Needs M2M app + Management API scopes only for IdP-backed user admin |
| Entra ID / Google / Okta | SaaS workforce IdP | Company already standardizes on it | Okta `uid`/`sub` quirk already handled by the API |

Dex (sqlite, single static user) ships in evaluation Compose only — never production.
