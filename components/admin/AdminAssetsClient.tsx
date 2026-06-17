"use client";

import { useEffect, useMemo, useState } from "react";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import SiteHeader from "@/components/layout/SiteHeader";
import {
  deleteAdminAssetCandidate,
  describeAdminAssetAnalysis,
  getAdminAssetKindLabel,
  inferAdminAssetKind,
  isAdminAssetRecommendedForSlot,
  listAdminAssetCandidates,
  saveAdminAssetCandidate,
  type AdminAssetAnalysis,
  type AdminBubbleAdjustment,
  type AdminAssetCandidate,
  type AdminAssetKind,
  type AdminAssetShape,
} from "@/lib/theme/adminAssets";
import { bubbleSlotFromRole } from "@/lib/theme/project/state";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

const assetKindOrder: AdminAssetKind[] = ["background", "icon", "bubble", "profile", "launcher", "passcode"];

export default function AdminAssetsClient() {
  const [platform, setPlatform] = useState<ThemePlatform>("android");
  const [assetPlatformScope, setAssetPlatformScope] = useState<ThemePlatform | "all">("android");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [assets, setAssets] = useState<AdminAssetCandidate[]>([]);
  const [title, setTitle] = useState("");
  const [assetKind, setAssetKind] = useState<AdminAssetKind>("background");
  const [analysis, setAnalysis] = useState<AdminAssetAnalysis | null>(null);
  const [bubbleAdjustment, setBubbleAdjustment] = useState<AdminBubbleAdjustment>(createDefaultBubbleAdjustment());
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [openSlotGroups, setOpenSlotGroups] = useState<Partial<Record<AdminAssetKind, boolean>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const slots = useMemo(() => getThemeSlots(platform).filter((slot) => slot.kind === "image" || slot.kind === "ninepatch"), [platform]);
  const slotGroups = useMemo(() => groupSlotsByAssetKind(slots), [slots]);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? slots[0];
  const adminBubbleFile = useMemo<ThemeProjectFile | undefined>(() => (file ? { path: file.name, name: file.name, size: file.size, file } : undefined), [file]);
  const selectedBubbleSlot = selectedSlot ? (bubbleSlotFromRole(selectedSlot.role) ?? "me") : "me";
  const canUseCommonScope = Boolean(selectedSlot && getThemeSlots(platform === "android" ? "ios" : "android").some((slot) => slot.role === selectedSlot.role && slot.kind === selectedSlot.kind));
  const visibleAssets = assets.filter((asset) => selectedSlot && isAdminAssetRecommendedForSlot(selectedSlot, asset));

  useEffect(() => {
    setSelectedSlotId(slots[0]?.id ?? "");
    setAssetPlatformScope(platform);
  }, [platform, slots]);

  useEffect(() => {
    if (selectedSlot) setAssetKind(inferAdminAssetKind(selectedSlot));
  }, [selectedSlot]);

  useEffect(() => {
    if (!selectedSlot) return;
    const selectedKind = inferAdminAssetKind(selectedSlot);
    setOpenSlotGroups((current) => ({ ...current, [selectedKind]: true }));
  }, [selectedSlot]);

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
    if (!canUseCommonScope && assetPlatformScope === "all") {
      setAssetPlatformScope(platform);
    }
  }, [assetPlatformScope, canUseCommonScope, platform]);

  useEffect(() => {
    void refreshAssets();
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const pastedFile = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (!pastedFile) return;
      event.preventDefault();
      setFile(pastedFile);
      setNotice("클립보드 이미지를 추가했습니다.");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const refreshAssets = async () => {
    try {
      setAssets(await listAdminAssetCandidates());
    } catch (error) {
      console.error(error);
      setNotice("관리 후보를 불러오지 못했습니다.");
    }
  };

  const submit = async () => {
    if (!selectedSlot || !file) return;

    try {
      await saveAdminAssetCandidate({
        slotRole: selectedSlot.role,
        platform: assetPlatformScope,
        assetKind,
        analysis: analysis ?? { shapes: inferShapesFromFileName(file.name) },
        bubbleAdjustment: assetKind === "bubble" ? bubbleAdjustment : undefined,
        title: title.trim() || file.name,
        note: selectedSlot.label,
        tags: [],
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        blob: file,
      });
      setTitle("");
      setFile(null);
      setAnalysis(null);
      setNotice("관리 후보를 추가했습니다.");
      await refreshAssets();
    } catch (error) {
      console.error(error);
      setNotice("관리 후보를 저장하지 못했습니다.");
    }
  };

  const remove = async (asset: AdminAssetCandidate) => {
    const confirmed = window.confirm(`"${asset.title}" 후보를 삭제할까요?`);
    if (!confirmed) return;
    await deleteAdminAssetCandidate(asset.id);
    setNotice("관리 후보를 삭제했습니다.");
    await refreshAssets();
  };

  const applyDroppedFile = (files: FileList | null) => {
    const nextFile = Array.from(files ?? []).find((item) => item.type.startsWith("image/"));
    if (!nextFile) {
      setNotice("이미지 파일만 추가할 수 있습니다.");
      return;
    }
    setFile(nextFile);
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/admin/assets" />

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-8 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Admin</p>
            <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">이미지 후보 관리</h1>
          </div>
          {notice ? <span className="rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-on-surface-variant)]">{notice}</span> : null}
        </header>

        <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="grid content-start gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4">
            <div className="grid grid-cols-2 gap-2">
              {(["android", "ios"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-black ${platform === item ? "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" : "border border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)]"}`}
                  onClick={() => setPlatform(item)}
                >
                  {item === "android" ? "Android" : "iOS"}
                </button>
              ))}
            </div>

            <div className="grid max-h-[68dvh] gap-2 overflow-auto pr-1">
              {slotGroups.map((group) => (
                <section key={group.kind} className="grid gap-2">
                  <button
                    type="button"
                    className="flex items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-[var(--color-surface-low)]"
                    onClick={() => setOpenSlotGroups((current) => ({ ...current, [group.kind]: !current[group.kind] }))}
                    aria-expanded={Boolean(openSlotGroups[group.kind])}
                  >
                    <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">{getAdminAssetKindLabel(group.kind)}</span>
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-full bg-[var(--color-surface-low)] px-2 py-0.5 text-[11px] font-black text-[var(--color-on-surface-variant)]">{group.slots.length}</span>
                      <span className="text-sm font-black text-[var(--color-on-surface-variant)]">{openSlotGroups[group.kind] ? "−" : "+"}</span>
                    </span>
                  </button>
                  {openSlotGroups[group.kind]
                    ? group.slots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          className={`rounded-2xl border px-3 py-3 text-left transition ${selectedSlot?.id === slot.id ? "border-[#2563eb] bg-[#eff6ff]" : "border-[var(--color-outline-variant)] bg-white hover:bg-[var(--color-surface-low)]"}`}
                          onClick={() => setSelectedSlotId(slot.id)}
                        >
                          <span className="block text-sm font-black text-[var(--color-on-surface)]">{slot.label}</span>
                          <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{slot.fileName ?? slot.role}</span>
                        </button>
                      ))
                    : null}
                </section>
              ))}
            </div>
          </aside>

          <section className="grid content-start gap-4">
            <div className="grid gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="grid gap-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">후보 이름</span>
                <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder={file?.name ?? "예: 심플 말풍선"} />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">에셋 종류</span>
                <select className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" value={assetKind} onChange={(event) => setAssetKind(event.currentTarget.value as AdminAssetKind)}>
                  {(["background", "icon", "bubble", "profile", "launcher", "passcode"] as const).map((kind) => (
                    <option key={kind} value={kind}>
                      {getAdminAssetKindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 md:col-span-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">이미지 파일</span>
                <div
                  tabIndex={0}
                  className={`grid gap-2 rounded-2xl border-2 border-dashed px-4 py-5 transition ${dragActive ? "border-[#2563eb] bg-[#eff6ff] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.12)]" : "border-[var(--color-outline-variant)] bg-[var(--color-surface-low)]"}`}
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
                  <strong className="text-sm font-black text-[var(--color-on-surface)]">{dragActive ? "여기에 놓으면 추가됩니다." : file ? file.name : "이미지를 끌어오거나 선택하세요."}</strong>
                  <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">PNG, JPEG, WebP · Ctrl+V 붙여넣기 지원</span>
                  {filePreviewUrl ? <div className="mt-2 aspect-[4/3] max-h-64 rounded-2xl border border-[var(--color-outline-variant)] bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${filePreviewUrl})` }} /> : null}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
                </div>
              </label>
              {file ? (
                <div className="rounded-2xl bg-[var(--color-surface-low)] px-4 py-3 text-xs font-bold text-[var(--color-on-surface-variant)] md:col-span-2">
                  자동 분석: {describeAdminAssetAnalysis(analysis ?? { shapes: inferShapesFromFileName(file.name) })}
                </div>
              ) : null}
              {assetKind === "bubble" ? (
                <div className="md:col-span-2">
                  <InlineBubbleAdjuster
                    file={adminBubbleFile}
                    slot={selectedBubbleSlot}
                    platform={platform}
                    markers={bubbleAdjustment.markers}
                    insets={bubbleAdjustment.insets}
                    stretch={bubbleAdjustment.stretch}
                    onMarkersChange={(markers) => setBubbleAdjustment((current) => ({ ...current, markers }))}
                    onInsetsChange={(insets) => setBubbleAdjustment((current) => ({ ...current, insets }))}
                    onStretchChange={(stretch) => setBubbleAdjustment((current) => ({ ...current, stretch }))}
                  />
                </div>
              ) : null}
              <div className="grid gap-2 md:col-span-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">적용 범위</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-black ${assetPlatformScope !== "all" ? "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" : "border border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)]"}`}
                    onClick={() => setAssetPlatformScope(platform)}
                  >
                    현재 플랫폼
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${assetPlatformScope === "all" ? "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" : "border border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)]"}`}
                    onClick={() => setAssetPlatformScope("all")}
                    disabled={!canUseCommonScope}
                  >
                    Android/iOS 공통
                  </button>
                </div>
              </div>
              <button className="rounded-full bg-[var(--color-inverse-surface)] px-5 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] disabled:cursor-not-allowed disabled:opacity-40 md:col-span-2" type="button" disabled={!file || !selectedSlot} onClick={() => void submit()}>
                관리 후보 추가
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleAssets.map((asset) => (
                <AdminAssetCard key={asset.id} asset={asset} slot={selectedSlot} onDelete={() => void remove(asset)} />
              ))}
            </div>
          </section>
        </section>
      </div>
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

function AdminAssetCard({ asset, slot, onDelete }: { asset: AdminAssetCandidate; slot?: ThemeAssetSlot; onDelete: () => void }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(asset.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [asset.blob]);

  return (
    <article className="grid gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)]">
      <div className="aspect-[4/3] rounded-[18px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: previewUrl ? `url(${previewUrl})` : undefined }} />
      <div className="min-w-0">
        <strong className="block truncate text-sm font-black text-[var(--color-on-surface)]">{asset.title}</strong>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : slot?.label ?? asset.slotRole}</span>
        <span className="mt-1 block truncate text-xs font-black uppercase text-[var(--color-on-surface-variant)]">{asset.platform === "all" ? "Android/iOS" : asset.platform}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{describeAdminAssetAnalysis(asset.analysis)}</span>
        {asset.bubbleAdjustment ? <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">말풍선 조정값 저장됨</span> : null}
      </div>
      {slot && asset.slotRole !== slot.role ? <span className="w-fit rounded-full bg-[var(--color-surface-low)] px-2 py-1 text-[11px] font-bold text-[var(--color-on-surface-variant)]">유사 슬롯 추천</span> : null}
      <button type="button" className="rounded-full border border-[var(--color-outline-variant)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)]" onClick={onDelete}>
        삭제
      </button>
    </article>
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
    return {
      width: image.naturalWidth || undefined,
      height: image.naturalHeight || undefined,
      aspectRatio,
      shapes: inferShapes(file, aspectRatio),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function inferShapes(file: File, aspectRatio?: number): AdminAssetShape[] {
  const shapes = new Set<AdminAssetShape>(inferShapesFromFileName(file.name));
  if (aspectRatio) {
    if (aspectRatio > 0.85 && aspectRatio < 1.18) shapes.add("square");
    if (aspectRatio <= 0.85) shapes.add("portrait");
    if (aspectRatio >= 1.18) shapes.add("wide");
  }
  if (file.type === "image/png") shapes.add("transparent");
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
