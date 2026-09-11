/**
 * `FixedLengthStream` is a Workers runtime global. It is not in `lib.dom` and this project
 * does not install `@cloudflare/workers-types`, so it is declared structurally here and
 * looked up at run time — the same source then compiles under Node, Vitest and workerd.
 *
 * Why it matters: Cloudflare sends a plain `ReadableStream` request body with chunked
 * encoding, while a body produced by `FixedLengthStream` carries a real `Content-Length`.
 * The consumer here is the GCS media upload endpoint, so advertising the length is the
 * safer contract.
 */
type FixedLengthStreamLike = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type FixedLengthStreamConstructor = new (length: number | bigint) => FixedLengthStreamLike;

function resolveFixedLengthStream(): FixedLengthStreamConstructor | null {
  const candidate = (globalThis as Record<string, unknown>).FixedLengthStream;
  return typeof candidate === "function" ? (candidate as FixedLengthStreamConstructor) : null;
}

export type FixedLengthBody = {
  body: ReadableStream<Uint8Array>;
  /** Resolves once the source is fully written, or rejects with the write failure. */
  written: Promise<void>;
  /** True when the request will carry `Content-Length` instead of chunked encoding. */
  fixedLength: boolean;
};

/**
 * Wraps `source` so the resulting body declares `length` bytes where the runtime supports it.
 *
 * The caller must await `written`: on the happy path to surface a write failure the HTTP
 * response would otherwise hide, and on the failure path so the pipe does not outlive the
 * request as a floating promise. `pipeTo` rejects when its destination is aborted — which is
 * what a fetch timeout or a dropped socket does — so awaiting it also unblocks on errors.
 */
export function createFixedLengthBody(source: ReadableStream<Uint8Array>, length: number): FixedLengthBody {
  const FixedLengthStream = resolveFixedLengthStream();
  if (!FixedLengthStream) {
    // Node and Vitest: still consumed lazily by the reader, only without a Content-Length.
    return { body: source, written: Promise.resolve(), fixedLength: false };
  }

  const stream = new FixedLengthStream(length);
  const written = source.pipeTo(stream.writable);
  // Marks the rejection handled so a caller that awaits `written` only after the fetch
  // settles does not trip an unhandled-rejection warning. Awaiting still rejects.
  written.catch(() => {});

  return { body: stream.readable, written, fixedLength: true };
}
