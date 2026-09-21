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
 * 아직 끝나지 않은 병행 기록.
 *
 * 저장 경로는 이 함수를 `void`로 부르고 진행한다(그게 설계다). 그런데 그 직후 목록을 다시
 * 읽으면 게시가 끝나기 전이라 방금 저장한 에셋이 **미등록으로 보였다가 나중에 바뀐다.**
 * 반대로 기다리지 않고 낙관적 항목만 그리면 게시가 실패해도 화면이 영영 모른다.
 *
 * 그래서 진행 중인 게시를 여기서 세어 두고, 목록을 새로 읽기 직전에만 잠깐 기다리게 한다.
 * 저장 자체는 여전히 막지 않는다.
 */
const inFlightPublishes = new Set<Promise<unknown>>();

/**
 * 진행 중인 병행 기록이 모두 끝날 때까지 기다린다. 실패는 이미 함수 안에서 삼켜지므로
 * 여기서는 throw하지 않는다.
 *
 * `timeoutMs`가 있는 이유는 게시 요청이 네트워크에서 멈출 수 있기 때문이다. 그때 목록
 * 새로고침까지 함께 멈추면 화면이 굳는다. 기다림을 포기해도 다음 조회가 정답을 가져온다.
 */
export async function whenShadowPublishesSettle(timeoutMs = 10_000): Promise<void> {
  if (inFlightPublishes.size === 0) return;

  const pending = [...inFlightPublishes];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([
    Promise.allSettled(pending).then(() => true as const),
    new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
  ]);
  if (timer) clearTimeout(timer);
  if (finished) return;

  /**
   * 제한 시간을 넘긴 요청은 추적에서 뺀다.
   *
   * 그대로 두면 **한 번 멈춘 요청이 이후 모든 새로고침을 늦춘다.** 다음 저장이 같은 promise를
   * 다시 집어 또 10초를 기다리고, 그동안 catalog 상태는 낡은 채로 남는다. 기다림을 포기한
   * 요청은 이미 이번 새로고침에서 제 몫을 다했으므로 한 번만 세면 된다.
   *
   * 요청 자체는 취소하지 않는다. 서버가 이미 기록을 끝냈을 수 있고, 늦게 끝나더라도 결과는
   * 다음 목록 조회가 가져온다. 나중에 settle되면 등록해 둔 `finally`가 지우려 하지만 이미
   * 빠진 뒤라 아무 일도 하지 않는다.
   */
  for (const publishing of pending) inFlightPublishes.delete(publishing);
}

/**
 * catalog에 병행 기록한다. 절대 throw하지 않는다.
 *
 * 호출부가 `await`하지 않아도 되지만, 하더라도 저장 흐름을 막지 않도록 결과만 돌려준다.
 */
export function shadowPublishThemeAsset(input: ShadowPublishInput): Promise<ShadowPublishOutcome> {
  const publishing = runShadowPublish(input);
  inFlightPublishes.add(publishing);
  void publishing.finally(() => inFlightPublishes.delete(publishing));
  return publishing;
}

async function runShadowPublish(input: ShadowPublishInput): Promise<ShadowPublishOutcome> {
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
