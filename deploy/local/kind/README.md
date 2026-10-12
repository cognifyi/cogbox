# Local kind reproduction (TEST ONLY)

Reproduces the verified local deployment: kind cluster → control plane →
region with real registered keys → host Docker runner → snapshot + sandbox E2E.

Prereqs: `docker` (with access), `kind`, `kubectl`, `helm`, `openssl`, `python3`, `ssh-keygen`, `base64`.

```bash
./00-cluster.sh        # kind cluster + node labels
./10-control.sh        # infra (pg/redis/dex/registry/s3) + control chart; prints API URL
./20-region.sh         # POST /regions (real keys) + runner token + region chart install
REGION_ID=<id-from-20> RUNNER_DOMAIN=<cluster-routable-host-ip> ./30-runner-host.sh
```

Secrets are generated into `./local-work/` (gitignored) — never committed.
Image tags default to `v0.190.3` (override `IMAGE=...` for 30-; charts via `imageTag`).

## E2E after the scripts (admin key: `./local-work/admin-api-key.txt`)

```bash
A=$(cat local-work/admin-api-key.txt); ORG=<personal-org-id>; API=http://<node-ip>:30080
# snapshot from image (explicit tag; :latest is rejected)
curl -X POST $API/api/snapshots -H "Authorization: Bearer $A" \
  -H "X-Cogbox-Organization-ID: $ORG" -H 'Content-Type: application/json' \
  -d '{"name":"e2e","imageName":"cognifyi/sandbox:latest-slim"}'
# sandbox (target = region id), wait for started, then exec via the runner:
curl -X POST $API/api/sandbox ... -d '{"name":"e2e-1","snapshot":"e2e","target":"<region-id>"}'
curl -X POST http://<runner-ip>:3003/sandboxes/<sandbox-id>/toolbox/process/execute \
  -H "Authorization: Bearer <runner-token>" -d '{"command":"echo hi"}'
```

## Known local-test limits

- **Qubes/egress**: if kind nodes lose internet, image pulls fail — sideload or fix host FORWARD rules. Sandbox execution itself needs no internet beyond pulls.
- **Node→host blackhole** (observed under Qubes): cluster pods cannot dial host IPs. Workarounds used here: NodePorts (host→cluster direction, which works) and running the host runner on the kind bridge network with a static IP so the API can dial it back. `RUNNER_DOMAIN` must be cluster-routable — auto-detection may pick a VPN/tunnel interface.
- **Runner bridge subnet** is hardcoded `172.20.0.0/16` in the runner; clear squatters and delete stale bridges (`ip link del br-xxx` with zero endpoints) after each runner recreation.
- Snapshot `:latest` tags are rejected; admin personal orgs start with zero quotas (`quotas.admin` in the chart fixes fresh installs; otherwise `PATCH /api/organizations/:id/quota`).
- Snapshots are region-scoped (`regionId` at create); kind-runner sandbox execution additionally needs node egress + (optionally) Sysbox — the chart defaults `CONTAINER_RUNTIME` to empty (Docker default) for this reason.
