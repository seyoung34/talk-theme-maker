import { deflateSync } from "node:zlib";

/**
 * 테스트용 단색 PNG를 만든다.
 *
 * 고정 바이너리를 저장소에 두지 않는 이유는 **복원된 이미지가 올린 이미지와 같은지** 확인하려면
 * 색과 크기를 테스트마다 다르게 줄 수 있어야 하기 때문이다. 자동 저장은 `File`을 IndexedDB에
 * structured clone으로 넣는데, 여기서 바이트가 보존되는지가 이 스위트의 핵심 검증 대상이다.
 * (단위 테스트의 `fake-indexeddb`는 `File`을 메타데이터만 남은 객체로 낮춰 이 확인을 할 수 없다.)
 */
export type Rgb = readonly [number, number, number];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function createSolidPng(width: number, height: number, [r, g, b]: Rgb): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: truecolor

  // 각 스캔라인은 필터 바이트(0 = None)로 시작한다.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const offset = y * (1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      raw[offset + 1 + x * 3] = r;
      raw[offset + 2 + x * 3] = g;
      raw[offset + 3 + x * 3] = b;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
