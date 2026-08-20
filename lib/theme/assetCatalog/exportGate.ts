import type { ThemePlatform } from "@/lib/theme/types";

export type CatalogExportScope = {
  /** 요청 세션의 Supabase auth user id. 서버 canary 범위에만 사용한다. */
  readonly userId?: string;
  /** manifest 안에 포함된 catalog 논리 자산 id. */
  readonly assetIds?: readonly string[];
};

/**
 * catalog export rollout flag.
 *
 * 서버 flag가 꺼져 있으면 기존 `field`/legacy Storage 경로는 계속 동작하고 catalog ref만
 * enqueue 전에 차단한다. 브라우저 producer flag도 별도로 두어 새 선택이 catalog ref를 만들지
 * 않게 한다. 두 flag를 플랫폼별로 나눠 Android/iOS를 독립적으로 canary할 수 있다.
 */
export function isCatalogExportEnabled(platform: ThemePlatform, scope: CatalogExportScope = {}) {
  return readFlag(platform === "android"
    ? process.env.ASSET_CATALOG_EXPORT_ENABLED_ANDROID
    : process.env.ASSET_CATALOG_EXPORT_ENABLED_IOS) && isCatalogExportScopeAllowed(platform, scope, "server");
}

/** 클라이언트에서 catalog ref를 새로 만들지 결정한다. `NEXT_PUBLIC_*`만 브라우저에 노출된다. */
export function isCatalogExportProducerEnabled(platform: ThemePlatform, scope: CatalogExportScope = {}) {
  return readFlag(platform === "android"
    ? process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_ANDROID
    : process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_IOS) && isCatalogExportScopeAllowed(platform, scope, "client");
}

/**
 * 전역 platform flag가 켜진 뒤에도 canary 범위를 좁힐 수 있는 2차 경계다.
 *
 * allowlist 환경 변수가 비어 있으면 해당 축에는 제한을 걸지 않는다. 따라서 기존 flag-only
 * rollout과 호환되지만, user/asset allowlist 중 하나라도 설정하면 나머지 요청은 fail-closed한다.
 * client 쪽에는 NEXT_PUBLIC 값만 읽히며, 실제 권한 판정은 항상 Worker의 server allowlist와
 * registry 정책이 맡는다.
 */
export function isCatalogExportScopeAllowed(
  platform: ThemePlatform,
  scope: CatalogExportScope,
  channel: "server" | "client",
) {
  const values = readScopeEnvironment(platform, channel);
  const allowedUsers = readAllowlist(values.users);
  const allowedAssets = readAllowlist(values.assets);

  if (allowedUsers.length && (!scope.userId || !allowedUsers.includes(scope.userId))) return false;
  if (allowedAssets.length && (!scope.assetIds?.length || scope.assetIds.some((assetId) => !allowedAssets.includes(assetId)))) return false;
  return true;
}

/**
 * 이 논리 자산 하나가 서버 asset allowlist 범위 안인지 본다.
 *
 * `isCatalogExportScopeAllowed`와 달리 user allowlist를 보지 않는다. 호출자(추천 API)는
 * 요청 사용자를 모르고, 사용자 범위는 export 시점에 Worker가 다시 확인한다.
 *
 * 이 검사가 필요한 이유: 브라우저는 `NEXT_PUBLIC_*` 값만 볼 수 있어 서버 allowlist를 알 수
 * 없다. 두 목록이 어긋나 브라우저가 범위 밖 자산에 ref를 만들면, Worker가 manifest 전체를
 * 503으로 거절하고 바이트는 업로드된 적이 없어 폴백도 없다. 그래서 **ref를 나눠 주는 쪽**인
 * 서버가 범위를 판정한다. 범위 밖 자산은 ref 없이 내려가 기존 File 업로드 경로로 동작한다.
 */
export function isCatalogExportAssetAllowed(platform: ThemePlatform, logicalAssetId: string) {
  const allowed = readAllowlist(platform === "android"
    ? process.env.ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST
    : process.env.ASSET_CATALOG_EXPORT_IOS_ASSET_ALLOWLIST);
  return allowed.length === 0 || allowed.includes(logicalAssetId);
}

/**
 * client/server allowlist가 어긋났는지 서버에서 한 번 확인해 로그로 남긴다.
 *
 * 위 `isCatalogExportAssetAllowed`가 asset 축의 불일치는 구조적으로 없애지만, user 축과
 * 플래그 자체는 여전히 두 곳에 손으로 적는다. 어긋나도 조용하면 운영자가 알 방법이 없다.
 */
export function warnOnCatalogExportScopeDrift(platform: ThemePlatform) {
  if (driftWarned.has(platform)) return;
  driftWarned.add(platform);

  const server = readScopeEnvironment(platform, "server");
  const client = readScopeEnvironment(platform, "client");
  const drift: string[] = [];
  if (isBroader(readAllowlist(client.users), readAllowlist(server.users))) drift.push("user allowlist");
  if (isBroader(readAllowlist(client.assets), readAllowlist(server.assets))) drift.push("asset allowlist");
  if (!drift.length) return;

  console.warn("Catalog export scope drift", JSON.stringify({
    platform,
    broaderOnClient: drift,
    hint: "NEXT_PUBLIC_ASSET_CATALOG_EXPORT_* 값이 서버 allowlist보다 넓습니다. 범위 밖 자산은 export에서 거절됩니다.",
  }));
}

const driftWarned = new Set<ThemePlatform>();

/** 빈 목록은 "제한 없음"이라 가장 넓다. */
function isBroader(client: readonly string[], server: readonly string[]) {
  if (!server.length) return false;
  if (!client.length) return true;
  return client.some((value) => !server.includes(value));
}

function readFlag(value: string | undefined) {
  return value?.trim() === "1";
}

/**
 * `NEXT_PUBLIC_*` 값은 Next.js가 정적 property access만 브라우저 번들에 주입한다.
 * computed `process.env[name]`를 사용하면 production에서 allowlist가 사라질 수 있으므로
 * 플랫폼·채널별 참조를 명시적으로 적는다.
 */
function readScopeEnvironment(platform: ThemePlatform, channel: "server" | "client") {
  if (channel === "server") {
    return platform === "android"
      ? { users: process.env.ASSET_CATALOG_EXPORT_ANDROID_USER_ALLOWLIST, assets: process.env.ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST }
      : { users: process.env.ASSET_CATALOG_EXPORT_IOS_USER_ALLOWLIST, assets: process.env.ASSET_CATALOG_EXPORT_IOS_ASSET_ALLOWLIST };
  }

  return platform === "android"
    ? { users: process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ANDROID_USER_ALLOWLIST, assets: process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST }
    : { users: process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_IOS_USER_ALLOWLIST, assets: process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_IOS_ASSET_ALLOWLIST };
}

function readAllowlist(value: string | undefined) {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
