"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, Maximize2, RefreshCw } from "lucide-react";
import { describeAdminAssetAnalysis, getAdminAssetCandidate, withAdminAssetPlatformVariant, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { AdminAssetUsageIndex } from "@/lib/theme/adminAssetUsage";
import { TRANSPARENCY_CHECKER_STYLE } from "./AdminAssetLibraryCards";
import { getThemeSlots } from "@/lib/theme/templates";

function slotLabels(platform: string, values: readonly string[]) {
  if (platform !== "android" && platform !== "ios") return values.join(", ");
  const slots = getThemeSlots(platform);
  return values.map((value) => slots.find((slot) => slot.id === value || slot.role === value)?.label ?? value).join(", ");
}

export function AdminAssetInspector({ asset }: {
  asset: AdminAssetCandidate;
}) {
  const [platform, setPlatform] = useState<"android" | "ios">(asset.platform === "ios" ? "ios" : "android");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState(asset);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestRef = useRef(0);
  useEffect(() => {
    setPreviewAsset(asset); requestRef.current += 1;
    setPreviewLoading(false); setPreviewError(null); setFailedUrl(null);
  }, [asset]);
  useEffect(() => () => { requestRef.current += 1; }, []);
  const retryPreview = async () => {
    const requestId = ++requestRef.current;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const refreshed = await getAdminAssetCandidate(asset.id);
      if (requestRef.current !== requestId) return;
      setPreviewAsset(refreshed);
      setFailedUrl(null);
    } catch {
      if (requestRef.current === requestId) setPreviewError("원본 정보를 새로 불러오지 못했습니다.");
    } finally {
      if (requestRef.current === requestId) setPreviewLoading(false);
    }
  };
  const dedicatedVariant = previewAsset.variants?.find((item) => item.platform === platform);
  const variant = { ...withAdminAssetPlatformVariant(previewAsset, platform), ...(dedicatedVariant ? { previewUrl: dedicatedVariant.previewUrl, analysis: dedicatedVariant.analysis } : {}) };
  const url = variant.previewUrl;
  const hasVariants = Boolean(previewAsset.variants?.length);
  const toolClass = "inline-flex size-9 items-center justify-center rounded-lg bg-white/95 text-[var(--color-on-surface-variant)] shadow-sm transition hover:bg-[var(--color-surface-low)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)] disabled:opacity-40";
  return <section className="grid gap-2" aria-label="기존 에셋 상세">
    {hasVariants ? <div className="flex gap-1">{(["android", "ios"] as const).map((value) => <button key={value} type="button" disabled={asset.platform !== "all" && asset.platform !== value && !asset.variants?.some((item) => item.platform === value)} aria-pressed={platform === value} onClick={() => setPlatform(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${platform === value ? "bg-[var(--color-info-container)]" : "bg-[var(--color-surface-low)]"}`}>{value === "android" ? "Android" : "iOS"}</button>)}</div> : null}
    <div className="relative grid h-48 place-items-center overflow-hidden rounded-xl" style={TRANSPARENCY_CHECKER_STYLE}>
      {url && failedUrl !== url ? <>
        <Image unoptimized width={variant.analysis?.width || 400} height={variant.analysis?.height || 300} key={url} src={url} alt={`${asset.title} · ${platform} 원본`} className="max-h-48 max-w-full object-contain" onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrl(url)} />
        {loadedUrl !== url ? <p role="status" className="absolute rounded-lg bg-white/90 px-3 py-2 text-xs">이미지 불러오는 중…</p> : null}
      </> : <p className="px-5 pt-10 text-center text-xs">원본을 불러오지 못했습니다. 새로고침 버튼으로 다시 조회해 주세요.</p>}
    <div className="absolute right-2 top-2 flex gap-1">
      <button type="button" aria-label="원본 다시 조회" title="원본 다시 조회" aria-busy={previewLoading} disabled={previewLoading} onClick={() => void retryPreview()} className={toolClass}>{previewLoading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}</button>
      <Dialog.Root>
        <Dialog.Trigger asChild><button type="button" aria-label="확대 보기" title="확대 보기" disabled={!url || failedUrl === url} className={toolClass}><Maximize2 size={16} aria-hidden="true" /></button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[90vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 gap-3 overflow-auto rounded-2xl bg-white p-4">
          <Dialog.Title className="font-bold">{asset.title} · {platform}</Dialog.Title><Dialog.Description className="text-xs">{describeAdminAssetAnalysis(variant.analysis)} · {variant.fileName}</Dialog.Description>
          {url ? <div style={TRANSPARENCY_CHECKER_STYLE}><Image unoptimized width={variant.analysis?.width || 400} height={variant.analysis?.height || 300} src={url} alt={asset.title} className="mx-auto max-h-[70vh] w-auto max-w-full object-contain" /></div> : null}
          <Dialog.Close className="justify-self-end rounded-lg border px-4 py-2 text-sm">닫기</Dialog.Close>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
    </div>
    {previewError ? <p role="alert" className="text-xs text-red-700">{previewError}</p> : null}
    <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-on-surface-variant)]"><span>{describeAdminAssetAnalysis(variant.analysis)} · {variant.mimeType.replace("image/", "").toUpperCase()}</span><span>{dedicatedVariant ? "전용 원본" : asset.platform === "all" ? "공통 원본" : platform === "ios" ? "iOS 원본" : "Android 원본"}</span></div>
    <details className="text-xs text-[var(--color-on-surface-variant)]">
      <summary className="cursor-pointer py-1">파일 정보</summary>
      <dl className="grid gap-1 break-words py-2 leading-5">
      <div><dt className="inline font-bold">파일: </dt><dd className="inline">{variant.fileName} · {variant.mimeType}</dd></div>
      {variant.file ? <div><dt className="inline font-bold">용량: </dt><dd className="inline">{`${(variant.file.size / 1024).toFixed(1)} KB`}</dd></div> : null}
      <div><dt className="inline font-bold">수정: </dt><dd className="inline">{new Date(asset.updatedAt).toLocaleString("ko-KR")}</dd></div>
      </dl>
    </details>
  </section>;
}

export function AdminAssetConnections({ assetId, usage, error, onRetry }: { assetId: string; usage: AdminAssetUsageIndex | null; error: string | null; onRetry: () => void }) {
  const bundles = usage?.byAssetId[assetId] ?? [];
  return <section aria-label="연결된 시스템 템플릿" className="grid gap-3 border-t border-[var(--color-outline-variant)] pt-4">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">연결된 템플릿{bundles.length ? <span className="ml-2 text-xs font-normal text-[var(--color-on-surface-variant)]">{bundles.length}</span> : null}</h3><button type="button" onClick={onRetry} aria-label="연결 다시 조회" title="연결 다시 조회" className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)]"><RefreshCw size={15} aria-hidden="true" /></button></div>
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : !usage ? <p role="status" className="text-xs">연결 확인 중…</p> : <>
      {!usage.complete ? <p className="text-xs text-amber-800">일부 결과입니다. 연결 없음으로 판단할 수 없습니다.</p> : null}
      {bundles.length ? <ul className="grid gap-3">{bundles.map((bundle) => {
        const groups = new Map<string, { platforms: string[]; slots: string; state: string }>();
        for (const item of bundle.variants) {
          const slots = slotLabels(item.platform, item.appliedSlots?.length ? item.appliedSlots : item.slots);
          const state = item.appliedSlots === undefined ? "적용 미확인" : item.appliedSlots.length ? "적용 중" : "후보 보관";
          const key = JSON.stringify([slots, state]);
          const group = groups.get(key) ?? { platforms: [], slots, state };
          const platform = item.platform === "ios" ? "iOS" : item.platform === "android" ? "Android" : item.platform;
          if (!group.platforms.includes(platform)) group.platforms.push(platform);
          groups.set(key, group);
        }
        return <li key={bundle.id} className="grid gap-1 text-xs leading-5"><div className="flex items-center justify-between gap-2"><p className="min-w-0 break-words text-sm font-semibold">{bundle.title}</p><span className="shrink-0 text-[var(--color-on-surface-variant)]">{bundle.status === "published" ? "발행" : bundle.status === "draft" ? "초안" : "보관"} · {bundle.visibility === "public" ? "공개" : "비공개"}</span></div>{Array.from(groups, ([key, group]) => <p key={key} className="break-words text-[var(--color-on-surface-variant)]">{group.platforms.join(" · ")} — {group.slots} · {group.state}</p>)}</li>;
      })}</ul> : <p className="text-xs text-[var(--color-on-surface-variant)]">{usage.complete && !usage.unknownReferences ? "확인된 연결이 없습니다." : "확인된 참조는 없지만, 연결 여부를 확정할 수 없습니다."}</p>}
    </>}
  </section>;
}
