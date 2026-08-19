import type { ThemePlatform } from "@/lib/theme/types";

/**
 * catalog export rollout flag.
 *
 * 서버 flag가 꺼져 있으면 기존 `field`/legacy Storage 경로는 계속 동작하고 catalog ref만
 * enqueue 전에 차단한다. 브라우저 producer flag도 별도로 두어 새 선택이 catalog ref를 만들지
 * 않게 한다. 두 flag를 플랫폼별로 나눠 Android/iOS를 독립적으로 canary할 수 있다.
 */
export function isCatalogExportEnabled(platform: ThemePlatform) {
  return readFlag(platform === "android"
    ? process.env.ASSET_CATALOG_EXPORT_ENABLED_ANDROID
    : process.env.ASSET_CATALOG_EXPORT_ENABLED_IOS);
}

/** 클라이언트에서 catalog ref를 새로 만들지 결정한다. `NEXT_PUBLIC_*`만 브라우저에 노출된다. */
export function isCatalogExportProducerEnabled(platform: ThemePlatform) {
  return readFlag(platform === "android"
    ? process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_ANDROID
    : process.env.NEXT_PUBLIC_ASSET_CATALOG_EXPORT_ENABLED_IOS);
}

function readFlag(value: string | undefined) {
  return value?.trim() === "1";
}
