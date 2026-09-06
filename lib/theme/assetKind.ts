import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeResourceRole } from "@/lib/theme/types";

/**
 * 테마 에셋의 종류.
 *
 * 관리자 에셋(`admin_assets.asset_kind`)과 사용자 업로드가 **같은 어휘를 쓴다.** 두 곳이 갈라지면
 * 같은 이미지가 관리자 목록과 사용자 목록에서 다른 종류로 보인다.
 *
 * DB 제약과 이 목록이 어긋나면 저장이 실패한다 —
 * `202606180001_supabase_theme_storage.sql`, `20260904090000_admin_asset_passcode_indicator_to_icon.sql`.
 */
export type ThemeAssetKind = "background" | "icon" | "bubble" | "profile" | "launcher" | "passcode";

/**
 * 슬롯이 어떤 종류의 에셋을 받는가.
 *
 * **검사 순서가 규칙의 일부다.** 아래로 갈수록 넓은 조건이라 순서를 바꾸면 분류가 달라진다.
 * 특히 `passcode_indicator`는 아이콘 후보를 쓰므로 `passcode_`보다 먼저 아이콘으로 가르고,
 * 배경 판정은 가장 마지막이다.
 * 그래서 이 규칙을 복제하지 않는다 — 복제본은 순서를 잃는다.
 */
export function inferThemeAssetKind(slot: Pick<ThemeAssetSlot, "role" | "group" | "section" | "kind">): ThemeAssetKind {
  if (slot.role.startsWith("launcher_")) return "launcher";
  if (slot.role === "theme_icon" || slot.role.startsWith("tab_icon_")) return "icon";
  if (slot.role === "profile_image" || slot.role.startsWith("profile_image_")) return "profile";
  if (slot.role.startsWith("bubble_")) return "bubble";
  // 잠금화면 표시(점/아이콘)는 passcode 배경과 모양·용도가 전혀 다른 아이콘이다. 별도
  // kind로 나누지 않고 일반 아이콘 후보를 함께 쓰되, passcode_* 배경 검사보다 먼저 가른다.
  if (slot.role.startsWith("passcode_indicator")) return "icon";
  if (slot.role.startsWith("passcode_")) return "passcode";
  if (slot.group === "background" || slot.role === "tab_background_image") return "background";
  return "icon";
}

/**
 * role만 있을 때의 분류. 슬롯을 못 찾은 옛 레코드를 읽을 때만 쓴다.
 *
 * `group`을 못 보므로 배경 판정이 약하고 기본값도 다르다(`background`). 슬롯이 있으면
 * `inferThemeAssetKind`를 써야 한다.
 */
export function inferLegacyThemeAssetKind(role: ThemeResourceRole): ThemeAssetKind {
  if (role.startsWith("launcher_")) return "launcher";
  if (role === "theme_icon" || role.startsWith("tab_icon_")) return "icon";
  if (role === "profile_image" || role.startsWith("profile_image_")) return "profile";
  if (role.startsWith("bubble_")) return "bubble";
  if (role.startsWith("passcode_indicator")) return "icon";
  if (role.startsWith("passcode_")) return "passcode";
  return "background";
}

/**
 * 사용자 업로드를 공유할 때 쓰는 종류.
 *
 * 색상 슬롯은 업로드를 받지 않으므로 종류가 없다. `ThemeResourceRole`에는 이미지뿐 아니라
 * 색상 role이 수십 개 들어 있어서 role만 보고 분류하면 색상까지 끌려 들어온다.
 * **업로드 가능 여부는 role이 아니라 `slot.kind`가 정한다.**
 */
export function getUploadAssetKind(slot: Pick<ThemeAssetSlot, "role" | "group" | "section" | "kind">): ThemeAssetKind | undefined {
  if (slot.kind === "color") return undefined;
  return inferThemeAssetKind(slot);
}
