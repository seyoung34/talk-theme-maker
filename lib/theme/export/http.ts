export function buildDownloadContentDisposition(fileName: string) {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]+/g, "-");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export function safeErrorSummary(error: unknown) {
  if (error instanceof Error) {
    const detail = "detail" in error && typeof error.detail === "string" ? ` (${error.detail})` : "";
    return `${error.name}: ${error.message}${detail}`.slice(0, 1000);
  }
  if (typeof error === "object" && error !== null) {
    const details = Object.fromEntries(Object.entries(error).filter(([key]) => ["code", "message", "details", "hint"].includes(key)));
    return JSON.stringify(details).slice(0, 1000);
  }
  return String(error).slice(0, 1000);
}
