/**
 * 관리자 저장 뒤 catalog에 병행 기록하는 클라이언트 (계획 §15 rollout 1단계).
 *
 * **저장 성공 뒤에만 부르고, 실패해도 삼킨다.** 기존 저장 경로가 진짜이고 이건 그림자다.
 * 병행 기록이 안 됐다고 관리자가 에셋을 저장하지 못하면 안 된다.
 *
 * 썸네일은 여기서 굽는다. 브라우저의 갤러리 preview 굽기와 같은 canvas + `toBlob("image/webp")`
 * 파이프라인이고, 일회성 backfill 스크립트(`bake-recommended-asset-thumbnails.mjs`)와도 같은
 * 규칙이라 결과가 일관된다.
 */

/** 피커 타일 긴 변이 100~200px이라 256이면 고해상도 화면에서도 충분하다. backfill 스크립트와 같은 값. */
export const pickerThumbnailMaxEdge = 256;
export const pickerThumbnailQuality = 0.82;

export type ShadowPublishInput = {
  readonly kind: "admin" | "template";
  readonly sourceId: string;
  readonly revision?: number;
  readonly variantKey?: "canonical" | "android" | "ios";
  readonly canonical: File;
};

export type ShadowPublishOutcome =
  | { readonly status: "published" | "already-active"; readonly previewsSkipped: boolean }
  | { readonly status: "disabled" }
  | { readonly status: "skipped"; readonly reason: string };

/**
 * catalog에 병행 기록한다. 절대 throw하지 않는다.
 *
 * 호출부가 `await`하지 않아도 되지만, 하더라도 저장 흐름을 막지 않도록 결과만 돌려준다.
 */
export async function shadowPublishThemeAsset(input: ShadowPublishInput): Promise<ShadowPublishOutcome> {
  try {
    // catalog는 export 원본 저장소라 PNG만 받는다. 다른 포맷은 애초에 보내지 않는다.
    if (input.canonical.type && input.canonical.type !== "image/png") {
      return { status: "skipped", reason: "not-png" };
    }

    const form = new FormData();
    form.append("kind", input.kind);
    form.append("sourceId", input.sourceId);
    if (input.revision !== undefined) form.append("revision", String(input.revision));
    if (input.variantKey) form.append("variantKey", input.variantKey);
    form.append("canonical", input.canonical);

    const thumbnail = await bakePickerThumbnail(input.canonical);
    if (thumbnail) form.append("preview", thumbnail, "picker.webp");

    const response = await fetch("/api/admin/theme-assets/publish", { method: "POST", body: form });
    const payload = (await response.json().catch(() => null)) as
      | { status?: string; previewsSkipped?: boolean; error?: string }
      | null;

    if (!response.ok) return { status: "skipped", reason: payload?.error ?? `HTTP ${response.status}` };
    if (payload?.status === "disabled") return { status: "disabled" };
    if (payload?.status === "published" || payload?.status === "already-active") {
      return { status: payload.status, previewsSkipped: Boolean(payload.previewsSkipped) };
    }
    return { status: "skipped", reason: "unexpected-response" };
  } catch (error) {
    // 네트워크·canvas 실패 모두 여기서 끝낸다. 호출부는 저장을 계속한다.
    return { status: "skipped", reason: error instanceof Error ? error.message : "unknown" };
  }
}

/**
 * 긴 변만 맞추고 비율은 유지한다.
 *
 * 피커가 `bg-cover`(세로형)와 `bg-contain`(정사각)을 함께 쓰므로 특정 비율로 크롭하면 한쪽이
 * 깨진다. 원본보다 크게 만들지 않는다 — 작은 아이콘을 확대하면 용량만 늘고 화질은 그대로다.
 */
export async function bakePickerThumbnail(source: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;

    const scale = Math.min(1, pickerThumbnailMaxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // 투명 PNG(아이콘·말풍선)가 많아 배경을 칠하지 않는다. WebP는 알파를 보존한다.
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", pickerThumbnailQuality));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
