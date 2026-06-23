const textEncoder = new TextEncoder();

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

type CentralDirectoryRecord = {
  pathBytes: Uint8Array;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export function createStoredZip(entries: ZipEntry[]) {
  return new Blob([toBlobPart(createStoredZipBytes(entries))], { type: "application/zip" });
}

export function createStoredZipBytes(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const records: CentralDirectoryRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBytes = textEncoder.encode(normalizeZipPath(entry.path));
    const crc32 = crc32Of(entry.bytes);
    const header = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc32 >>> 0, true);
    view.setUint32(18, entry.bytes.length, true);
    view.setUint32(22, entry.bytes.length, true);
    view.setUint16(26, pathBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(pathBytes, 30);

    localParts.push(header, entry.bytes);
    records.push({
      pathBytes,
      crc32,
      compressedSize: entry.bytes.length,
      uncompressedSize: entry.bytes.length,
      localHeaderOffset: offset,
    });
    offset += header.length + entry.bytes.length;
  }

  const centralStart = offset;
  for (const record of records) {
    const header = new Uint8Array(46 + record.pathBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, record.crc32 >>> 0, true);
    view.setUint32(20, record.compressedSize, true);
    view.setUint32(24, record.uncompressedSize, true);
    view.setUint16(28, record.pathBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, record.localHeaderOffset, true);
    header.set(record.pathBytes, 46);
    centralParts.push(header);
    offset += header.length;
  }

  const centralSize = offset - centralStart;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, records.length, true);
  endView.setUint16(10, records.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralStart, true);
  endView.setUint16(20, 0, true);

  const output = new Uint8Array(offset + end.length);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

export function textFile(path: string, text: string): ZipEntry {
  return {
    path,
    bytes: textEncoder.encode(text),
  };
}

export async function blobFile(path: string, blob: Blob): Promise<ZipEntry> {
  return {
    path,
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}

function normalizeZipPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

function toBlobPart(bytes: Uint8Array) {
  return new Uint8Array(bytes);
}

let crcTable: Uint32Array | null = null;

function crc32Of(bytes: Uint8Array) {
  if (!crcTable) crcTable = buildCrcTable();
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}
