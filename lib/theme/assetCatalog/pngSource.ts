/**
 * PNG 헤더만 읽어 서명과 크기를 확인한다.
 *
 * catalog registry는 `width`/`height`/`png_signature_verified`를 NOT NULL로 요구하는데, publish
 * 경로는 `app/api/admin` 아래에서 돌고 그 경로는 `scripts/verify-edge-safe-imports.mjs`가 Node 전용
 * 모듈을 막는다. 브라우저의 `Image` 디코딩도, Node의 이미지 라이브러리도 쓸 수 없다.
 *
 * PNG는 IHDR 청크가 반드시 첫 청크이고 크기가 고정 위치에 있으므로 헤더 26바이트만으로 충분하다.
 * 전체 픽셀을 디코딩하지 않으니 대용량 원본에서도 비용이 일정하다.
 */

/** 8바이트 서명 + 길이(4) + 타입(4) + IHDR 데이터 앞 8바이트(width/height). */
const pngHeaderBytes = 24;
const ihdrDataLength = 13;

export class PngSourceError extends Error {
  constructor(readonly code: "NOT_PNG" | "INVALID_PNG_HEADER" | "INVALID_PNG_DIMENSIONS") {
    super(code);
    this.name = "PngSourceError";
  }
}

export function hasPngSignature(bytes: Uint8Array) {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

export type PngMetadata = {
  readonly width: number;
  readonly height: number;
};

/**
 * PNG 서명과 IHDR을 검증하고 크기를 돌려준다.
 *
 * 서명만 맞고 IHDR이 어긋난 파일을 통과시키지 않는다 — registry의 크기 값은 export가 바이트를
 * 내려받지 않고 geometry를 계산하는 근거라서, 여기서 틀리면 하류 전체가 틀린다.
 */
export function readPngMetadata(bytes: Uint8Array): PngMetadata {
  if (!hasPngSignature(bytes)) throw new PngSourceError("NOT_PNG");
  if (bytes.length < pngHeaderBytes) throw new PngSourceError("INVALID_PNG_HEADER");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== ihdrDataLength) throw new PngSourceError("INVALID_PNG_HEADER");
  // 첫 청크 타입은 반드시 "IHDR"이다.
  if (view.getUint32(12) !== 0x49484452) throw new PngSourceError("INVALID_PNG_HEADER");

  const width = view.getUint32(16);
  const height = view.getUint32(20);
  // PNG 명세상 0은 허용되지 않는다. 상한은 registry CHECK와 실사용 범위를 함께 고려한 값이다.
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) {
    throw new PngSourceError("INVALID_PNG_DIMENSIONS");
  }
  return { width, height };
}
