import { describe, expect, it } from "vitest";
import {
  createInputArchive,
  createInputArchiveStream,
  measureInputArchive,
  readInputArchive,
} from "@/lib/theme/export/inputArchive";

const maxFieldBytes = 4096;

async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return { chunks, joined };
}

describe("input archive", () => {
  it("round-trips named binary inputs", () => {
    const archive = createInputArchive([
      { field: "file-0", bytes: new Uint8Array([0, 1, 255]) },
      { field: "file-1", bytes: new Uint8Array() },
    ]);

    expect([...readInputArchive(archive).entries()].map(([field, bytes]) => [field, [...bytes]])).toEqual([
      ["file-0", [0, 1, 255]],
      ["file-1", []],
    ]);
  });

  it("rejects a truncated archive", () => {
    const archive = createInputArchive([{ field: "file-0", bytes: new Uint8Array([1, 2, 3]) }]);
    expect(() => readInputArchive(archive.slice(0, -1))).toThrow("input_archive");
  });
});

// The Worker builds this archive from a request that may already hold ~50MB of FormData and
// decoded files against a 128MB limit, so the streaming writer has to produce the identical
// format without ever allocating the archive itself.
describe("input archive streaming", () => {
  const entries = [
    { field: "file-0", bytes: new Uint8Array([0, 1, 255]) },
    { field: "file-1", bytes: new Uint8Array() },
    { field: "파일-2", bytes: new Uint8Array([7, 7, 7, 7]) },
  ];

  it("produces byte-for-byte the same archive as the buffered writer", async () => {
    const { joined } = await drain(createInputArchiveStream(entries));
    expect([...joined]).toEqual([...createInputArchive(entries)]);
  });

  it("round-trips through readInputArchive, including an empty file and a UTF-8 field", async () => {
    const { joined } = await drain(createInputArchiveStream(entries));

    expect([...readInputArchive(joined).entries()].map(([field, bytes]) => [field, [...bytes]])).toEqual([
      ["file-0", [0, 1, 255]],
      ["file-1", []],
      ["파일-2", [7, 7, 7, 7]],
    ]);
  });

  it("reports the exact length the stream will emit", async () => {
    const { joined } = await drain(createInputArchiveStream(entries));
    expect(measureInputArchive(entries)).toBe(joined.length);
    expect(measureInputArchive(entries)).toBe(createInputArchive(entries).length);
  });

  it("never allocates a chunk the size of the whole archive", async () => {
    const big = [
      { field: "file-0", bytes: new Uint8Array(64 * 1024) },
      { field: "file-1", bytes: new Uint8Array(64 * 1024) },
      { field: "file-2", bytes: new Uint8Array(64 * 1024) },
    ];
    const total = measureInputArchive(big);
    const { chunks } = await drain(createInputArchiveStream(big));

    // The largest chunk is the largest single input, never the archive total.
    const largest = Math.max(...chunks.map((chunk) => chunk.length));
    expect(largest).toBe(64 * 1024);
    expect(largest).toBeLessThan(total);
  });

  it("passes file payloads through by reference instead of copying them", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const { chunks } = await drain(createInputArchiveStream([{ field: "file-0", bytes: payload }]));
    expect(chunks).toContain(payload);
  });

  it("emits no empty chunks", async () => {
    const { chunks } = await drain(createInputArchiveStream(entries));
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
  });

  it("accepts a field at the maximum encoded length", () => {
    const field = "f".repeat(maxFieldBytes);
    expect(() => createInputArchiveStream([{ field, bytes: new Uint8Array([1]) }])).not.toThrow();
    expect(measureInputArchive([{ field, bytes: new Uint8Array([1]) }])).toBe(8 + 8 + maxFieldBytes + 1);
  });

  it("rejects an over-long field before the stream starts", () => {
    // Rejected synchronously: `pull` would only run once the upload request is in flight.
    const field = "f".repeat(maxFieldBytes + 1);
    expect(() => createInputArchiveStream([{ field, bytes: new Uint8Array() }])).toThrow("input_archive_field_too_large");
    expect(() => measureInputArchive([{ field, bytes: new Uint8Array() }])).toThrow("input_archive_field_too_large");
  });

  it("counts a multi-byte field by its encoded length, not its character count", () => {
    // 3 bytes per character in UTF-8, so this exceeds the limit while staying shorter.
    const field = "가".repeat(maxFieldBytes / 3 + 1);
    expect(field.length).toBeLessThan(maxFieldBytes);
    expect(() => createInputArchiveStream([{ field, bytes: new Uint8Array() }])).toThrow("input_archive_field_too_large");
  });

  it("rejects a length that overflows the 32-bit header before the stream starts", () => {
    const oversized = { field: "file-0", bytes: { length: 0x1_0000_0000 } as unknown as Uint8Array };
    expect(() => createInputArchiveStream([oversized])).toThrow("input_archive_file_too_large");
  });
});
