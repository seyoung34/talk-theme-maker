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
