"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { describeAdminAssetAnalysis, getAdminAssetCandidate, withAdminAssetPlatformVariant, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { AdminAssetUsageIndex } from "@/lib/theme/adminAssetUsage";
import { TRANSPARENCY_CHECKER_STYLE } from "./AdminAssetLibraryCards";
import { getThemeSlots } from "@/lib/theme/templates";

function slotLabels(platform: string, values: readonly string[]) {
  if (platform !== "android" && platform !== "ios") return values.join(", ");
  const slots = getThemeSlots(platform);
  return values.map((value) => slots.find((slot) => slot.id === value || slot.role === value)?.label ?? value).join(", ");
}

const relationLabels: Record<string, string> = { catalog: "catalog 직접 참조", original: "관리 원본 경로", derived: "원본을 추적한 편집본", "saved-id": "저장 식별자 일치" };

export function AdminAssetInspector({ asset, usage, error, onRetry, onCreate, onOpenTemplate }: {
  asset: AdminAssetCandidate;
  usage: AdminAssetUsageIndex | null;
  error: string | null;
  onRetry: () => void;
  onCreate: (platform: "android" | "ios") => Promise<void>;
  onOpenTemplate: (bundleId: string, variant: { id: string; platform: string; baseTemplateId?: string }) => void;
}) {
  const [platform, setPlatform] = useState<"android" | "ios">(asset.platform === "ios" ? "ios" : "android");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState(asset);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cloneLoading, setCloneLoading] = useState(false);
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
  const bundles = usage?.byAssetId[asset.id] ?? [];
  return <section className="grid gap-3 rounded-2xl border border-[var(--color-outline-variant)] p-3" aria-label="기존 에셋 상세">
    <div className="flex gap-2">{(["android", "ios"] as const).map((value) => <button key={value} type="button" disabled={asset.platform !== "all" && asset.platform !== value && !asset.variants?.some((item) => item.platform === value)} aria-pressed={platform === value} onClick={() => setPlatform(value)} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 ${platform === value ? "bg-[var(--color-info-container)]" : "bg-[var(--color-surface-low)]"}`}>{value === "android" ? "Android" : "iOS"}</button>)}</div>
    <p className="text-[11px] text-[var(--color-on-surface-variant)]">{dedicatedVariant ? "플랫폼 전용 원본" : "공통 원본"}</p>
    <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl" style={TRANSPARENCY_CHECKER_STYLE}>
      {url && failedUrl !== url ? <>
        <Image unoptimized width={variant.analysis?.width || 400} height={variant.analysis?.height || 300} key={url} src={url} alt={`${asset.title} · ${platform} 원본`} className="max-h-64 max-w-full object-contain" onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrl(url)} />
        {loadedUrl !== url ? <p role="status" className="absolute rounded-lg bg-white/90 px-3 py-2 text-xs">이미지 불러오는 중…</p> : null}
      </> : <p className="p-3 text-xs">원본 미리보기를 불러오지 못했습니다. 원본 다시 조회를 눌러 주세요.</p>}
    </div>
    {previewError ? <p role="alert" className="text-xs text-red-700">{previewError}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={previewLoading} onClick={() => void retryPreview()} className="rounded-lg border px-3 py-2 text-xs font-bold">{previewLoading ? "원본 조회 중…" : "원본 다시 조회"}</button>
      <Dialog.Root>
        <Dialog.Trigger asChild><button type="button" disabled={!url || failedUrl === url} className="rounded-lg border px-3 py-2 text-xs font-bold">확대 보기</button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[90vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 gap-3 overflow-auto rounded-2xl bg-white p-4">
          <Dialog.Title className="font-bold">{asset.title} · {platform}</Dialog.Title><Dialog.Description className="text-xs">{describeAdminAssetAnalysis(variant.analysis)} · {variant.fileName}</Dialog.Description>
          {url ? <div style={TRANSPARENCY_CHECKER_STYLE}><Image unoptimized width={variant.analysis?.width || 400} height={variant.analysis?.height || 300} src={url} alt={asset.title} className="mx-auto max-h-[70vh] w-auto max-w-full object-contain" /></div> : null}
          <Dialog.Close className="justify-self-end rounded-lg border px-4 py-2 text-sm">닫기</Dialog.Close>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <button type="button" disabled={cloneLoading} onClick={() => {
        setCloneLoading(true);
        void onCreate(platform).finally(() => setCloneLoading(false));
      }} className="rounded-lg border px-3 py-2 text-xs font-bold">{cloneLoading ? "새 후보 원본 준비 중…" : "이 이미지로 새 후보 만들기"}</button>
    </div>
    <dl className="grid gap-1 break-all text-xs text-[var(--color-on-surface-variant)]">
      <div><dt className="inline font-bold">크기: </dt><dd className="inline">{describeAdminAssetAnalysis(variant.analysis)}</dd></div>
      <div><dt className="inline font-bold">파일: </dt><dd className="inline">{variant.fileName} · {variant.mimeType}</dd></div>
      <div><dt className="inline font-bold">용량: </dt><dd className="inline">{variant.file ? `${(variant.file.size / 1024).toFixed(1)} KB` : "미확인"}</dd></div>
      <div><dt className="inline font-bold">수정: </dt><dd className="inline">{new Date(asset.updatedAt).toLocaleString("ko-KR")}</dd></div>
    </dl>
    <h3 className="text-sm font-bold">연결된 시스템 템플릿</h3>
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : !usage ? <p role="status" className="text-xs">연결 확인 중…</p> : <>
      {!usage.complete ? <p className="text-xs text-amber-800">일부 결과입니다. 연결 없음으로 판단할 수 없습니다.</p> : null}
      {usage.unknownReferences > 0 ? <p className="text-xs text-amber-800">출처를 확인할 수 없는 기존 참조 {usage.unknownReferences}개는 연결 판정에서 제외했습니다.</p> : null}
      {bundles.length ? <ul className="grid gap-2">{bundles.map((bundle) => <li key={bundle.id} className="rounded-lg bg-[var(--color-surface-low)] p-2 text-xs">
        <p className="font-bold">{bundle.title}</p><p>{bundle.status === "published" ? "발행" : bundle.status === "draft" ? "초안" : "보관"} · {bundle.visibility === "public" ? "공개" : "비공개"}</p>
        {bundle.variants.map((item) => <div key={item.id} className="mt-2 grid gap-1">
          <p>{item.platform}: 저장 슬롯 {slotLabels(item.platform, item.slots)}</p>
          <p>{item.appliedSlots === undefined ? "실제 적용 미판정" : item.appliedSlots.length ? `적용 중: ${slotLabels(item.platform, item.appliedSlots)}` : "후보로만 보관"}</p>
          {item.relationKinds?.length ? <p>연결 근거: {item.relationKinds.map((kind) => relationLabels[kind] ?? kind).join(", ")}</p> : null}
          <button type="button" disabled={!item.baseTemplateId} onClick={() => onOpenTemplate(bundle.id, item)} className="justify-self-start rounded-lg border px-2 py-1 font-bold">{item.platform} 템플릿 열기</button>
        </div>)}
      </li>)}</ul> : <p className="text-xs">확인된 저장 참조가 없습니다.</p>}
      <p className="text-[11px]">조회: {new Date(usage.checkedAt).toLocaleTimeString("ko-KR")}</p>
    </>}
    <button type="button" onClick={onRetry} className="justify-self-start rounded-lg border px-3 py-2 text-xs font-bold">연결 다시 조회</button>
  </section>;
}
