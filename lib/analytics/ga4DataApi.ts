import {
  getImpersonatedAccessToken,
  readGcpOidcConfig,
} from "@/lib/theme/export/buildJobClient";

const ga4DataApiScope = "https://www.googleapis.com/auth/analytics.readonly";
const ga4OverallTimeoutMs = 12_000;

export type Ga4VisitorConfig = {
  propertyId: string;
  serviceAccountEmail: string;
};

export type Ga4VisitorStatus = "ok" | "not_configured" | "invalid_config" | "unavailable";

export type Ga4VisitorResult = {
  status: Ga4VisitorStatus;
  visitors: number | null;
  sessions: number | null;
  newUsers: number | null;
};

export class Ga4DataApiError extends Error {
  constructor(
    public readonly code: "invalid_config" | "authentication_failed" | "request_failed" | "invalid_response",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "Ga4DataApiError";
  }
}

export function readGa4VisitorConfig(env: Record<string, string | undefined> = process.env): Ga4VisitorConfig | null {
  const rawPropertyId = env.GA4_PROPERTY_ID?.trim();
  const serviceAccountEmail = env.GA4_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!rawPropertyId || !serviceAccountEmail) return null;

  const propertyId = rawPropertyId.replace(/^properties\//, "");
  if (!/^\d{1,30}$/.test(propertyId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}@[A-Za-z0-9][A-Za-z0-9._-]{0,254}\.iam\.gserviceaccount\.com$/.test(serviceAccountEmail)) {
    throw new Ga4DataApiError("invalid_config", "GA4 Data API 설정 형식이 올바르지 않습니다.");
  }

  return { propertyId, serviceAccountEmail };
}

export function getGa4VisitorConfigStatus(env: Record<string, string | undefined> = process.env) {
  try {
    return readGa4VisitorConfig(env) ? "configured" as const : "not_configured" as const;
  } catch {
    return "invalid" as const;
  }
}

export async function readGa4DailyVisitors(
  day: string,
  options: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    getAccessToken?: (config: Ga4VisitorConfig, signal?: AbortSignal) => Promise<string>;
    timeoutMs?: number;
  } = {},
): Promise<Ga4VisitorResult> {
  let config: Ga4VisitorConfig | null;
  try {
    config = readGa4VisitorConfig(options.env ?? process.env);
  } catch (error) {
    logGa4Failure(error);
    return emptyGa4Result("invalid_config");
  }
  if (!config) return emptyGa4Result("not_configured");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return emptyGa4Result("invalid_config");

  const deadlineController = new AbortController();
  const timeoutId = setTimeout(() => deadlineController.abort(), options.timeoutMs ?? ga4OverallTimeoutMs);
  try {
    const getAccessToken = options.getAccessToken ?? getDefaultAccessToken;
    const accessToken = await awaitWithDeadline(
      getAccessToken(config, deadlineController.signal),
      deadlineController.signal,
    );
    const response = await fetchWithDeadline(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(config.propertyId)}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: day, endDate: day }],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "totalUsers" },
            { name: "sessions" },
            { name: "newUsers" },
          ],
          keepEmptyRows: true,
          limit: "1",
        }),
      },
      options.fetchImpl ?? fetch,
      deadlineController.signal,
    );
    const payload = await readJson(response, deadlineController.signal);
    if (!response.ok) {
      throw new Ga4DataApiError(
        response.status === 401 || response.status === 403 ? "authentication_failed" : "request_failed",
        "GA4 Data API 요청에 실패했습니다.",
        response.status,
      );
    }
    return parseReport(payload);
  } catch (error) {
    logGa4Failure(error);
    return emptyGa4Result("unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getDefaultAccessToken(config: Ga4VisitorConfig, signal?: AbortSignal) {
  const accessToken = await getImpersonatedAccessToken(
    config.serviceAccountEmail,
    readGcpOidcConfig(),
    { scopes: [ga4DataApiScope], signal },
  );
  return accessToken;
}

function parseReport(value: unknown): Ga4VisitorResult {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    throw new Ga4DataApiError("invalid_response", "GA4 Data API 응답 형식이 올바르지 않습니다.");
  }
  if (value.rows.length === 0) {
    return { status: "ok", visitors: 0, sessions: 0, newUsers: 0 };
  }

  const row = value.rows[0];
  if (!isRecord(row) || !Array.isArray(row.metricValues) || row.metricValues.length < 3) {
    throw new Ga4DataApiError("invalid_response", "GA4 Data API 응답의 측정값 형식이 올바르지 않습니다.");
  }

  return {
    status: "ok",
    visitors: parseMetric(row.metricValues[0]),
    sessions: parseMetric(row.metricValues[1]),
    newUsers: parseMetric(row.metricValues[2]),
  };
}

function parseMetric(value: unknown) {
  if (!isRecord(value) || typeof value.value !== "string" || !/^\d+$/.test(value.value.trim())) {
    throw new Ga4DataApiError("invalid_response", "GA4 Data API 측정값이 올바르지 않습니다.");
  }
  const parsed = Number(value.value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Ga4DataApiError("invalid_response", "GA4 Data API 측정값이 올바르지 않습니다.");
  }
  return parsed;
}

function emptyGa4Result(status: Exclude<Ga4VisitorStatus, "ok">): Ga4VisitorResult {
  return { status, visitors: null, sessions: null, newUsers: null };
}

async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
) {
  try {
    return await awaitWithDeadline(fetchImpl(input, { ...init, signal }), signal);
  } catch (error) {
    if (error instanceof Ga4DataApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Ga4DataApiError("request_failed", "GA4 Data API 요청 시간이 초과되었습니다.");
    }
    throw new Ga4DataApiError("request_failed", "GA4 Data API 네트워크 요청에 실패했습니다.");
  }
}

async function readJson(response: Response, signal: AbortSignal) {
  try {
    return await awaitWithDeadline(response.json(), signal);
  } catch (error) {
    if (error instanceof Ga4DataApiError) throw error;
    return null;
  }
}

async function awaitWithDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Ga4DataApiError("request_failed", "GA4 Data API 요청 시간이 초과되었습니다."));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function logGa4Failure(error: unknown) {
  console.error("[ops-analytics] ga4_visitors_failed", {
    errorCode: error instanceof Ga4DataApiError ? error.code : "unknown_error",
    status: error instanceof Ga4DataApiError ? error.status : undefined,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
