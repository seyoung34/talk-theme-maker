import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixedLengthBody } from "@/lib/theme/export/fixedLengthBody";

function sourceOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const out: number[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(...value);
  }
  return out;
}

/**
 * A minimal stand-in for the Workers global. `TransformStream` gives the same
 * readable/writable pair; the real one additionally sets `Content-Length`.
 */
function stubFixedLengthStream() {
  const seen: (number | bigint)[] = [];
  class Stub {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    constructor(length: number | bigint) {
      seen.push(length);
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      this.readable = readable;
      this.writable = writable;
    }
  }
  vi.stubGlobal("FixedLengthStream", Stub);
  return seen;
}

describe("fixed length body", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the source through untouched where the runtime has no FixedLengthStream", async () => {
    // Node and Vitest: still lazy, only without a Content-Length.
    const source = sourceOf(new Uint8Array([1, 2]), new Uint8Array([3]));
    const { body, written, fixedLength } = createFixedLengthBody(source, 3);

    expect(fixedLength).toBe(false);
    expect(body).toBe(source);
    await expect(written).resolves.toBeUndefined();
    expect(await collect(body)).toEqual([1, 2, 3]);
  });

  it("declares the byte length to the runtime so the request is not chunked", async () => {
    const seen = stubFixedLengthStream();
    const { body, written, fixedLength } = createFixedLengthBody(sourceOf(new Uint8Array([1, 2, 3])), 3);

    expect(fixedLength).toBe(true);
    expect(seen).toEqual([3]);
    expect(await collect(body)).toEqual([1, 2, 3]);
    await expect(written).resolves.toBeUndefined();
  });

  it("surfaces a source failure through `written` rather than swallowing it", async () => {
    stubFixedLengthStream();
    const failing = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("source_exploded");
      },
    });
    const { body, written } = createFixedLengthBody(failing, 3);

    await expect(written).rejects.toThrow("source_exploded");
    // Reading the body after the failure must not hang.
    await expect(collect(body)).rejects.toThrow();
  });

  it("does not leave the write as an unhandled rejection when awaited late", async () => {
    stubFixedLengthStream();
    const failing = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("source_exploded");
      },
    });
    const { written } = createFixedLengthBody(failing, 3);

    // The caller awaits only after the fetch settles; the rejection is already attached,
    // so this must not have tripped an unhandled-rejection warning in between.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(written).rejects.toThrow("source_exploded");
  });
});
