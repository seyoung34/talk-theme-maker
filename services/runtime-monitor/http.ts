export class MonitorHttpError extends Error {
  constructor(public readonly code: "request_timeout" | "network_failed" | "http_failed" | "invalid_response" | "response_too_large" | "database_unavailable", public readonly httpStatus?: number, public readonly cfRay?: string) {
    super(code);
  }
}

/** Only fixed-format Cloudflare request identifiers may leave the probe. */
export function responseDiagnostics(response: Response) {
  const ray = response.headers.get("cf-ray");
  return {
    httpStatus: Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : undefined,
    cfRay: ray && /^[a-f0-9]{16}-[A-Z]{3}$/i.test(ray) ? ray : undefined,
  };
}

// Deadline covers headers AND streaming body. Redirects never forward a credential.
export async function requestData<T>(
  url: string, init: RequestInit, read: (response: Response) => Promise<T>,
  fetcher: typeof fetch = fetch, timeoutMs = 5000,
  acceptedStatuses: readonly number[] = [],
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, redirect: "manual", signal: controller.signal });
    if (!response.ok && !acceptedStatuses.includes(response.status)) {
      const { httpStatus, cfRay } = responseDiagnostics(response);
      await response.body?.cancel().catch(() => undefined);
      throw new MonitorHttpError("http_failed", httpStatus, cfRay);
    }
    return await read(response);
  } catch (error) {
    if (controller.signal.aborted) throw new MonitorHttpError("request_timeout");
    if (error instanceof MonitorHttpError) throw error;
    throw new MonitorHttpError("network_failed");
  } finally { clearTimeout(timeout); }
}

export async function readBoundedText(response: Response, maximumBytes = 65536) {
  if (!response.body) throw new MonitorHttpError("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) throw new MonitorHttpError("response_too_large");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readBoundedJson(response: Response): Promise<unknown> {
  try { return JSON.parse(await readBoundedText(response)); }
  catch (error) {
    if (error instanceof MonitorHttpError) throw error;
    throw new MonitorHttpError("invalid_response");
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MonitorHttpError("invalid_response");
  return value as Record<string, unknown>;
}
