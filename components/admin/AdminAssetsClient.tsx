"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ChevronDown, Edit3, ImagePlus, LoaderCircle, Pencil, Save, Search, X, Trash2 } from "lucide-react";
import { ImageEditDialog } from "@/components/image-editor/ImageEditDialog";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import SiteHeader from "@/components/layout/SiteHeader";
import {
  deleteAdminAssetCandidate,
  adminAssetToFile,
  bubbleAdjustmentToSpec,
  describeAdminAssetAnalysis,
  getAdminAssetKindLabel,
  inferAdminAssetKind,
  isAdminAssetRecommendedForSlot,
  listAdminAssetCandidatePage,
  saveAdminAssetCandidate,
  updateAdminAssetCandidate,
  type AdminAssetAnalysis,
  type AdminBubbleAdjustment,
  type AdminAssetCandidate,
  type AdminAssetKind,
  type AdminAssetShape,
  type AdminAssetTargetInput,
} from "@/lib/theme/adminAssets";
import { bubbleSlotFromRole } from "@/lib/theme/project/state";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

const assetKindOrder: AdminAssetKind[] = ["background", "icon", "bubble", "profile", "launcher", "passcode"];

const ACCEPTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function pickValidImageFile(files: FileList | File[] | null | undefined): { file: File } | { error: string } {
  const file = Array.from(files ?? []).find((item) => item.type.startsWith("image/"));
  if (!file) return { error: "이미지 파일만 추가할 수 있습니다." };
  if (!ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) return { error: "PNG, JPEG, WebP 이미지만 지원합니다." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "이미지 용량은 20MB 이하만 추가할 수 있습니다." };
  return { file };
}

export default function AdminAssetsClient() {
  const [bubblePreviewPlatform, setBubblePreviewPlatform] = useState<ThemePlatform>("android");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [assets, setAssets] = useState<AdminAssetCandidate[]>([]);
  const [title, setTitle] = useState("");
  const [assetKind, setAssetKind] = useState<AdminAssetKind>("background");
  const [analysis, setAnalysis] = useState<AdminAssetAnalysis | null>(null);
  const [bubbleAdjustment, setBubbleAdjustment] = useState<AdminBubbleAdjustment>(createDefaultBubbleAdjustment());
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<AdminAssetCandidate | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<AdminAssetCandidate | null>(null);
  const [assetCursor, setAssetCursor] = useState<string>();
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [imageEditOpen, setImageEditOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetListFilter, setAssetListFilter] = useState<"all" | "exact" | "review" | "bubble">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetRequestSeqRef = useRef(0);

  const slots = useMemo(getUnifiedAdminAssetSlots, []);
  const slotGroups = useMemo(() => groupSlotsByAssetKind(slots), [slots]);
  const activeKindSlots = useMemo(() => slots.filter((slot) => inferAdminAssetKind(slot) === assetKind), [assetKind, slots]);
  const selectedSlot = activeKindSlots.find((slot) => slot.id === selectedSlotId) ?? activeKindSlots[0] ?? slots[0];
  const adminBubbleFile = useMemo<ThemeProjectFile | undefined>(() => (file ? { path: file.name, name: file.name, size: file.size, file } : undefined), [file]);
  const selectedBubbleSlot = selectedSlot ? (bubbleSlotFromRole(selectedSlot.role) ?? "me") : "me";
  const selectedSaveTargets = useMemo(() => (selectedSlot ? getAdminAssetSaveTargets(selectedSlot, assetKind) : []), [assetKind, selectedSlot]);
  const bubbleSpec = useMemo(() => (assetKind === "bubble" ? bubbleAdjustmentToSpec(bubbleAdjustment) : undefined), [assetKind, bubbleAdjustment]);
  const canSaveAsset = Boolean(file && selectedSlot && !isSavingAsset && selectedSaveTargets.length > 0 && (assetKind !== "bubble" || bubbleSpec));
  const visibleAssets = useMemo(
    () => assets.filter((asset) => selectedSlot && isAdminAssetVisibleForAdminSlot(selectedSlot, asset)),
    [assets, selectedSlot],
  );
  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return visibleAssets
      .map((asset) => ({
        asset,
        warnings: getAdminAssetGuidance(selectedSlot, asset.assetKind ?? assetKind, asset.analysis ?? null),
      }))
      .filter(({ asset, warnings }) => {
        const matchesQuery =
          !query ||
          asset.title.toLowerCase().includes(query) ||
          asset.fileName.toLowerCase().includes(query) ||
          asset.slotRole.toLowerCase().includes(query);
        const matchesFilter =
          assetListFilter === "all" ||
          (assetListFilter === "exact" && selectedSlot && isExactAdminAssetTarget(selectedSlot, asset)) ||
          (assetListFilter === "review" && warnings.length > 0) ||
          (assetListFilter === "bubble" && Boolean(asset.bubbleAdjustment));
        return matchesQuery && matchesFilter;
      });
  }, [assetKind, assetListFilter, assetSearch, selectedSlot, visibleAssets]);
  const guidanceItems = useMemo(() => getAdminAssetGuidance(selectedSlot, assetKind, analysis), [analysis, assetKind, selectedSlot]);

  useEffect(() => {
    const nextSlot = activeKindSlots.find((slot) => slot.id === selectedSlotId) ?? activeKindSlots[0] ?? slots[0];
    setSelectedSlotId(nextSlot?.id ?? "");
  }, [activeKindSlots, selectedSlotId, slots]);

  useEffect(() => {
    if (assetKind !== "bubble") return;
    setBubbleAdjustment(createDefaultBubbleAdjustment(analysis));
  }, [analysis, assetKind]);

  useEffect(() => {
    let active = true;
    if (!file) {
      setAnalysis(null);
      setFilePreviewUrl("");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setFilePreviewUrl(previewUrl);
    analyzeImageFile(file)
      .then((next) => {
        if (active) setAnalysis(next);
      })
      .catch((error) => {
        console.error(error);
        if (active) setAnalysis({ shapes: inferShapesFromFileName(file.name) });
      });
    return () => {
      active = false;
      URL.revokeObjectURL(previewUrl);
    };
  }, [file]);

  useEffect(() => {
    void refreshAssets(undefined, false);
  }, [assetKind, selectedSlot?.role]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const hasImage = Array.from(event.clipboardData?.files ?? []).some((item) => item.type.startsWith("image/"));
      if (!hasImage) return;
      event.preventDefault();
      const result = pickValidImageFile(event.clipboardData?.files);
      if ("error" in result) {
        setNotice(result.error);
        return;
      }
      setFile(result.file);
      setIsAddAssetOpen(true);
      setNotice("클립보드 이미지를 추가했습니다.");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const refreshAssets = async (cursor?: string, append = false) => {
    if (!selectedSlot) return;
    const seq = ++assetRequestSeqRef.current;
    try {
      setIsLoadingAssets(true);
      const page = await listAdminAssetCandidatePage({ assetKind: inferAdminAssetKind(selectedSlot), cursor, limit: 24 });
      if (seq !== assetRequestSeqRef.current) return;
      setAssets((current) => append ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))] : page.items);
      setAssetCursor(page.nextCursor);
    } catch (error) {
      if (seq !== assetRequestSeqRef.current) return;
      console.error(error);
      setNotice("관리 후보를 불러오지 못했습니다.");
    } finally {
      if (seq === assetRequestSeqRef.current) setIsLoadingAssets(false);
    }
  };

  const submit = async () => {
    if (!selectedSlot || !file || isSavingAsset) return;
    const saveTargets = selectedSaveTargets;
    if (saveTargets.length === 0) {
      setNotice("적용할 플랫폼 슬롯을 찾지 못했습니다.");
      return;
    }

    try {
      setIsSavingAsset(true);
      const representativeTarget = saveTargets[0];
      if (!representativeTarget) throw new Error("INVALID_ASSET_TARGET");
      const savedAsset = await saveAdminAssetCandidate({
        slotRole: representativeTarget.slotRole ?? selectedSlot.role,
        platform: representativeTarget.platform,
        assetKind,
        analysis: analysis ?? { shapes: inferShapesFromFileName(file.name) },
        bubbleAdjustment: assetKind === "bubble" ? bubbleAdjustment : undefined,
        bubbleSpec: assetKind === "bubble" ? bubbleSpec : undefined,
        title: title.trim() || file.name,
        note: selectedSlot.label,
        tags: [],
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        blob: file,
        targets: saveTargets,
      });
      setTitle("");
      setFile(null);
      setAnalysis(null);
      setIsAddAssetOpen(false);
      setNotice("플랫폼 공통 관리 후보를 추가했습니다.");
      setAssets((current) => [savedAsset, ...current.filter((item) => item.id !== savedAsset.id)]);
    } catch (error) {
      console.error(error);
      setNotice("관리 후보를 저장하지 못했습니다.");
    } finally {
      setIsSavingAsset(false);
    }
  };

  const remove = async (asset: AdminAssetCandidate) => {
    if (deletingAssetId) return;
    try {
      setDeletingAssetId(asset.id);
      await deleteAdminAssetCandidate(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setAssetPendingDelete(null);
      setNotice("관리 후보를 삭제했습니다.");
    } catch (error) {
      console.error(error);
      setNotice("관리 후보를 삭제하지 못했습니다.");
    } finally {
      setDeletingAssetId(null);
    }
  };

  const applyDroppedFile = (files: FileList | null) => {
    const result = pickValidImageFile(files);
    if ("error" in result) {
      setNotice(result.error);
      return;
    }
    setFile(result.file);
    setIsAddAssetOpen(true);
  };

  const applyRecommendedBubbleAdjustment = () => {
    setBubbleAdjustment(createDefaultBubbleAdjustment(analysis));
    setNotice("이미지 크기 기준으로 말풍선 조정값을 다시 맞췄습니다.");
  };

  const clearFile = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }

    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/admin/assets" />

      <div className="grid gap-5 px-5 py-8 mx-auto max-w-7xl md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Admin</p>
            <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">이미지 후보 관리</h1>
          </div>
          {notice ? <span className="rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-on-surface-variant)]">{notice}</span> : null}
        </header>

        <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="grid content-start gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4">
            <div className="rounded-2xl border border-[var(--color-info-container-high)] bg-[var(--color-info-container)] px-4 py-3">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-info-strong)]">Asset workflow</span>
              <p className="mt-1 text-sm font-black leading-5 text-[var(--color-on-surface)]">에셋 종류와 대표 슬롯만 고르면 Android/iOS 공통 대상으로 저장합니다.</p>
            </div>

            <div className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">에셋 종류</span>
              {slotGroups.map((group) => (
                <button
                  key={group.kind}
                  type="button"
                  className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${assetKind === group.kind ? "border-[var(--color-info)] bg-[var(--color-info-container)] text-[var(--color-info-strong)]" : "border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface)] hover:bg-[var(--color-surface-low)]"}`}
                  onClick={() => setAssetKind(group.kind)}
                  aria-current={assetKind === group.kind ? "true" : undefined}
                >
                  <span className="text-sm font-black">{getAdminAssetKindLabel(group.kind)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${assetKind === group.kind ? "bg-white text-[var(--color-info-strong)]" : "bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]"}`}>{group.slots.length}</span>
                </button>
              ))}
            </div>

            <div className="grid max-h-[42dvh] gap-2 overflow-auto pr-1 [scrollbar-width:thin]">
              <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">대표 슬롯</span>
              {activeKindSlots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className={`rounded-2xl border px-3 py-3 text-left transition ${selectedSlot?.id === slot.id ? "border-[var(--color-info)] bg-[var(--color-info-container)]" : "border-[var(--color-outline-variant)] bg-white hover:bg-[var(--color-surface-low)]"}`}
                  onClick={() => setSelectedSlotId(slot.id)}
                >
                  <span className="block text-sm font-black text-[var(--color-on-surface)]">{slot.label}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{slot.fileName ?? slot.role}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="grid content-start gap-4">
            <div className="overflow-hidden rounded-[24px] border border-[var(--color-outline-variant)] bg-white">
              <button
                id="admin-asset-add-trigger"
                type="button"
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-[var(--color-surface-low)] disabled:cursor-wait disabled:opacity-80"
                aria-expanded={isAddAssetOpen}
                aria-controls="admin-asset-add-panel"
                disabled={isSavingAsset}
                onClick={() => setIsAddAssetOpen((open) => !open)}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-black text-[var(--color-on-surface)]">통합 에셋 등록</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">
                    {file ? file.name : `${getAdminAssetKindLabel(assetKind)} · ${selectedSlot?.label ?? "대표 슬롯"}`}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)]">
                  {isSavingAsset ? "저장 중" : isAddAssetOpen ? "접기" : "펼치기"}
                  <ChevronDown className={`size-4 transition-transform ${isAddAssetOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </span>
              </button>
              {isAddAssetOpen ? (
                <div
                  id="admin-asset-add-panel"
                  className="relative grid gap-3 border-t border-[var(--color-outline-variant)] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                  role="region"
                  aria-labelledby="admin-asset-add-trigger"
                >
                  {isSavingAsset ? (
                    <div className="absolute inset-0 z-10 grid place-items-center bg-white/72 backdrop-blur-[1px]" role="status" aria-live="polite">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-info-outline)] bg-[var(--color-info-container)] px-4 py-2 text-sm font-black text-[var(--color-info-strong)] shadow-sm">
                        <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                        {selectedSaveTargets.length > 1 ? `${selectedSaveTargets.length}개 target 저장 중` : "관리 후보 저장 중"}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-2 rounded-2xl border border-[var(--color-info-container-high)] bg-[var(--color-info-container)] px-4 py-3 md:col-span-2">
                    <strong className="text-sm font-black text-[var(--color-on-info-container)]">저장 방식</strong>
                    <p className="text-xs font-semibold leading-5 text-[var(--color-on-info-container-variant)]">
                      업로드한 파일은 한 번만 저장하고, 대표 슬롯을 기준으로 Android/iOS에 필요한 target을 자동 생성합니다. 말풍선만 Android marker와 iOS inset/stretch 값을 함께 확인합니다.
                    </p>
                  </div>
              <label className="grid gap-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">후보 이름</span>
                <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={file?.name ?? "예: 심플 말풍선"} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">에셋 종류</span>
                <select className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" value={assetKind} onChange={(event) => setAssetKind(event.currentTarget.value as AdminAssetKind)}>
                  {assetKindOrder.map((kind) => (
                    <option key={kind} value={kind}>
                      {getAdminAssetKindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 md:col-span-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">
                  이미지 파일
                </span>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="이미지 파일 선택 또는 끌어놓기"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`grid gap-2 rounded-2xl border-2 border-dashed px-4 py-5 transition ${dragActive
                    ? "border-[var(--color-info)] bg-[var(--color-info-container)] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.12)]"
                    : "border-[var(--color-outline-variant)] bg-[var(--color-surface-low)]"
                    }`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    setDragActive(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                    applyDroppedFile(event.dataTransfer.files);
                  }}
                >
                  <strong className="text-sm font-black text-[var(--color-on-surface)]">
                    {dragActive
                      ? "여기에 놓으면 추가됩니다."
                      : file
                        ? file.name
                        : "이미지를 끌어오거나 선택하세요."}
                  </strong>

                  <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">
                    PNG, JPEG, WebP · Ctrl+V 붙여넣기 지원
                  </span>

                  {filePreviewUrl ? (
                    <div
                      className="mt-2 aspect-[4/3] max-h-64 rounded-2xl border border-[var(--color-outline-variant)] bg-white bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${filePreviewUrl})` }}
                    />
                  ) : null}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const result = pickValidImageFile(event.currentTarget.files);
                      event.currentTarget.value = "";
                      if ("error" in result) {
                        setNotice(result.error);
                        return;
                      }
                      setFile(result.file);
                      setIsAddAssetOpen(true);
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-info-outline)] bg-[var(--color-info-container)] px-4 text-xs font-black text-[var(--color-info-strong)] shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--color-info-outline-strong)] hover:bg-[var(--color-info-container-high)] hover:shadow-md active:translate-y-0 active:scale-[0.98]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus
                        size={15}
                        aria-hidden="true"
                        className="transition duration-200 group-hover:scale-110 group-hover:rotate-3"
                      />
                      이미지 선택
                    </button>

                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 text-xs font-black text-[var(--color-on-surface-variant)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--color-info-outline)] hover:bg-[var(--color-info-container)] hover:text-[var(--color-info-strong)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!file}
                      onClick={() => setImageEditOpen(true)}
                    >
                      <Edit3 size={15} aria-hidden="true" />
                      이미지 편집
                    </button>

                    <button
                      type="button"
                      disabled={!file}
                      onClick={clearFile}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-xs font-black text-red-600 transition duration-200 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 hover:text-red-700 active:translate-y-0 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                      이미지 제거
                    </button>
                  </div>
                </div>
              </div>
              {file ? (
                <div className="rounded-2xl bg-[var(--color-surface-low)] px-4 py-3 text-xs font-bold text-[var(--color-on-surface-variant)] md:col-span-2">
                  자동 분석: {describeAdminAssetAnalysis(analysis ?? { shapes: inferShapesFromFileName(file.name) })}
                </div>
              ) : null}
              {guidanceItems.length > 0 ? (
                <div className="grid gap-2 px-4 py-3 border rounded-2xl border-amber-200 bg-amber-50 md:col-span-2">
                  <div className="flex items-center gap-2 text-sm font-black text-amber-950">
                    <AlertTriangle size={17} aria-hidden="true" />
                    저장 전 확인
                  </div>
                  <ul className="grid gap-1.5">
                    {guidanceItems.map((item) => (
                      <li key={item} className="text-xs font-semibold leading-5 text-amber-900">{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {assetKind === "bubble" ? (
                <div className="grid gap-3 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-3">
                    <div>
                      <strong className="block text-sm font-black text-[var(--color-on-surface)]">말풍선 공통 기준</strong>
                      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
                        현재 이미지 크기에서 기본 stretch와 여백을 추천합니다. 저장값은 Android 9-patch와 iOS inset 편집에서 함께 사용됩니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full bg-white px-4 py-2 text-xs font-black text-[var(--color-on-surface)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--color-info-container)] active:translate-y-0"
                      onClick={applyRecommendedBubbleAdjustment}
                    >
                      공통 기준 자동 맞춤
                    </button>
                  </div>
                  <BubblePlatformSummary adjustment={bubbleAdjustment} activePlatform={bubblePreviewPlatform} onSelectPlatform={setBubblePreviewPlatform} />
                  <InlineBubbleAdjuster
                    file={adminBubbleFile}
                    slot={selectedBubbleSlot}
                    platform={bubblePreviewPlatform}
                    markers={bubbleAdjustment.markers}
                    insets={bubbleAdjustment.insets}
                    stretch={bubbleAdjustment.stretch}
                    onMarkersChange={(markers) => setBubbleAdjustment((current) => ({ ...current, markers }))}
                    onInsetsChange={(insets) => setBubbleAdjustment((current) => ({ ...current, insets }))}
                    onStretchChange={(stretch) => setBubbleAdjustment((current) => ({ ...current, stretch }))}
                  />
                </div>
              ) : null}
              <div className="grid gap-2 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-3 md:col-span-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">자동 적용 대상</span>
                <p className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
                  저장 시 파일 1개와 target {selectedSaveTargets.length || 0}개를 생성합니다
                  {selectedSaveTargets.length > 0 ? ` · ${selectedSaveTargets.map(formatAdminAssetTargetInput).join(" / ")}` : ""}.
                </p>
              </div>
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-5 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 md:col-span-2" type="button" disabled={!canSaveAsset} onClick={() => void submit()}>
                {isSavingAsset ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
                {isSavingAsset ? "저장 중" : "공통 관리 후보 추가"}
              </button>
                </div>
              ) : null}
            </div>

            <section className="grid gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-[var(--color-on-surface)]">등록된 관리 후보</h2>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">
                    {selectedSlot?.label ?? "선택 슬롯"} 기준 · {filteredAssets.length}/{visibleAssets.length}개 표시
                  </p>
                </div>
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-on-surface-variant)]" aria-hidden="true" />
                  <input
                    type="search"
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.currentTarget.value)}
                    placeholder="이름, 파일명, role 검색"
                    className="h-11 w-full rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] pl-9 pr-4 text-sm font-semibold outline-none transition focus:border-[var(--color-info-outline-strong)] focus:bg-white focus:ring-3 focus:ring-[var(--color-info-container-high)]"
                    aria-label="관리 후보 검색"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "전체"],
                  ["exact", "정확한 슬롯"],
                  ["review", "확인 필요"],
                  ["bubble", "말풍선 조정"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-full px-3 py-2 text-xs font-black transition ${assetListFilter === value ? "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" : "border border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)]"}`}
                    onClick={() => setAssetListFilter(value)}
                    aria-pressed={assetListFilter === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isLoadingAssets && assets.length === 0 ? (
                <AdminAssetSkeletonGrid />
              ) : filteredAssets.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredAssets.map(({ asset, warnings }) => (
                    <AdminAssetCard key={asset.id} asset={asset} slot={selectedSlot} warnings={warnings} deleting={deletingAssetId === asset.id} onEdit={() => setEditingAsset(asset)} onDelete={() => setAssetPendingDelete(asset)} />
                  ))}
                </div>
              ) : (
                <div className="grid min-h-40 place-items-center rounded-[22px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-5 py-8 text-center">
                  <div>
                    <strong className="text-sm font-black text-[var(--color-on-surface)]">표시할 관리 후보가 없습니다.</strong>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
                      검색어 또는 필터를 지우거나, 현재 슬롯에 맞는 후보를 새로 추가하세요.
                    </p>
                  </div>
                </div>
              )}
            </section>
            {assetCursor ? (
              <button type="button" className="mx-auto min-h-11 rounded-full border border-[var(--color-outline-variant)] bg-white px-5 text-sm font-black text-[var(--color-on-surface)] hover:bg-[var(--color-surface-low)] disabled:opacity-50" disabled={isLoadingAssets} onClick={() => void refreshAssets(assetCursor, true)}>
                {isLoadingAssets ? "불러오는 중" : "에셋 더 보기"}
              </button>
            ) : null}
          </section>
        </section>
      </div>

      <AdminAssetEditDialog
        asset={editingAsset}
        onClose={() => setEditingAsset(null)}
        onSaved={(updatedAsset) => {
          setAssets((current) => current.map((asset) => (asset.id === updatedAsset.id ? updatedAsset : asset)));
          setEditingAsset(null);
          setNotice("에셋 정보를 수정했습니다.");
        }}
      />
      <ImageEditDialog
        open={imageEditOpen}
        sourceFile={file}
        slotLabel={selectedSlot?.label ?? "관리 에셋"}
        onOpenChange={setImageEditOpen}
        onApply={(editedFile) => {
          setFile(editedFile);
          setNotice("편집된 이미지를 적용했습니다.");
        }}
      />

      <Dialog.Root open={Boolean(assetPendingDelete)} onOpenChange={(open) => { if (!open && !deletingAssetId) setAssetPendingDelete(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-40px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_24px_72px_rgba(15,23,42,0.24)] outline-none"
            onEscapeKeyDown={(event) => { if (deletingAssetId) event.preventDefault(); }}
            onPointerDownOutside={(event) => { if (deletingAssetId) event.preventDefault(); }}
          >
            <span className="mb-4 grid size-10 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 size={20} aria-hidden="true" /></span>
            <Dialog.Title className="text-xl font-extrabold text-[var(--color-on-surface)]">이 후보를 삭제할까요?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">
              &ldquo;{assetPendingDelete?.title}&rdquo; 후보와 저장된 이미지가 영구히 삭제됩니다. 되돌릴 수 없습니다.
            </Dialog.Description>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Dialog.Close asChild>
                <button type="button" className="min-h-11 rounded-xl border border-[var(--color-outline-variant)] px-4 py-2.5 text-sm font-extrabold text-[var(--color-on-surface-variant)] focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)] disabled:opacity-55" disabled={Boolean(deletingAssetId)}>취소</button>
              </Dialog.Close>
              <button
                type="button"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-55"
                disabled={Boolean(deletingAssetId)}
                onClick={() => { if (assetPendingDelete) void remove(assetPendingDelete); }}
              >
                {deletingAssetId ? <><LoaderCircle className="animate-spin" size={17} aria-hidden="true" />삭제 중</> : "삭제"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function groupSlotsByAssetKind(slots: ThemeAssetSlot[]) {
  return assetKindOrder
    .map((kind) => ({
      kind,
      slots: slots.filter((slot) => inferAdminAssetKind(slot) === kind),
    }))
    .filter((group) => group.slots.length > 0);
}

function getUnifiedAdminAssetSlots(): ThemeAssetSlot[] {
  const seenRoles = new Set<string>();
  return (["android", "ios"] as const)
    .flatMap((platform) => getThemeSlots(platform))
    .filter((slot) => slot.kind === "image" || slot.kind === "ninepatch")
    .filter((slot) => {
      if (seenRoles.has(slot.role)) return false;
      seenRoles.add(slot.role);
      return true;
    });
}

function getAdminAssetSaveTargets(slot: ThemeAssetSlot, assetKind: AdminAssetKind): AdminAssetTargetInput[] {
  if (assetKind === "bubble") {
    return [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }];
  }
  const platformSlots = (["android", "ios"] as const).flatMap((platform) => {
    const platformSlot = findAdminAssetSaveSlot(slot, platform, assetKind);
    return platformSlot ? [{ platform, slot: platformSlot }] : [];
  });
  if (platformSlots.length > 1 && platformSlots.every((target) => target.slot.role === platformSlots[0]?.slot.role)) {
    return [{ platform: "all", slotRole: platformSlots[0].slot.role, targetKind: "exact_role", priority: 0, enabled: true }];
  }
  return platformSlots.map((target) => ({ platform: target.platform, slotRole: target.slot.role, targetKind: "exact_role", priority: 0, enabled: true }));
}

function getSharedAdminAssetTargets(asset: AdminAssetCandidate): AdminAssetTargetInput[] {
  if (asset.assetKind === "bubble" || asset.slotRole.startsWith("bubble_")) {
    return [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: asset.enabled }];
  }
  return [{ platform: "all", slotRole: asset.slotRole, targetKind: "exact_role", priority: 0, enabled: asset.enabled }];
}

function findAdminAssetSaveSlot(sourceSlot: ThemeAssetSlot, platform: ThemePlatform, assetKind: AdminAssetKind) {
  const platformSlots = getThemeSlots(platform).filter((slot) => inferAdminAssetKind(slot) === assetKind);
  return (
    platformSlots.find((slot) => slot.role === sourceSlot.role) ??
    platformSlots.find((slot) => sourceSlot.fileName && slot.fileName === sourceSlot.fileName) ??
    platformSlots.find((slot) => slot.label === sourceSlot.label)
  );
}

function getAdminAssetGuidance(slot: ThemeAssetSlot | undefined, assetKind: AdminAssetKind, analysis: AdminAssetAnalysis | null) {
  if (!slot || !analysis) return [];
  const items: string[] = [];
  const width = analysis.width ?? 0;
  const height = analysis.height ?? 0;
  const shapes = new Set(analysis.shapes);
  const hasTransparencyAnalysis = typeof analysis.transparentPixelRatio === "number";
  const hasTransparentPixels = hasTransparencyAnalysis ? (analysis.transparentPixelRatio ?? 0) > 0.01 : shapes.has("transparent");

  if (!width || !height) {
    items.push("이미지 크기를 확인하지 못했습니다. 저장 후 실제 프리뷰에서 깨짐 여부를 확인하세요.");
    return items;
  }

  if ((assetKind === "icon" || assetKind === "profile" || assetKind === "launcher" || assetKind === "passcode") && !shapes.has("square")) {
    items.push("아이콘·프로필·패스코드 이미지는 정사각형에 가까울수록 잘리지 않고 안정적으로 보입니다.");
  }
  if ((assetKind === "background" || slot.role.includes("background")) && width / height > 1.2) {
    items.push("배경 이미지는 세로 화면에서 사용됩니다. 가로형 이미지는 상하 영역이 비거나 잘릴 수 있습니다.");
  }
  if (assetKind === "bubble" && !shapes.has("ninepatch") && slot.platform === "android") {
    items.push("Android 말풍선은 9-patch 또는 stretch 조정값이 중요합니다. 저장 전 말풍선 조정값을 확인하세요.");
  }
  if ((assetKind === "icon" || assetKind === "profile" || assetKind === "launcher" || assetKind === "passcode" || assetKind === "bubble") && !hasTransparentPixels) {
    items.push(hasTransparencyAnalysis
      ? "투명 픽셀이 거의 없습니다. 누끼가 필요한 에셋은 실제 테마에서 사각 배경이 보일 수 있습니다."
      : "투명 배경 여부를 확인하지 못했습니다. 누끼가 필요한 에셋은 배경이 사각형으로 보일 수 있습니다.");
  }
  if (Math.min(width, height) < 48) {
    items.push("이미지 한쪽 변이 48px 미만입니다. 고해상도 기기에서 흐릿하게 보일 수 있습니다.");
  }
  if (assetKind === "background" && Math.max(width, height) < 720) {
    items.push("배경 이미지는 최소 720px 이상의 긴 변을 권장합니다.");
  }
  if (slot.platform === "android" && assetKind === "bubble" && !slot.fileName?.endsWith(".9.png")) {
    items.push("현재 슬롯 파일명이 9-patch가 아닙니다. export 결과에서 말풍선 늘어남을 반드시 확인하세요.");
  }

  return Array.from(new Set(items));
}

function BubblePlatformSummary({
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

function formatPlatformLabel(platform: "all" | ThemePlatform) {
  return platform === "all" ? "Android+iOS" : platform === "android" ? "Android" : "iOS";
}

function formatAdminAssetTargetInput(target: AdminAssetTargetInput) {
  const platformLabel = formatPlatformLabel(target.platform);
  return target.slotRole ? `${platformLabel} · ${target.slotRole}` : `${platformLabel} · ${target.targetKind}`;
}

function formatAdminAssetTargets(asset: AdminAssetCandidate) {
  const targets = asset.targets ?? [];
  if (targets.length < 1) return formatPlatformLabel(asset.platform);
  return targets.map(formatAdminAssetTargetInput).join(" / ");
}

function isExactAdminAssetTarget(slot: ThemeAssetSlot, asset: AdminAssetCandidate) {
  return (asset.targets ?? []).some((target) => target.targetKind === "exact_role" && target.slotRole === slot.role);
}

function isAdminAssetVisibleForAdminSlot(slot: ThemeAssetSlot, asset: AdminAssetCandidate) {
  if (!asset.enabled) return false;
  if (isExactAdminAssetTarget(slot, asset)) return true;
  if ((asset.targets ?? []).some((target) => target.enabled && target.targetKind === "asset_kind")) return true;
  return isAdminAssetRecommendedForSlot(slot, { ...asset, platform: "all" });
}

function AdminAssetCard({
  asset,
  slot,
  warnings,
  deleting,
  onEdit,
  onDelete,
}: {
  asset: AdminAssetCandidate;
  slot?: ThemeAssetSlot;
  warnings: string[];
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
      <div className="aspect-[4/3] rounded-[18px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: asset.previewUrl ? `url(${asset.previewUrl})` : undefined }} />
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--color-inverse-surface)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--color-inverse-on-surface)]">{asset.targets?.some((target) => target.platform === "all") ? "공통" : "target"}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${asset.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{asset.enabled ? "사용 중" : "비활성"}</span>
          {warnings.length > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800"><AlertTriangle size={11} aria-hidden="true" />확인 {warnings.length}</span> : null}
        </div>
        <strong className="block truncate text-sm font-black text-[var(--color-on-surface)]">{asset.title}</strong>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : slot?.label ?? asset.slotRole}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{formatAdminAssetTargets(asset)}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{describeAdminAssetAnalysis(asset.analysis)}</span>
        {asset.bubbleAdjustment ? <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">말풍선 조정값 저장됨</span> : null}
        {warnings[0] ? <span className="mt-2 block rounded-xl bg-amber-50 px-2.5 py-2 text-[11px] font-semibold leading-4 text-amber-900">{warnings[0]}</span> : null}
      </div>
      {slot && asset.slotRole !== slot.role ? <span className="w-fit rounded-full bg-[var(--color-surface-low)] px-2 py-1 text-[11px] font-bold text-[var(--color-on-surface-variant)]">유사 슬롯 추천</span> : null}
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

function AdminAssetSkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

function AdminAssetEditDialog({
  asset,
  onClose,
  onSaved,
}: {
  asset: AdminAssetCandidate | null;
  onClose: () => void;
  onSaved: (asset: AdminAssetCandidate) => void;
}) {
  const [title, setTitle] = useState("");
  const [bubbleAdjustment, setBubbleAdjustment] = useState<AdminBubbleAdjustment>(createDefaultBubbleAdjustment());
  const [bubblePreviewPlatform, setBubblePreviewPlatform] = useState<ThemePlatform>("android");
  const [targetMode, setTargetMode] = useState<"keep" | "shared">("keep");
  const [bubbleFile, setBubbleFile] = useState<ThemeProjectFile>();
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBubble = asset?.assetKind === "bubble" || asset?.slotRole.startsWith("bubble_");
  const bubbleSlot = asset ? (bubbleSlotFromRole(asset.slotRole) ?? "me") : "me";

  useEffect(() => {
    let cancelled = false;
    setTitle(asset?.title ?? "");
    setBubbleAdjustment(asset?.bubbleAdjustment ?? createDefaultBubbleAdjustment(asset?.analysis));
    setBubblePreviewPlatform("android");
    setTargetMode("keep");
    setBubbleFile(undefined);
    setLoadingFile(false);
    setError(null);
    if (!asset || !isBubble) return;

    setLoadingFile(true);
    adminAssetToFile(asset)
      .then((file) => {
        if (!cancelled) setBubbleFile({ path: file.name, name: file.name, size: file.size, file });
      })
      .catch(() => {
        if (!cancelled) setError("말풍선 원본을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, isBubble]);

  const submitEdit = async () => {
    if (!asset || saving) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError("에셋 이름을 입력해 주세요.");
      return;
    }
    if (normalizedTitle.length > 100) {
      setError("에셋 이름은 100자 이내로 입력해 주세요.");
      return;
    }
    const nextBubbleSpec = isBubble ? bubbleAdjustmentToSpec(bubbleAdjustment) : undefined;
    if (isBubble && !nextBubbleSpec) {
      setError("Android 마커와 iOS inset/stretch 값을 모두 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updatedAsset = await updateAdminAssetCandidate(asset.id, {
        title: normalizedTitle,
        targets: targetMode === "shared" ? getSharedAdminAssetTargets(asset) : undefined,
        bubbleAdjustment: isBubble ? bubbleAdjustment : undefined,
        bubbleSpec: nextBubbleSpec,
      });
      onSaved(updatedAsset);
    } catch (updateError) {
      console.error(updateError);
      setError("수정 내용을 저장하지 못했습니다. 입력값과 네트워크 상태를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={Boolean(asset)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed inset-x-3 bottom-3 top-3 z-50 mx-auto grid max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[24px] border border-[var(--color-outline-variant)] bg-white shadow-2xl outline-none sm:inset-x-6 sm:bottom-auto sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:-translate-y-1/2"
          aria-describedby="admin-asset-edit-description"
          onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-outline-variant)] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-black text-[var(--color-on-surface)]">에셋 정보 수정</Dialog.Title>
              <Dialog.Description id="admin-asset-edit-description" className="mt-1 truncate text-sm font-semibold text-[var(--color-on-surface-variant)]">
                {asset?.fileName}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" disabled={saving} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[var(--color-surface-low)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)] disabled:opacity-40" aria-label="수정 창 닫기">
                <X size={19} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="grid content-start gap-5 px-5 py-5 overflow-y-auto sm:px-6">
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--color-on-surface)]">에셋 이름</span>
              <input
                autoFocus
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.currentTarget.value)}
                disabled={saving}
                className="h-11 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)] disabled:opacity-70"
                aria-invalid={Boolean(error && !title.trim())}
              />
              <span className="text-right text-xs font-semibold text-[var(--color-on-surface-variant)]">{title.length}/100</span>
            </label>

            {asset ? (
              <section className="grid gap-3 rounded-2xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-3" aria-labelledby="asset-target-heading">
                <div>
                  <h3 id="asset-target-heading" className="text-sm font-black text-[var(--color-on-surface)]">적용 대상</h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{formatAdminAssetTargets(asset)}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={saving}
                    aria-pressed={targetMode === "keep"}
                    onClick={() => setTargetMode("keep")}
                    className={`rounded-2xl border px-4 py-3 text-left text-xs font-bold leading-5 transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45 ${targetMode === "keep" ? "border-[var(--color-info)] bg-[var(--color-info-container)] text-[var(--color-info-strong)]" : "border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)]"}`}
                  >
                    기존 대상 유지
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    aria-pressed={targetMode === "shared"}
                    onClick={() => setTargetMode("shared")}
                    className={`rounded-2xl border px-4 py-3 text-left text-xs font-bold leading-5 transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45 ${targetMode === "shared" ? "border-[var(--color-info)] bg-[var(--color-info-container)] text-[var(--color-info-strong)]" : "border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)]"}`}
                  >
                    Android+iOS 공통 대상으로 정리
                  </button>
                </div>
              </section>
            ) : null}

            {isBubble ? (
              <section className="grid gap-3" aria-labelledby="bubble-adjustment-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="bubble-adjustment-heading" className="text-sm font-black text-[var(--color-on-surface)]">말풍선 조정값</h3>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">이미지는 변경하지 않고 늘어나는 영역과 텍스트 여백만 수정합니다.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:-translate-y-0.5 hover:bg-[var(--color-surface-low)] active:translate-y-0"
                    disabled={saving}
                    onClick={() => setBubbleAdjustment(createDefaultBubbleAdjustment(asset?.analysis))}
                  >
                    공통 기준 자동 맞춤
                  </button>
                </div>
                {loadingFile ? (
                  <div className="flex min-h-28 items-center justify-center gap-2 rounded-[22px] bg-[var(--color-surface-low)] text-sm font-bold text-[var(--color-on-surface-variant)]">
                    <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> 편집기 준비 중
                  </div>
                ) : (
                  <>
                    <BubblePlatformSummary adjustment={bubbleAdjustment} activePlatform={bubblePreviewPlatform} onSelectPlatform={setBubblePreviewPlatform} />
                  <InlineBubbleAdjuster
                    file={bubbleFile}
                    slot={bubbleSlot}
                    platform={bubblePreviewPlatform}
                    markers={bubbleAdjustment.markers}
                    insets={bubbleAdjustment.insets}
                    stretch={bubbleAdjustment.stretch}
                    onMarkersChange={(markers) => setBubbleAdjustment((current) => ({ ...current, markers }))}
                    onInsetsChange={(insets) => setBubbleAdjustment((current) => ({ ...current, insets }))}
                    onStretchChange={(stretch) => setBubbleAdjustment((current) => ({ ...current, stretch }))}
                  />
                  </>
                )}
              </section>
            ) : null}

            {error ? <p role="alert" className="rounded-xl bg-[var(--color-error-container)] px-4 py-3 text-sm font-bold text-[var(--color-on-error-container)]">{error}</p> : null}
          </div>

          <footer className="grid grid-cols-2 gap-2 border-t border-[var(--color-outline-variant)] bg-white px-5 py-4 sm:flex sm:justify-end sm:px-6">
            <Dialog.Close asChild>
              <button type="button" disabled={saving} className="min-h-11 rounded-full border border-[var(--color-outline-variant)] px-5 text-sm font-black text-[var(--color-on-surface-variant)] disabled:opacity-40">취소</button>
            </Dialog.Close>
            <button type="button" disabled={saving || loadingFile || (isBubble && !bubbleFile) || !title.trim()} onClick={() => void submitEdit()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-5 text-sm font-black text-[var(--color-inverse-on-surface)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)] disabled:cursor-not-allowed disabled:opacity-45">
              {saving ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
              {saving ? "저장 중" : "변경 저장"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

async function analyzeImageFile(file: File): Promise<AdminAssetAnalysis> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 분석하지 못했습니다."));
      element.src = url;
    });
    const aspectRatio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : undefined;
    const transparentPixelRatio = analyzeTransparentPixelRatio(image);
    return {
      width: image.naturalWidth || undefined,
      height: image.naturalHeight || undefined,
      aspectRatio,
      transparentPixelRatio,
      shapes: inferShapes(file, aspectRatio, transparentPixelRatio),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function analyzeTransparentPixelRatio(image: HTMLImageElement) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return undefined;

  const maxSize = 160;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;

  try {
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let transparentPixels = 0;
    const totalPixels = width * height;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 250) transparentPixels += 1;
    }
    return totalPixels > 0 ? transparentPixels / totalPixels : undefined;
  } catch {
    return undefined;
  }
}

function inferShapes(file: File, aspectRatio?: number, transparentPixelRatio?: number): AdminAssetShape[] {
  const shapes = new Set<AdminAssetShape>(inferShapesFromFileName(file.name));
  if (aspectRatio) {
    if (aspectRatio > 0.85 && aspectRatio < 1.18) shapes.add("square");
    if (aspectRatio <= 0.85) shapes.add("portrait");
    if (aspectRatio >= 1.18) shapes.add("wide");
  }
  if (typeof transparentPixelRatio === "number") {
    if (transparentPixelRatio > 0.01) {
      shapes.add("transparent");
    } else {
      shapes.delete("transparent");
    }
  } else if (file.type === "image/png") {
    shapes.add("transparent");
  }
  return Array.from(shapes);
}

function inferShapesFromFileName(fileName: string): AdminAssetShape[] {
  const normalized = fileName.toLowerCase();
  const shapes = new Set<AdminAssetShape>();
  if (normalized.endsWith(".9.png")) shapes.add("ninepatch");
  if (normalized.endsWith(".png")) shapes.add("transparent");
  if (normalized.includes("background") || normalized.includes("bg")) shapes.add("portrait");
  if (normalized.includes("icon") || normalized.includes("ico") || normalized.includes("profile") || normalized.includes("avatar")) shapes.add("square");
  if (shapes.size === 0) shapes.add("unknown");
  return Array.from(shapes);
}

function createDefaultBubbleAdjustment(analysis?: AdminAssetAnalysis | null): AdminBubbleAdjustment {
  const width = Math.max(8, analysis?.width ?? 60);
  const height = Math.max(8, analysis?.height ?? 42);
  return {
    markers: createDefaultMarkers(width, height),
    insets: createDefaultInsets(width, height),
    stretch: createDefaultStretch(width, height),
  };
}

function createDefaultMarkers(width = 60, height = 42): Markers {
  const xStart = Math.max(1, Math.floor(width * 0.42));
  const xEnd = Math.max(xStart + 1, Math.floor(width * 0.58));
  const yStart = Math.max(1, Math.floor(height * 0.42));
  const yEnd = Math.max(yStart + 1, Math.floor(height * 0.58));
  return {
    top: { start: xStart, end: xEnd },
    left: { start: yStart, end: yEnd },
    right: { start: yStart, end: yEnd },
    bottom: { start: xStart, end: xEnd },
  };
}

function createDefaultInsets(width = 60, height = 42): Insets {
  return {
    top: Math.max(1, Math.round(height * 0.28)),
    right: Math.max(1, Math.round(width * 0.28)),
    bottom: Math.max(1, Math.round(height * 0.28)),
    left: Math.max(1, Math.round(width * 0.28)),
  };
}

function createDefaultStretch(width = 60, height = 42): StretchPoint {
  return {
    x: Math.max(1, Math.round(width * 0.5)),
    y: Math.max(1, Math.round(height * 0.5)),
  };
}
