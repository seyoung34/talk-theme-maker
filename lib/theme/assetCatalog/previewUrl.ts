import { getPublicThemeAssetUrl } from "@/lib/theme/remoteAssets";

/**
 * 공개 preview URL의 provider-neutral 해석기.
 *
 * R2 custom domain이 설정돼 있고 객체 키가 있으면 R2를, 없으면 기존 Supabase `theme-public`
 * URL을 돌려준다. 전환을 에셋 단위로 쪼갤 수 있고, 도메인 환경변수 하나를 비우면 전체가 즉시
 * 기존 경로로 되돌아간다.
 *
 * 이 모듈은 URL 문자열만 만든다. 네트워크도, 저장소 접근도 하지 않는다.
 */

/**
 * R2 custom domain. 예: `https://preview.example.com`
 *
 * 없으면 R2 경로를 아예 만들지 않는다. `r2.dev` 주소는 쓰지 않는다 — Cloudflare가 프로덕션
 * 용도로 권장하지 않고 캐시 제어가 되지 않는다(계획 §6.2).
 */
export function getR2PreviewOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_R2_PREVIEW_ORIGIN?.trim();
  if (!raw) return undefined;
  const normalized = raw.replace(/\/+$/, "");
  // 잘못된 값이 들어오면 조용히 깨진 URL을 만들지 말고 legacy로 떨어진다.
  return /^https:\/\/[a-z0-9.-]+$/i.test(normalized) ? normalized : undefined;
}

export type PreviewSource = {
  /** R2 객체 키. content-addressed라 내용이 바뀌면 키가 바뀐다. */
  readonly r2ObjectKey?: string;
  /** 기존 `theme-public` 경로. R2가 없을 때 쓴다. */
  readonly legacyStoragePath?: string;
  /**
   * legacy URL에만 붙이는 cache busting 값.
   *
   * R2 키는 불변이라 `?v=`가 필요 없고, 붙이면 CDN 캐시가 매번 갈라진다(계획 §8.1).
   */
  readonly legacyVersion?: number | string;
};

export type ResolvedPreviewUrl = {
  readonly url: string;
  readonly provider: "r2" | "supabase";
};

export function resolvePreviewUrl(source: PreviewSource): ResolvedPreviewUrl | undefined {
  const origin = getR2PreviewOrigin();
  if (origin && source.r2ObjectKey) {
    return { url: `${origin}/${encodeR2ObjectKey(source.r2ObjectKey)}`, provider: "r2" };
  }
  const legacy = getPublicThemeAssetUrl(source.legacyStoragePath, source.legacyVersion);
  return legacy ? { url: legacy, provider: "supabase" } : undefined;
}

/** 호출부 대부분은 URL만 필요하다. provider는 관측이 필요할 때만 본다. */
export function previewUrlOf(source: PreviewSource): string | undefined {
  return resolvePreviewUrl(source)?.url;
}

/**
 * 키의 각 구간만 인코딩한다. 슬래시는 경로 구분자로 남겨야 한다.
 *
 * 현재 키는 `preview/v1/<2자>/<sha256>.webp`라 인코딩할 문자가 없지만, 나중에 다른 파생물 키
 * 규칙이 생겨도 안전하도록 둔다.
 */
function encodeR2ObjectKey(objectKey: string) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}
