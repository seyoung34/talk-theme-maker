import { createServer } from "node:http";
import { readConfig } from "./config.js";
import { createGcsStore } from "./store.js";
import { runTick } from "./runner.js";

// Cloud Run IAM validates Scheduler OIDC BEFORE this handler. Never grant allUsers
// run.invoker or bypass IAM with an arbitrary Authorization header/local proxy.
const enabled = process.env.MONITOR_ENABLED === "1";
const config = enabled ? readConfig(process.env) : null;
const store = config ? createGcsStore(config.bucket, config.object) : null;
const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  if (request.method !== "POST" || request.url !== "/check") {
    response.writeHead(404).end('{"ok":false}'); return;
  }
  // Nothing supplied by the caller controls a URL, threshold, credential or log.
  request.resume();
  if (!config || !store) { response.writeHead(503).end('{"ok":false}'); return; }
  try {
    const result = await runTick(config, { store });
    const ok = !result.deliveryFailed && !("queueBackpressure" in result && result.queueBackpressure);
    response.writeHead(ok ? 200 : 503).end(JSON.stringify({ ok, skipped: result.skipped }));
  } catch (error) {
    const allowed = new Set(["state_read_failed", "state_write_failed", "state_invalid", "notification_queue_full", "monitor_lease_expired"]);
    const code = error instanceof Error && allowed.has(error.message) ? error.message : "monitor_execution_failed";
    console.error(JSON.stringify({ event: "monitor_tick_failed", errorCode: code }));
    response.writeHead(503).end('{"ok":false}');
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
