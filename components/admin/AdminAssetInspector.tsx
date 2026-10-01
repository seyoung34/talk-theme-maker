"use client";

import { useState } from "react";
import Image from "next/image";
import { describeAdminAssetAnalysis, withAdminAssetPlatformVariant, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { AdminAssetUsageIndex } from "@/lib/theme/adminAssetUsage";
import { TRANSPARENCY_CHECKER_STYLE } from "./AdminAssetLibraryCards";

export function AdminAssetInspector({ asset, usage, error, onRetry }: {
  asset: AdminAssetCandidate;
  usage: AdminAssetUsageIndex | null;
  error: string | null;
  onRetry: () => void;
}) {
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const variant = withAdminAssetPlatformVariant(asset, platform);
  const url = variant.previewUrl;
  const bundles = usage?.byAssetId[asset.id] ?? [];
  return <section className="grid gap-3 rounded-2xl border border-[var(--color-outline-variant)] p-3" aria-label="기존 에셋 상세">
    <div className="flex gap-2">{(["android", "ios"] as const).map((value) => <button key={value} type="button" aria-pressed={platform === value} onClick={() => setPlatform(value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${platform === value ? "bg-[var(--color-info-container)]" : "bg-[var(--color-surface-low)]"}`}>{value === "android" ? "Android" : "iOS"}</button>)}</div>
    <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl" style={TRANSPARENCY_CHECKER_STYLE}>
      {url && failedUrl !== url ? <Image unoptimized width={variant.analysis?.width || 400} height={variant.analysis?.height || 300} key={url} src={url} alt={`${asset.title} · ${platform} 원본`} className="max-h-64 max-w-full object-contain" onError={() => setFailedUrl(url)} /> : <p className="p-3 text-xs">원본 미리보기를 불러오지 못했습니다. 에셋을 다시 선택해 주세요.</p>}
    </div>
    <dl className="grid gap-1 break-all text-xs text-[var(--color-on-surface-variant)]">
      <div><dt className="inline font-bold">크기: </dt><dd className="inline">{describeAdminAssetAnalysis(variant.analysis)}</dd></div>
      <div><dt className="inline font-bold">파일: </dt><dd className="inline">{variant.fileName} · {variant.mimeType}</dd></div>
      <div><dt className="inline font-bold">수정: </dt><dd className="inline">{new Date(asset.updatedAt).toLocaleString("ko-KR")}</dd></div>
    </dl>
    <h3 className="text-sm font-bold">연결된 시스템 템플릿</h3>
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : !usage ? <p role="status" className="text-xs">연결 확인 중…</p> : <>
      {!usage.complete ? <p className="text-xs text-amber-800">일부 결과입니다. 연결 없음으로 판단할 수 없습니다.</p> : null}
      {usage.unknownReferences > 0 ? <p className="text-xs text-amber-800">출처를 확인할 수 없는 기존 참조 {usage.unknownReferences}개는 연결 판정에서 제외했습니다.</p> : null}
      {bundles.length ? <ul className="grid gap-2">{bundles.map((bundle) => <li key={bundle.id} className="rounded-lg bg-[var(--color-surface-low)] p-2 text-xs">
        <p className="font-bold">{bundle.title}</p><p>{bundle.status} · {bundle.visibility} · 저장 참조 (실제 적용 미판정)</p>
        {bundle.variants.map((item) => <p key={item.id}>{item.platform}: {item.slots.join(", ")}</p>)}
      </li>)}</ul> : <p className="text-xs">확인된 저장 참조가 없습니다.</p>}
      <p className="text-[11px]">조회: {new Date(usage.checkedAt).toLocaleTimeString("ko-KR")}</p>
    </>}
    <button type="button" onClick={onRetry} className="justify-self-start rounded-lg border px-3 py-2 text-xs font-bold">연결 다시 조회</button>
  </section>;
}
