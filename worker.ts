// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time.
import { default as openNextWorker } from "./.open-next/worker.js";
import {
  runScheduledExportSweep,
  type ExportSweepController,
  type ExportSweepEnvironment,
} from "./lib/ops/exportSweepScheduler";

const worker = {
  fetch: openNextWorker.fetch,
  scheduled(controller: ExportSweepController, env: ExportSweepEnvironment) {
    return runScheduledExportSweep(controller, env);
  },
};

export default worker;

// These exports are required by OpenNext when its generated worker uses the cache
// Durable Objects. They remain unchanged from the generated entry point.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
