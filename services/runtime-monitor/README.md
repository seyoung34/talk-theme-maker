# Independent runtime monitor (PR3)

**Code preparation only. Not deployed or a running 24-hour monitor.**
User selected GCP Scheduler + Cloud Run and GraphQL aggregates + Observability investigation.
Production wiring, D4 thresholds/budget/retention/notification recipient, Secrets and IAM require separate approval.
No migration and no operational setup commands are executed by this PR.

## Boundaries

- Standalone Node service. It is NOT imported by the application Worker, builders or cron.
- A private Cloud Run service accepts only POST /check, invoked by Cloud Scheduler with OIDC.
  Google Cloud Run IAM authenticates the request before Node. Do not grant allUsers/allAuthenticatedUsers invoker.
  Direct local execution has no application-level OIDC verifier and is for isolated tests only.
- Runtime SA can read/update objects in a **dedicated monitor state bucket**, read only the designated
  Secret Manager versions, and write Cloud Logging. It gets no Supabase key, builder role or export bucket permission.
- Target readiness has a NEW, separate `MONITOR_READINESS_TOKEN`. It can only issue a bounded HEAD table read.
  Never reuse the ops drain/sweep token. Setting the Secret in the Worker is a separate approved action.
- Telegram is called directly, without the target Worker or its Supabase outbox.
  Individual notifications are persisted before send and removed only after successful provider response.
  Delivery is **at least once**: crash/ack-CAS failure after Telegram acceptance can duplicate the printed incident ID.
  There is no claim of exactly-once delivery.
- GCS immutable generation reads and conditional generation writes protect a 120-second lease across revisions.
  Effects stop 15 seconds before expiry. Failed CAS stops the tick, not a blind overwrite/retry.
  A crash retains the lease until expiration and may delay a check by two minutes.

## Signals and limits

| Source | Signal | Meaning / limit |
| --- | --- | --- |
| public_http | GET /, HTTP2xx, HTML content-type and nonempty streaming prefix | Reachability only; not full streamed-render correctness, login or export QA |
| session_http | anonymous GET /api/session has user:null/isAdmin:false | Cheap anonymous API behavior; not authenticated session validation |
| readiness | authenticated GET /api/internal/ops/readiness | HEAD export_jobs with LIMIT1 and 3s abort; tests Data API access, not all DB/RPC/business invariants |
| cloudflare_runtime | workersInvocationsAdaptive grouped by status | Invocation estimates, not users or HTTP status; exceededResources includes multiple resource causes |
| cloudflare_collector | API/schema/query/coverage failures | Monitoring data unavailable, not fabricated zero failures |

HTTP checks run concurrently once per tick, each with a 5s deadline including response-body reads.
Redirects are refused, secrets are never forwarded to a new host. API bodies are bounded to 64KiB.
Only fixed origin-relative paths are called; caller body/query cannot control target URLs.
Public GET / intentionally adds real Worker traffic (3 target probes/minute = 4,320/day at a 1-minute schedule).
Do not expand paths or run production load tests without revisiting Free request budget.

GraphQL queries **closed, disjoint 5-minute windows**, delayed by 2 minutes for ingestion,
with an inclusive end of next boundary minus 1ms. No datetime dimension, pagination or raw paths are requested.
Each successfully collected window is queried once; failures back off 1/2/4/8/15 minutes.
A latest-window strategy records collection_gap as separate unknown runtime evidence and a
structured gap log on missed windows; it does **not** backfill all downtime. The new successful
collection remains collection_ok and clears backoff immediately. Gap evidence resets runtime
success/failure streaks before the new window, so observations across downtime are not consecutive.
Valid empty windows/no invocations and unclassified statuses are not proof of recovery.
CPU values above 10ms alone never alert. Known runtime failure candidates are
exceededResources/scriptThrewException/internalError. Canceled/clientDisconnected alone do not alert.
Unknown outcome names mark collector uncertainty; quota/schema/sampling remain account-specific preflight checks.

One qualifying runtime window opens an incident (policy count AND rate). HTTP/collector sources
require configured consecutive failures; recovery requires configured distinct successful observations.
With the suggested 2/2 checks: HTTP detection ~1–2min plus latency; runtime detection ~2–7min plus ingestion,
runtime recovery needs two distinct windows (~5–10min after healthy traffic), not two repeated queries.
These are design targets, not measured operational guarantees.

Evidence is a bounded last120 samples, **not an audit archive/retention-days guarantee**.
State + max32 pending notifications fit <=256KiB. At most3 pending sends/tick, in order,
starting with already committed alerts BEFORE observing new transitions.
If more than27 remain, reserve room for the five sources by skipping new observations;
log backpressure, release the lease and return503. There is no new heartbeat for a skipped check.
This creates an explicitly reported coverage gap while backlog drains, not a permanent queue lockout.
Delivery failures remain queued and return503 for Scheduler.
Do not leave alerts-disabled dry-run monitoring on indefinitely: queued diagnostic notifications can fill the bound.
GCP logs retain operational evidence according to the separately approved Logging retention.

## Configuration (no implicit production policy)

Container defaults `MONITOR_ENABLED=0`: no GCS access, probes or Telegram.
Enable only after approval, preflight and configuration.

| Variable | Location |
| --- | --- |
| MONITOR_ENABLED=1 | Run env, activation gate |
| MONITOR_TARGET_ORIGIN=https://talktheme.shop | Run env, HTTPS origin only, no userinfo/path/query/hash |
| MONITOR_CF_ACCOUNT_TAG / MONITOR_CF_SCRIPT_NAME | Run env, account/script scope |
| MONITOR_STATE_BUCKET | Run env, dedicated private GCS bucket |
| MONITOR_CF_API_TOKEN | Run Secret, least-privilege account Analytics Read access; confirm dataset access |
| MONITOR_READINESS_TOKEN | NEW Secret in Run and Worker; base64url32–256 chars |
| MONITOR_ALERTS_ENABLED=1 | Run env, direct Telegram activation |
| MONITOR_TELEGRAM_BOT_TOKEN / MONITOR_TELEGRAM_CHAT_ID | Run Secrets, existing credentials only by approved binding/reuse |
| MONITOR_FAILURE_CHECKS / MONITOR_RECOVERY_CHECKS | Required Run env, proposed2/2 |
| MONITOR_COOLDOWN_SECONDS | Required Run env, proposed300 |
| MONITOR_RUNTIME_FAILURE_COUNT / MONITOR_RUNTIME_FAILURE_PERCENT | Required Run env, proposed5/5; invocation estimates, not business conversion/error rate |

Threshold proposals are **unapproved D4**. No Secret values belong in repo, image, command logs or Handoff.
Examples above are variable names/proposals; this PR does not set them in production.

## Deployment proposal and independent heartbeat gate

1. Review PR and decide D4: interval (proposed every minute), thresholds, monitor region/budget,
   GCS/Logging retention and operator/notification channels.
2. Approve and prepare private dedicated bucket, runtime/scheduler SAs, minimal scoped IAM,
   specific Secret versions and a reviewed container image. Build locally with
   `docker build -f services/runtime-monitor/Dockerfile .`; this does not deploy.
3. Cloud Run: require authentication, min-instances0, max-instances1, concurrency1,
   request timeout60s; Scheduler: OIDC audience=service URL, POST /check, 60s deadline,
   bounded retries (proposed0: next minute tick retries pending alerts/collection with lease/backoff).
   GCS lease also fences cross-revision overlap; max-instances1 alone does not.
4. Configure a Google Cloud **external heartbeat absence alert** from the two JSON templates.
   Replace TALKTHEME_MONITOR_SERVICE, choose verified notification channels, review and enable the policy.
   The default template is disabled and channels are empty; it is not a working alert.
   First successful heartbeat must exist before an absence series can be monitored.
   Alerts run in Cloud Monitoring independently of Node, so a stopped collector need not send its own warning.
   Use email or another verified channel as well as Telegram: Telegram outage must not hide monitor failure.
5. Add a separate Cloud Monitoring log alert for monitor_tick_failed / monitor_delivery_failed;
   heartbeat alone indicates a persisted tick, not successful delivery or target health.
   Readiness/sampling/quota failure is surfaced separately in incident evidence.
6. Isolated acceptance: timeout, invalid readiness credential, simulated DB unavailable,
   GraphQL429/errors/missing schema, Telegram failure, state403/CAS conflict, container stop/heartbeat absence,
   restore/recovery. Never intentionally exhaust production CPU or create an export/payment.
7. After explicit operational approval, run first check and verify persisted state,
   actual Telegram receipt, recovery and independently delivered missing-heartbeat alert.
   Only then mark PR3 operationally complete.

Cost proposal: at1min ~43,200 Run invocations/month, ~8,640 successful GraphQL queries/month,
~129,600 target probe requests/month (31-day months higher). A normal tick has GCS metadata+download
and3 conditional writes; notifications add ack writes. Count GCS operation/storage/versioning/soft-delete,
Run execution/cold starts, Scheduler, Secret access and Logging before activation.
No claim this is free; free allowances are shared with existing resources.

## Investigation runbook

1. Identify source/phase/UTC time and incident ID. Collector/Telegram/heartbeat faults are not automatically site downtime.
2. GraphQL window in GCS evidence gives invocation candidates. Open Workers Observability Logs/MCP
   for the same service/window; check actual exceededCpu/exceededMemory/outcome, request ID and PR2
   operation/stage/dependency/errorCode. GraphQL does not provide route/Ray IDs in this collector.
   MCP remains an operator tool; no MCP session is a scheduled collector.
3. Correlate exportJobId with builder logs/admin exports when present. Never treat canceled subrequests
   or HTTP200 alone as proof of failed/succeeded business actions.
4. If state/collector is unavailable, inspect Cloud Run startup/config, Scheduler OIDC/IAM and GCS/Secret permissions.
   Do not reset/delete state as a quick fix: that loses incident history and queued alerts.
5. Telegram retries may produce the same incident ID twice. It is an operational incident, not an instruction
   to repeat/refund/reserve a payment/export. No business writes occur here.
6. This version sends standalone monitor notifications; it does not insert runtime.health_failed or
   export.failure_spike into Supabase. Those reserved types retain read compatibility.
   Business failure spikes need a separate real business denominator and are not fabricated from Worker invocations.

References: [GraphQL schema example](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/),
[GCS preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions),
[Scheduler OIDC/Run](https://docs.cloud.google.com/run/docs/triggering/using-scheduler),
[metric absence](https://docs.cloud.google.com/monitoring/alerts/metric-absence),
[logs metrics](https://docs.cloud.google.com/logging/docs/logs-based-metrics/counter-metrics).

## Local verification

`npm test -- services/runtime-monitor app/api/internal/ops/readiness/route.test.ts`

`npx tsc -p services/runtime-monitor/tsconfig.json --noEmit`

Root tsc/lint/text and OpenNext build verify the readiness route. Storage, Telegram and provider
tests use fixtures/mocks, not operational credentials. No DB schema change/reset is required.
