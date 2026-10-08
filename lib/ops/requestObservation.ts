import { AsyncLocalStorage } from "node:async_hooks";

export type ObservationStage = "authentication" | "validation" | "reservation" | "input_upload" | "jobs_enqueue" | "result_read" | "settlement" | "signing";
export type ObservationDependency = "auth" | "database" | "gcp_auth" | "gcs" | "cloud_run" | "iam" | "groble" | "application";
export type ObservationOperation = "export.enqueue" | "export.status" | "export.download" | "export.cancel" | "export.sweep" | "billing.checkout" | "billing.webhook" | "billing.status";
type Observation = {
  correlationId: string; route: string; method: string; operation: ObservationOperation;
  stage: ObservationStage; dependency: ObservationDependency; startedAt: number;
  exportJobId?: string;
};
const observations = new AsyncLocalStorage<Observation>();
const failureCodes = new Set([
  "authentication_failed", "validation_failed", "reservation_failed", "input_upload_failed",
  "jobs_enqueue_failed", "result_read_failed", "settlement_failed", "signing_failed",
  "checkout_failed", "webhook_rejected", "webhook_processing_failed", "unknown_error",
  "android_export_failed", "ios_export_failed", "enqueue_failed", "build_watchdog_timeout",
  "sts_exchange_request_failed", "sts_exchange_failed", "impersonation_request_failed", "impersonation_failed",
  "gcs_upload_request_failed", "gcs_upload_stream_failed", "gcs_upload_failed", "job_run_failed",
  "job_run_request_failed", "builder_execution_lookup_failed", "builder_execution_lookup_incomplete",
  "gcs_input_inspection_failed", "input_bundle_invalid", "missing_config", "invalid_config",
  "invalid_oidc_private_key", "missing_oidc_key_id", "gcs_result_read_failed", "gcs_output_lookup_failed", "sign_blob_failed",
  "invalid_payload", "invalid_reference", "invalid_json", "unsupported_event", "unsupported_version",
  "invalid_product", "invalid_amount", "unknown_product", "invalid_refund", "invalid_timestamp",
  "missing_signature", "invalid_signature", "missing_application_id", "missing_theme_identifier",
  "catalog_export_disabled", "catalog_asset_forbidden", "catalog_revision_mismatch", "input_upload_incomplete",
  "enqueue_recovery_failed", "temporary_failure",
]);
const jobPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ray IDs are correlation hints, never unique keys or authorization inputs. */
export function createCorrelationId(headers: Headers) {
  const ray = headers.get("cf-ray");
  return ray && /^[0-9a-f]{16,32}-[A-Z]{3}$/.test(ray) ? ray : crypto.randomUUID();
}

export function observationDetails(): Record<string, string> {
  const context = observations.getStore();
  if (!context) return {};
  return {
    correlationId: context.correlationId, route: context.route, method: context.method,
    operation: context.operation, stage: context.stage, dependency: context.dependency,
    // No version binding exists yet; never substitute an unrelated build value.
    deploymentVersion: "unknown",
  };
}

export function setObservationStage(stage: ObservationStage, dependency: ObservationDependency, exportJobId?: string | null) {
  const context = observations.getStore();
  if (!context) return;
  context.stage = stage;
  context.dependency = dependency;
  if (exportJobId && jobPattern.test(exportJobId)) context.exportJobId = exportJobId;
}

/** Explicit codes only: an arbitrary Error.code/name/message may contain private data. */
export function recordOperationFailure(errorCode?: string, httpStatus?: number) {
  try {
    const context = observations.getStore();
    console.error(JSON.stringify({
      event: "operation_failed", occurredAt: new Date().toISOString(),
      ...observationDetails(),
      errorCode: safeDiagnosticErrorCode(errorCode, context?.stage),
      ...(context ? { wallDurationMs: Math.max(0, Math.round(performance.now() - context.startedAt)) } : {}),
      ...(context?.exportJobId ? { exportJobId: context.exportJobId } : {}),
      ...(Number.isInteger(httpStatus) && httpStatus! >= 100 && httpStatus! <= 599 ? { httpStatus } : {}),
    }));
  } catch { /* Observability must never change the operation result. */ }
}

/** Constants supplied by routes; request URL, body and user identity are never copied. */
export function withRequestObservation<T>(request: Request, route: string, operation: ObservationOperation, run: () => Promise<T>): Promise<T> {
  let correlationId = "unknown";
  try { correlationId = createCorrelationId(request.headers); } catch { /* No telemetry prerequisite. */ }
  return observations.run({
    correlationId, route, method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(request.method) ? request.method : "unknown",
    operation, stage: "authentication", dependency: "auth", startedAt: performance.now(),
  }, async () => {
    try { return await run(); } catch (error) { recordOperationFailure(); throw error; }
  });
}

/** Separate job scopes prevent a sweep failure from inheriting the previous job's context. */
export function withObservationJob<T>(exportJobId: string, run: () => Promise<T>): Promise<T> {
  const parent = observations.getStore();
  if (!parent) return run();
  return observations.run({ ...parent, stage: "result_read", dependency: "database", exportJobId: jobPattern.test(exportJobId) ? exportJobId : undefined }, async () => {
    try { return await run(); } catch (error) { recordOperationFailure(); throw error; }
  });
}

/** Includes event construction: a broken alert formatter/factory cannot break billing. */
export function safeTelemetry<T>(run: () => T): T | undefined {
  try { return run(); } catch {
    try { console.error(JSON.stringify({ event: "telemetry_failed", phase: "alert_construction_or_dispatch", ...observationDetails() })); } catch { /* Best effort only. */ }
  }
}

export function safeDiagnosticErrorCode(code?: string, stage?: string) {
  const stageCode = stage ? `${stage}_failed` : "unknown_error";
  return failureCodes.has(code ?? "") ? code! : failureCodes.has(stageCode) ? stageCode : "unknown_error";
}

/** Bounded labels keep the complete group identity below the DB's 240-character limit. */
export function transientFailureIdentity(input: { operation: string; stage: string; dependency: string; errorCode: string }, now = Date.now()) {
  const labels = [input.operation, input.stage, input.dependency, input.errorCode];
  if (labels.some((label) => !/^[a-z][a-z0-9_.-]{0,39}$/.test(label))) return undefined;
  return `runtime:${labels.join(":")}:${Math.floor(now / 300_000)}`;
}
