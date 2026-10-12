# Local kind reproduction (TEST ONLY)

Reproduces the verified local deployment: kind cluster → control plane →
region with real registered keys → host Docker runner → snapshot + sandbox E2E.

Prereqs: `docker` (with access), `kind`, `kubectl`, `helm`, `openssl`, `python3`, `ssh-keygen`, `base64`.

```bash
./00-cluster.sh        # kind cluster + node labels
./05-keycloak.sh       # Keycloak (realm import) + maildev; SMTP_* env required (defaults to maildev)
./10-control.sh        # infra (pg/redis/registry/s3) + control chart; prints API URL
./20-region.sh         # POST /regions (real keys) + runner token + region chart install
REGION_ID=<id-from-20> RUNNER_DOMAIN=<cluster-routable-host-ip> ./30-runner-host.sh
```

Secrets are generated into `./local-work/` (gitignored) — never committed.
Image tags default to `v0.190.3` (override `IMAGE=...` for 30-; charts via `imageTag`).

## Keycloak test flow (proves OIDC end-to-end without a browser)

Direct grants are enabled on the local `cogbox` client for testing
(production browser flows use code + PKCE). Gotchas baked in from testing:
set `firstName`/`lastName` on service-created users, and keep the
`cogbox-audience` protocol mapper (Keycloak ignores the `audience`
request parameter without it, so platform calls 401).

```bash
KC=http://127.0.0.1:8080            # port-forward svc/keycloak 8080 first
KADMIN=$(kubectl -n control get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d)
MT=$(curl -s -X POST $KC/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli&username=admin&password=$KADMIN&grant_type=password" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
# create user (note firstName/lastName) + non-temporary password
curl -X POST $KC/admin/realms/cogbox/users -H "Authorization: Bearer $MT" \
  -d '{"username":"e2e@example.com","email":"e2e@example.com","firstName":"E2E","lastName":"User","enabled":true,"emailVerified":true}'
KUID=$(curl -s "$KC/admin/realms/cogbox/users?username=e2e" -H "Authorization: Bearer $MT" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
curl -X PUT $KC/admin/realms/cogbox/users/$KUID/reset-password -H "Authorization: Bearer $MT" \
  -d '{"type":"password","value":"Testpass123!","temporary":false}'
# JWT for the platform (audience mapper puts `cogbox` into aud)
UT=$(curl -s -X POST $KC/realms/cogbox/protocol/openid-connect/token \
  -d "client_id=cogbox&username=e2e@example.com&password=Testpass123!&grant_type=password&scope=openid profile email" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
# platform call: expect 403 (no org yet — NOT 401), and the user row appears in DB
curl $API/api/regions -H "Authorization: Bearer $UT"
```

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
