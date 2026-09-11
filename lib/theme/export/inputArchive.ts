const archiveMagic = new Uint8Array([0x54, 0x54, 0x42, 0x31]);
const archiveHeaderBytes = 8;
const entryHeaderBytes = 8;
const maxFieldBytes = 4096;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const INPUT_ARCHIVE_FILE_NAME = "files.bin";

export type InputArchiveEntry = {
  field: string;
  bytes: Uint8Array;
};

type MeasuredArchive = {
  encodedEntries: { field: Uint8Array; bytes: Uint8Array }[];
  totalBytes: number;
};

/**
 * Encodes field names and validates every entry **before** any output is produced.
 *
 * The streaming writer starts an HTTP request as soon as it emits its first chunk, so a
 * length that only turned out to be invalid halfway through would abort a request GCS had
 * already accepted. Measuring first keeps that failure local and cheap.
 */
function measureArchive(entries: readonly InputArchiveEntry[]): MeasuredArchive {
  const encodedEntries = entries.map((entry) => ({
    field: textEncoder.encode(entry.field),
    bytes: entry.bytes,
  }));

  let totalBytes = archiveHeaderBytes;
  for (const entry of encodedEntries) {
    if (entry.field.length > maxFieldBytes) throw new Error("input_archive_field_too_large");
    if (entry.bytes.length > 0xffffffff) throw new Error("input_archive_file_too_large");
    totalBytes += entryHeaderBytes + entry.field.length + entry.bytes.length;
  }

  if (totalBytes > 0xffffffff) throw new Error("input_archive_too_large");
  return { encodedEntries, totalBytes };
}

function archiveHeader(entryCount: number) {
  const header = new Uint8Array(archiveHeaderBytes);
  header.set(archiveMagic, 0);
  new DataView(header.buffer).setUint32(4, entryCount, true);
  return header;
}

function entryHeader(fieldBytes: number, dataBytes: number) {
  const header = new Uint8Array(entryHeaderBytes);
  const view = new DataView(header.buffer);
  view.setUint32(0, fieldBytes, true);
  view.setUint32(4, dataBytes, true);
  return header;
}

/**
 * Byte length the archive for `entries` will have. Throws the same errors as the writers,
 * so a caller can validate and size a fixed-length upload in one step.
 */
export function measureInputArchive(entries: readonly InputArchiveEntry[]) {
  return measureArchive(entries).totalBytes;
}

/**
 * A small uncompressed container for builder inputs. Keeping all files in one
 * object avoids one GCS subrequest per file in the Cloudflare Worker.
 *
 * Prefer {@link createInputArchiveStream} on the Worker upload path: this one allocates a
 * second copy of every input, and a request near the 50MB ceiling then holds the FormData,
 * the per-file `Uint8Array`s and this buffer at once against a 128MB Worker memory limit.
 */
export function createInputArchive(entries: readonly InputArchiveEntry[]) {
  const { encodedEntries, totalBytes } = measureArchive(entries);

  const output = new Uint8Array(totalBytes);
  output.set(archiveMagic, 0);
  const view = new DataView(output.buffer);
  view.setUint32(4, encodedEntries.length, true);

  let offset = archiveHeaderBytes;
  for (const entry of encodedEntries) {
    view.setUint32(offset, entry.field.length, true);
    view.setUint32(offset + 4, entry.bytes.length, true);
    offset += entryHeaderBytes;
    output.set(entry.field, offset);
    offset += entry.field.length;
    output.set(entry.bytes, offset);
    offset += entry.bytes.length;
  }

  return output;
}

/**
 * The same bytes as {@link createInputArchive}, emitted in pieces instead of one buffer.
 *
 * File payloads are enqueued by reference, so the only allocations are the 8-byte headers
 * and the encoded field names — the largest chunk is the largest single input, never the
 * archive total. The source pulls, so a slow upload applies backpressure instead of letting
 * the whole archive accumulate downstream.
 */
export function createInputArchiveStream(entries: readonly InputArchiveEntry[]): ReadableStream<Uint8Array> {
  // Validate eagerly. `pull` runs after the request is already in flight.
  const { encodedEntries } = measureArchive(entries);

  let index = 0;
  const pending: Uint8Array[] = [archiveHeader(encodedEntries.length)];

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      while (pending.length === 0) {
        if (index >= encodedEntries.length) {
          controller.close();
          return;
        }
        const entry = encodedEntries[index];
        index += 1;
        // Zero-length pieces are skipped rather than enqueued: an empty input still
        // contributes its headers, but an empty chunk carries no bytes and some readers
        // treat one as a signal rather than data.
        for (const piece of [entryHeader(entry.field.length, entry.bytes.length), entry.field, entry.bytes]) {
          if (piece.length > 0) pending.push(piece);
        }
      }
      controller.enqueue(pending.shift()!);
    },
  });
}

export function readInputArchive(bytes: Uint8Array) {
  if (bytes.length < archiveHeaderBytes || !archiveMagic.every((value, index) => bytes[index] === value)) {
    throw new Error("input_archive_invalid");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint32(4, true);
  const entries = new Map<string, Uint8Array>();
  let offset = archiveHeaderBytes;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + entryHeaderBytes > bytes.length) throw new Error("input_archive_truncated");
    const fieldBytes = view.getUint32(offset, true);
    const dataBytes = view.getUint32(offset + 4, true);
    offset += entryHeaderBytes;

    if (fieldBytes > maxFieldBytes || offset + fieldBytes > bytes.length) throw new Error("input_archive_invalid_field");
    const field = textDecoder.decode(bytes.subarray(offset, offset + fieldBytes));
    offset += fieldBytes;
    if (!field || entries.has(field) || offset + dataBytes > bytes.length) throw new Error("input_archive_invalid_entry");

    entries.set(field, bytes.slice(offset, offset + dataBytes));
    offset += dataBytes;
  }

  if (offset !== bytes.length) throw new Error("input_archive_trailing_bytes");
  return entries;
}
