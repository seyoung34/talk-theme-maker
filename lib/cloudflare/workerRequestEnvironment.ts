import { AsyncLocalStorage } from "node:async_hooks";

export type WorkerRequestEnvironment = Record<string, string | undefined>;
export type WorkerRequestContext = { waitUntil(task: Promise<unknown>): void };

// Only the two maintenance fast paths enter this scope. Deep settlement/outbox
// helpers use it instead of mutating process.env shared by concurrent requests.
const requests = new AsyncLocalStorage<{
  env: WorkerRequestEnvironment;
  ctx?: WorkerRequestContext;
}>();

export function withWorkerRequestEnvironment<T>(env: WorkerRequestEnvironment, ctx: WorkerRequestContext | undefined, run: () => T): T {
  return requests.run({ env, ctx }, run);
}

export function workerRequestEnvironment() {
  return requests.getStore()?.env;
}

export function requestEnvironment(): WorkerRequestEnvironment {
  return workerRequestEnvironment() ?? process.env;
}

export function workerRequestContext() {
  return requests.getStore()?.ctx;
}
