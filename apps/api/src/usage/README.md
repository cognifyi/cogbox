# Usage Relay Runbook

Operator guide for the sandbox usage billing pipeline: `UsageService` closes usage
periods, `UsageEventMapperService` turns each closed period into billing events, the
events are written to the `usage_outbox` table in the same transaction that archives the
period, and `BillingUsageRelayService` delivers them to the billing usage API.

## Event semantics

- **One event per closed period and metric.** A closed `SandboxUsagePeriod` produces four
  events: `cpu_seconds`, `gpu_seconds`, `mem_gb_seconds`, and `disk_gb_seconds`.
- **`event_id` format:** `cogbox:period:<periodId>:<metric>`, for example
  `cogbox:period:42:mem_gb_seconds`. The outbox has a unique index on `eventId`, so a
  replayed or retried period can never be billed twice. Delivery is effectively
  at-least-once with idempotent event ids.
- **`quantity` is the measured value multiplied by the period duration in seconds**
  (`quantity = metric_value * duration_seconds`), rounded to six decimal places.
- **Units:** `cpu_seconds` and `gpu_seconds` use `second`; `mem_gb_seconds` and
  `disk_gb_seconds` use `gb_second`.
- **Open periods are never billed.** Only periods with `endAt` set are mapped. Periods
  still running (`endAt IS NULL`) are skipped until they are closed and archived.
- **Warm-pool periods are excluded.** Rows whose `organizationId` is
  `SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION` are never mapped or enqueued, so unassigned
  warm-pool capacity is not charged to an organization.
- `occurred_at` is the period `endAt`; metadata carries `period_id`, `region`, `gpu_type`,
  and `sandbox_class`.

The outbox row is inserted with `insert(...).orIgnore()` inside the archive transaction,
so archiving the period, deleting it, and enqueueing its events commit atomically.

## Feature flags

All flags are read from the API configuration (`billingUsage` in
`src/config/configuration.ts`).

| Variable | Default | Meaning |
|---|---|---|
| `BILLING_USAGE_ENABLED` | `false` | Master switch. When `false`, periods are archived without generating or enqueueing events, and the relay does nothing. |
| `BILLING_USAGE_DRY_RUN` | `true` (anything except `false`) | When `true`, the relay claims due rows only to measure backlog and never calls billing or mutates the outbox. Requires `BILLING_USAGE_ENABLED=true` to have any effect. |
| `BILLING_USAGE_ADMIN_KEY` | unset | Admin key sent as `X-Admin-Key`. **Required when `BILLING_USAGE_ENABLED=true`** — the API fails to start without it. |
| `BILLING_USAGE_BASE_PATH` | `BILLING_API_URL` or `http://localhost:3001` | Billing API base URL. |
| `BILLING_USAGE_PRICE_VERSION` | empty string | Price version stamped on every event (`price_version`). Set it before enabling delivery. |

Tuning knobs (defaults shown): `BILLING_USAGE_BATCH_SIZE=100`,
`BILLING_USAGE_MAX_ATTEMPTS=8`, `BILLING_USAGE_BASE_BACKOFF_MS=1000`,
`BILLING_USAGE_MAX_BACKOFF_MS=300000`, `BILLING_USAGE_SENT_RETENTION_DAYS=30`,
`BILLING_USAGE_BACKLOG_ALERT_THRESHOLD=1000`.

**Dry-run backpressure:** dry-run leaves every due row `pending` and does not consume
them, so the backlog grows until a real (non-dry-run) relay drains it. This is expected;
do not panic-set the flag back to `true` once delivery is enabled.

## Safe rollout order

Run these steps in order. Do not skip ahead.

1. **Deploy the migration** (`pre-deploy`) that creates `usage_outbox` and its unique /
   due indexes. The code tolerates the table existing before any flag is enabled.
2. **Configure the key and price version:** set `BILLING_USAGE_ADMIN_KEY` and
   `BILLING_USAGE_PRICE_VERSION` (and `BILLING_USAGE_BASE_PATH` if not the default).
3. **Enable in dry-run:** set `BILLING_USAGE_ENABLED=true` with
   `BILLING_USAGE_DRY_RUN=true` (or unset — dry-run is the default). Confirm events are
   being enqueued (`cogbox_usage_outbox_enqueued_total` rises) and the backlog gauge moves.
4. **Enable delivery:** set `BILLING_USAGE_DRY_RUN=false` and confirm
   `cogbox_usage_outbox_sent_total` rises while pending/failed drain toward zero.

## Retry, dead-letter, and backoff

The relay runs every 30 seconds under a Redis lock. It claims up to
`BILLING_USAGE_BATCH_SIZE` due `pending`/`failed` rows (`nextAttemptAt <= now`, ordered by
`nextAttemptAt`) and ingests the batch. A batch failure is applied to each row.

Failure classification:

- **Terminal** — HTTP 400, 401, 403, 404, 409, 422 (and any terminal error): marked
  `dead` immediately, no retry.
- **Retryable** — HTTP 408, 425, 429, any 5xx, unknown statuses, timeouts, and common
  network errors (`ECONNRESET`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, etc.):
  rescheduled with exponential backoff.
- After `BILLING_USAGE_MAX_ATTEMPTS` attempts (default 8) a retryable row is marked `dead`.

Backoff is `min(maxBackoffMs, baseBackoffMs * 2^attempts)` after the attempt is counted.
With defaults (base 1000 ms, max 300000 ms, 8 attempts):

| Attempt | Delay before next try (ms) | Result |
|---|---|---|
| 1 | 2,000 | `failed`, retry |
| 2 | 4,000 | `failed`, retry |
| 3 | 8,000 | `failed`, retry |
| 4 | 16,000 | `failed`, retry |
| 5 | 32,000 | `failed`, retry |
| 6 | 64,000 | `failed`, retry |
| 7 | 128,000 | `failed`, retry |
| 8 | — | `dead` (max attempts reached) |

Later attempts cap at `BILLING_USAGE_MAX_BACKOFF_MS` when `MAX_ATTEMPTS` is raised.

Statuses: `pending` (new), `failed` (retry scheduled), `sent` (delivered, `sentAt` set),
`dead` (terminal or exhausted; never retried automatically). Dead rows retain the last
error (truncated to 2000 characters) for triage. `sent` rows are purged after
`BILLING_USAGE_SENT_RETENTION_DAYS`.

### Backlog script

`src/usage/scripts/usage-outbox-backlog.ts` prints per-status counts and a per-organization
breakdown, then exits non-zero when `pending + failed` exceeds the threshold. It reads
`BILLING_USAGE_BACKLOG_ALERT_THRESHOLD` (default 1000) and accepts
`--threshold <n>` / `--threshold=<n>`:

```bash
npx ts-node -P apps/api/tsconfig.json -r tsconfig-paths/register \
  apps/api/src/usage/scripts/usage-outbox-backlog.ts --threshold 1000
```

Run it on a schedule (cron / CI job) and alert on a non-zero exit.

## Metrics and alerting

Emitted by `UsageOutboxMetricsService` (meter `cogbox-usage-relay`):

| Metric | Type | Notes |
|---|---|---|
| `cogbox_usage_outbox_enqueued_total` | counter | Events written to the outbox. |
| `cogbox_usage_outbox_sent_total` | counter | Events accepted by billing. |
| `cogbox_usage_outbox_failed_total` | counter | Failed send attempts, labeled `reason=retryable\|terminal`. |
| `cogbox_usage_outbox_dead_total` | counter | Events moved to `dead`. |
| `cogbox_usage_outbox_dead_letter_size` | up/down counter | Current number of `dead` events. |
| `cogbox_usage_outbox_backlog` | observable gauge | Current count by `status` (`pending`, `failed`, `sent`, `dead`). |

**Alert threshold:** page when `pending + failed` backlog exceeds
`BILLING_USAGE_BACKLOG_ALERT_THRESHOLD` (default **1000**) — the same rule the backlog
script enforces. Also alert on any sustained growth of `cogbox_usage_outbox_dead_total` /
`cogbox_usage_outbox_dead_letter_size`, and on a relay that stops incrementing
`sent_total` while `pending` grows.

## Outage recovery

When billing is unavailable, the relay keeps retrying with backoff; rows move to `failed`
and eventually `dead`. Recovery steps:

1. Leave `BILLING_USAGE_ENABLED=true` and keep the outbox table intact — do not disable
   billing or drop rows. Undelivered events remain in the table.
2. Fix connectivity/credentials (`BILLING_USAGE_BASE_PATH`, `BILLING_USAGE_ADMIN_KEY`).
3. Confirm recovery via `cogbox_usage_outbox_sent_total` and a falling backlog gauge, then
   run the backlog script to verify `pending + failed` and dead counts.
4. For rows already `dead`, triage `lastError`. If the cause was transient (e.g. an
   expired key that has since been fixed), reset them for retry with the operator SQL
   below, then let the relay drain them:

   ```sql
   UPDATE usage_outbox
   SET status = 'pending', attempts = 0, "nextAttemptAt" = now(), "lastError" = NULL
   WHERE status = 'dead';
   ```

   Events are idempotent on `eventId`, so replaying a partially delivered period is safe.

## Postgres integration tests

The outbox integration specs (`usage-outbox.dedupe.integration.spec.ts`,
`billing-usage-relay.integration.spec.ts`) require a real Postgres database and are
**skipped unless `TEST_DATABASE_URL` is set**:

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/cogbox_test \
  npx nx test api --testPathPattern=usage
```

Without `TEST_DATABASE_URL` they report as skipped, so a green unit run does not prove
Postgres dedupe/relay behavior. Point the tests at a disposable database — they create
tables via `synchronize` and delete their own rows.

## Rollback

**To stop billing, disable the flag:** set `BILLING_USAGE_ENABLED=false`. The relay stops
and the `usage_outbox` table is retained with all undelivered (`pending`, `failed`,
`dead`) rows, so nothing is lost and delivery can resume later by re-enabling. Use
`BILLING_USAGE_DRY_RUN=true` when you want to keep observing backlog without sending.

**Never run migration `down()` as a routine rollback.** The `usage_outbox` migration's
`down()` drops the table and therefore discards every undelivered usage event. It is
**incident-only / manual** and may run only after the outbox has been reconciled or
replayed and an incident commander has explicitly approved it.
