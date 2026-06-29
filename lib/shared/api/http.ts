export async function readJsonResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  const text = await response.text().catch(() => "");
  const excerpt = text.replace(/\s+/g, " ").slice(0, 120);
  return {
    error: excerpt ? `Unexpected non-JSON response (${response.status}): ${excerpt}` : `Unexpected non-JSON response (${response.status}).`,
  } as T;
}
