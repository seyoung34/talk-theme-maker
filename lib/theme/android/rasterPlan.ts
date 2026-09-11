import type { ThemeResourceRole } from "../types.js";

/**
 * Android 파생 이미지의 크기·합성 규칙. 브라우저 렌더링(`assetCompiler.ts`), Worker의 catalog
 * transform 검증, Cloud Run Android 빌더가 **같은 규칙**을 써야 한다.
 *
 * 이 모듈은 순수 계산만 담고 DOM API와 `@/` 별칭을 쓰지 않는다. 빌더는 번들러 없이 Node로
 * 실행되고 `services/android-builder/tsconfig.json`이 `moduleResolution: NodeNext` + `paths: {}`
 * 이라 별칭을 해석하지 못하기 때문이다. 규칙이 브라우저 전용 모듈에 얹혀 있으면 빌더 컴파일이
 * 깨진다 — 실제로 2026-08-25부터 09-11까지 그 상태였고 이미지를 다시 만들 수 없었다.
 *
 * 따라서 여기에는 상대 경로 `.js` import만 두고, 타입도 `types.ts`처럼 별칭이 없는 모듈에서만
 * 가져온다. `templates.ts`는 `@/`와 JSON import를 쓰므로 끌어들이지 않는다.
 */
export type AndroidRasterPlan = {
  width: number;
  height: number;
  mode: "cover" | "transparent";
};

const adaptiveIconSizes = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
} as const;

const legacyIconSizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
} as const;

const derivedLauncherRoles = new Set<ThemeResourceRole>([
  "theme_icon",
  "launcher_icon",
  "launcher_round",
  "launcher_foreground",
]);

export function isAndroidDerivedLauncherRole(role: ThemeResourceRole) {
  return derivedLauncherRoles.has(role);
}

/** `ThemeAssetSlot`에서 이 계산에 실제로 쓰이는 것은 `role` 하나뿐이다. */
export type AndroidRasterPlanSlot = { role: ThemeResourceRole };

export function getAndroidRasterPlan(slot: AndroidRasterPlanSlot, targetPath: string, transparentForeground = false): AndroidRasterPlan | undefined {
  const density = readAndroidDensity(targetPath);

  if (slot.role === "theme_icon") return { width: 144, height: 144, mode: "cover" };
  if (slot.role === "launcher_background") {
    const size = density ? adaptiveIconSizes[density] : 432;
    return { width: size, height: size, mode: "cover" };
  }
  if (slot.role === "launcher_icon" || slot.role === "launcher_round") {
    const size = density ? legacyIconSizes[density] : 192;
    return { width: size, height: size, mode: "cover" };
  }
  if (slot.role === "launcher_foreground") {
    const size = density ? adaptiveIconSizes[density] : 432;
    return { width: size, height: size, mode: transparentForeground ? "transparent" : "cover" };
  }
  if (slot.role === "splash") {
    const size = targetPath.includes("drawable-xhdpi/") ? { width: 720, height: 1280 } : { width: 1440, height: 2560 };
    return { ...size, mode: "cover" };
  }
  if (slot.role === "splash_landscape") {
    const size = targetPath.includes("drawable-land-xhdpi/") ? { width: 1280, height: 720 } : { width: 2560, height: 1440 };
    return { ...size, mode: "cover" };
  }
  return undefined;
}

export function readAndroidDensity(targetPath: string): keyof typeof adaptiveIconSizes | undefined {
  const match = targetPath.match(/(?:mipmap|drawable)(?:-land)?-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)(?:\/|$)/);
  return match?.[1] as keyof typeof adaptiveIconSizes | undefined;
}
