"use client";

import { AlertTriangle, LoaderCircle, Pencil } from "lucide-react";
import type { CSSProperties } from "react";

import {
  describeAdminAssetAnalysis,
  getAdminAssetKindLabel,
  type AdminBubbleAdjustment,
} from "@/lib/theme/adminAssets";
import {
  adminAssetListTileUrl,
  describeAdminAssetScope,
  getAdminAssetScopeLabel,
  type AdminAssetListItem,
} from "@/lib/theme/adminAssetList";
import { formatAdminAssetTargets, getAdminAssetSlotLabel } from "@/lib/theme/adminAssetWorkspace";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

/** 투명 영역을 흰색이 아닌 체커무늬로 표시하기 위한 배경 스타일. */
export const TRANSPARENCY_CHECKER_STYLE: CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #dce1e5 25%, transparent 25%), linear-gradient(-45deg, #dce1e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #dce1e5 75%), linear-gradient(-45deg, transparent 75%, #dce1e5 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0",
};

export function BubblePlatformSummary({
  adjustment,
  activePlatform,
  onSelectPlatform,
}: {
  adjustment: AdminBubbleAdjustment;
  activePlatform: ThemePlatform;
  onSelectPlatform: (platform: ThemePlatform) => void;
}) {
  const markerText = adjustment.markers
    ? `stretch ${formatRange(adjustment.markers.top)} / text ${formatRange(adjustment.markers.bottom)}`
    : "기본 마커 추천값 사용";
  const insetText = adjustment.insets
    ? `여백 ${adjustment.insets.top}/${adjustment.insets.right}/${adjustment.insets.bottom}/${adjustment.insets.left}`
    : "기본 inset 추천값 사용";
  const stretchText = adjustment.stretch ? `stretch point ${adjustment.stretch.x}, ${adjustment.stretch.y}` : "기본 stretch point 사용";

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <BubblePlatformCard
        platform="android"
        active={activePlatform === "android"}
        title="Android 9-patch 기준"
        description="늘어나는 영역과 텍스트 영역을 마커로 저장합니다."
        detail={markerText}
        onSelect={() => onSelectPlatform("android")}
      />
      <BubblePlatformCard
        platform="ios"
        active={activePlatform === "ios"}
        title="iOS inset 기준"
        description="텍스트 여백과 stretch point를 CSS slicing 기준으로 저장합니다."
        detail={`${insetText} · ${stretchText}`}
        onSelect={() => onSelectPlatform("ios")}
      />
    </div>
  );
}

function BubblePlatformCard({
  platform,
  active,
  title,
  description,
  detail,
  onSelect,
}: {
  platform: ThemePlatform;
  active: boolean;
  title: string;
  description: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`grid gap-2 rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 active:translate-y-0 ${active ? "border-[var(--color-info)] bg-[var(--color-info-container)]" : "border-[var(--color-outline-variant)] bg-white hover:bg-[var(--color-surface-low)]"}`}
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-2">
        <strong className="text-sm font-black text-[var(--color-on-surface)]">{title}</strong>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${active ? "bg-white text-[var(--color-info-strong)]" : "bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]"}`}>{platform}</span>
      </span>
      <span className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{description}</span>
      <span className="rounded-xl bg-[var(--color-surface-low)] px-3 py-2 text-[11px] font-bold leading-5 text-[var(--color-on-surface-variant)]">{detail}</span>
    </button>
  );
}

function formatRange(range: { start: number; end: number }) {
  return `${range.start}-${range.end}`;
}

export function AdminAssetCard({
  asset,
  slots,
  warnings,
  deleting,
  onEdit,
  onDelete,
}: {
  asset: AdminAssetListItem;
  slots: readonly ThemeAssetSlot[];
  warnings: string[];
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tileUrl = adminAssetListTileUrl(asset);
  const scopeLabel = getAdminAssetScopeLabel(describeAdminAssetScope(asset.targets));
  return (
    <article className={`relative grid gap-3 overflow-hidden rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)] transition duration-200 ${deleting ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(42,103,103,0.1)]"}`}>
      {deleting ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-[1px]" role="status" aria-live="polite">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700 shadow-sm">
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
            삭제 중
          </span>
        </div>
      ) : null}
      <div className="aspect-[4/3] overflow-hidden rounded-[18px] border border-[var(--color-outline-variant)]" style={TRANSPARENCY_CHECKER_STYLE}>
        <div className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: tileUrl ? `url(${tileUrl})` : undefined }} />
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--color-inverse-surface)] px-2 py-0.5 text-[10px] font-black text-[var(--color-inverse-on-surface)]">{scopeLabel}</span>
          {asset.variantPlatforms.map((platform) => (
            <span key={platform} className="rounded-full bg-[var(--color-surface-low)] px-2 py-0.5 text-[10px] font-black text-[var(--color-on-surface-variant)]">{platform === "android" ? "Android 전용본" : "iOS 전용본"}</span>
          ))}
          {warnings.length > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800"><AlertTriangle size={11} aria-hidden="true" />확인 {warnings.length}</span> : null}
        </div>
        <strong className="block truncate text-sm font-black text-[var(--color-on-surface)]">{asset.title}</strong>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : getAdminAssetSlotLabel(asset.slotRole, slots)}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{formatAdminAssetTargets(asset, slots)}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{describeAdminAssetAnalysis(asset.analysis)}</span>
        {asset.hasBubbleAdjustment ? <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">말풍선 조정값 저장됨</span> : null}
        {warnings[0] ? <span className="mt-2 block rounded-xl bg-amber-50 px-2.5 py-2 text-[11px] font-semibold leading-4 text-amber-900">{warnings[0]}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-[var(--color-inverse-surface)] px-3 py-2 text-xs font-black text-[var(--color-inverse-on-surface)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)]" disabled={deleting} onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" /> 수정
        </button>
        <button type="button" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[var(--color-outline-variant)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)]" disabled={deleting} onClick={onDelete}>
          {deleting ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
          {deleting ? "삭제 중" : "삭제"}
        </button>
      </div>
    </article>
  );
}

export function AdminAssetDockCard({
  asset,
  slots,
  warnings,
  onEdit,
  onDelete,
}: {
  asset: AdminAssetListItem;
  slots: readonly ThemeAssetSlot[];
  warnings: string[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tileUrl = adminAssetListTileUrl(asset);
  return (
    <article className="grid min-w-48 max-w-48 grid-rows-[76px_auto] gap-2 rounded-2xl border border-[var(--color-outline-variant)] bg-white p-2.5 shadow-[0_8px_18px_rgba(42,103,103,0.06)]">
      <button type="button" onClick={onEdit} className="relative overflow-hidden rounded-xl border border-[var(--color-outline-variant)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)]" style={TRANSPARENCY_CHECKER_STYLE} aria-label={`${asset.title} 수정`}>
        <span className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: tileUrl ? `url(${tileUrl})` : undefined }} aria-hidden="true" />
        {warnings.length > 0 ? <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800">확인 {warnings.length}</span> : null}
      </button>
      <div className="min-w-0"><button type="button" onClick={onEdit} className="block w-full truncate text-left text-xs font-black text-[var(--color-on-surface)] hover:underline">{asset.title}</button><span className="mt-0.5 block truncate text-[10px] font-semibold text-[var(--color-on-surface-variant)]">{asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : getAdminAssetSlotLabel(asset.slotRole, slots)}</span><div className="mt-2 flex gap-1"><button type="button" onClick={onEdit} className="rounded-lg bg-[var(--color-surface-low)] px-2 py-1 text-[10px] font-black text-[var(--color-on-surface-variant)]">수정</button><button type="button" onClick={onDelete} className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">삭제</button></div></div>
    </article>
  );
}

export function AdminAssetSkeletonGrid({ columns = 3 }: { columns?: 3 | 4 | 5 }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${columns === 3 ? "xl:grid-cols-3" : columns === 4 ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.04)]">
          <span className="aspect-[4/3] animate-pulse rounded-[18px] bg-[var(--color-surface-low)]" />
          <span className="h-4 w-2/3 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
          <span className="h-3 w-full animate-pulse rounded-full bg-[var(--color-surface-low)]" />
          <span className="h-9 w-full animate-pulse rounded-full bg-[var(--color-surface-low)]" />
        </div>
      ))}
    </div>
  );
}
