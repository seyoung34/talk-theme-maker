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

/**
 * A small uncompressed container for builder inputs. Keeping all files in one
 * object avoids one GCS subrequest per file in the Cloudflare Worker.
 */
export function createInputArchive(entries: readonly InputArchiveEntry[]) {
  const encodedEntries = entries.map((entry) => ({
    field: textEncoder.encode(entry.field),
    bytes: entry.bytes,
  }));
  const totalBytes = encodedEntries.reduce(
    (total, entry) => total + entryHeaderBytes + entry.field.length + entry.bytes.length,
    archiveHeaderBytes,
  );

  if (totalBytes > 0xffffffff) throw new Error("input_archive_too_large");

  const output = new Uint8Array(totalBytes);
  output.set(archiveMagic, 0);
  const view = new DataView(output.buffer);
  view.setUint32(4, encodedEntries.length, true);

  let offset = archiveHeaderBytes;
  for (const entry of encodedEntries) {
    if (entry.field.length > maxFieldBytes) throw new Error("input_archive_field_too_large");
    if (entry.bytes.length > 0xffffffff) throw new Error("input_archive_file_too_large");

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
