# k3s dev track (cogboxdev.pazity.com, box `kk-hpzhan66prog1`)

Single-node k3s deployment. Mirrors the GCP flow (`deploy/gcp`), adapted:
runner uses its **internal dind** (no host docker.sock), TLS via
cert-manager DNS-01, LAN-only DNS (`change-ip.sh` handles DHCP moves).

## Bring-up order (fresh box)

```bash
export KUBECONFIG=~/.kube/k3s-dev-config   # from the box: sudo cat /etc/rancher/k3s/k3s.yaml

# 0. Secrets FIRST (idempotent, never rotates working creds).
#    Region API keys are DERIVED from the control secret — see the header
#    of bootstrap-secrets.sh for the rule that prevents 401-class outages.
./deploy/dev/k3s/bootstrap-secrets.sh

# 1. Storage alias so GKE-written manifests apply unchanged.
kubectl apply -f deploy/dev/k3s/storageclass-standard.yaml

# 2. In-cluster data services (postgres/redis/registry/rustfs/maildev).
kubectl apply -f deploy/gcp/manifests/infra.yaml

# 3. Keycloak (dev hostnames) + ingress. Realm imports on FIRST boot only;
#    later redirectUris changes go through the Admin API (see step 6).
kubectl apply -f deploy/dev/k3s/keycloak.yaml
kubectl apply -f deploy/dev/k3s/keycloak-ingress.yaml

# 4. cert-manager + wildcard-dns01 / public-http01 issuers (GCP 60-tls.sh).

# 5. Workloads (control + region) + helpers. Re-run any time (no version bump).
./deploy/dev/k3s/apply.sh            # use deploy.sh <tag> for version bumps
```

`apply.sh` also applies `registry-alias.yaml` (region-dev `registry:6000`
-> control registry) and `runner-service.yaml` (stable runner FQDN).

## Region registration (fresh install only)

Region/keys come from the API, then into the secret via env:

```bash
# POST /api/regions  -> proxyUrl, sshGatewayUrl, snapshotManagerUrl,
#                       proxyApiKey, sshGatewayApiKey, SNAP_USER/SNAP_PASS
# POST /api/admin/runners (ADMIN_API_KEY from control secret) -> RUNNER_TOKEN
SNAP_USER=... SNAP_PASS=... RUNNER_TOKEN=... ./deploy/dev/k3s/bootstrap-secrets.sh
```

## Invariants to verify after any change

```bash
# region URLs must be https (mixed-content + toolbox base derive from these)
psql> SELECT id, "proxyUrl", "toolboxProxyUrl" FROM region;
# runner address must be the FQDN, never a pod IP (survives restarts)
psql> SELECT name, domain, "apiUrl" FROM runner;
# keycloak client redirectUris must cover the proxy hosts
# (Keycloak '*' matches ONE dns label only):
#   https://proxy.cogboxdev.pazity.com/*, https://*.proxy.cogboxdev.pazity.com/*
```

## Gotchas (paid for in incidents)

- `runner.hostPaths.dockerSock` stays `false`: with a host socket the
  daemon bind-mounts (`daemon-amd64:/usr/local/bin/cogbox:ro`) resolve on
  the HOST fs and dockerd mkdirs them into directories.
- Do NOT hand-create a `registry` Deployment/Service in `region-dev`:
  the short name must resolve to the control registry (alias file above).
- `region.proxyUrl`/`toolboxProxyUrl` are separate DB columns; the API
  `update()` writes both, so never patch one by hand without the other
  (plus `DEL toolbox-proxy-url:region:<id>` in redis).
- Keycloak realm ConfigMap changes do not re-import (use Admin API).
- Snapshot images live in the control registry (30Gi PVC), durably.
