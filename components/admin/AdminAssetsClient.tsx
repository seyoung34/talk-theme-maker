"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, Pencil, Save, X } from "lucide-react";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import SiteHeader from "@/components/layout/SiteHeader";
import {
  deleteAdminAssetCandidate,
  adminAssetToFile,
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
  const [editingAsset, setEditingAsset] = useState<AdminAssetCandidate | null>(null);
  const [assetCursor, setAssetCursor] = useState<string>();
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

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
    void refreshAssets(undefined, false);
  }, [platform, selectedSlot?.role]);

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

  const refreshAssets = async (cursor?: string, append = false) => {
    if (!selectedSlot) return;
    try {
      setIsLoadingAssets(true);
      const page = await listAdminAssetCandidatePage({ platform, assetKind: inferAdminAssetKind(selectedSlot), cursor, limit: 24 });
      setAssets((current) => append ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))] : page.items);
      setAssetCursor(page.nextCursor);
    } catch (error) {
      console.error(error);
      setNotice("관리 후보를 불러오지 못했습니다.");
    } finally {
      setIsLoadingAssets(false);
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
                <AdminAssetCard key={asset.id} asset={asset} slot={selectedSlot} onEdit={() => setEditingAsset(asset)} onDelete={() => void remove(asset)} />
              ))}
            </div>
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
        fallbackPlatform={platform}
        onClose={() => setEditingAsset(null)}
        onSaved={(updatedAsset) => {
          setAssets((current) => current.map((asset) => (asset.id === updatedAsset.id ? updatedAsset : asset)));
          setEditingAsset(null);
          setNotice("에셋 정보를 수정했습니다.");
        }}
      />
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

function AdminAssetCard({ asset, slot, onEdit, onDelete }: { asset: AdminAssetCandidate; slot?: ThemeAssetSlot; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="grid gap-3 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)]">
      <div className="aspect-[4/3] rounded-[18px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: asset.previewUrl ? `url(${asset.previewUrl})` : undefined }} />
      <div className="min-w-0">
        <strong className="block truncate text-sm font-black text-[var(--color-on-surface)]">{asset.title}</strong>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : slot?.label ?? asset.slotRole}</span>
        <span className="mt-1 block truncate text-xs font-black uppercase text-[var(--color-on-surface-variant)]">{asset.platform === "all" ? "Android/iOS" : asset.platform}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{describeAdminAssetAnalysis(asset.analysis)}</span>
        {asset.bubbleAdjustment ? <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">말풍선 조정값 저장됨</span> : null}
      </div>
      {slot && asset.slotRole !== slot.role ? <span className="w-fit rounded-full bg-[var(--color-surface-low)] px-2 py-1 text-[11px] font-bold text-[var(--color-on-surface-variant)]">유사 슬롯 추천</span> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-[var(--color-inverse-surface)] px-3 py-2 text-xs font-black text-[var(--color-inverse-on-surface)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)]" onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" /> 수정
        </button>
        <button type="button" className="min-h-10 rounded-full border border-[var(--color-outline-variant)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-secondary-container)]" onClick={onDelete}>
          삭제
        </button>
      </div>
    </article>
  );
}

function AdminAssetEditDialog({
  asset,
  fallbackPlatform,
  onClose,
  onSaved,
}: {
  asset: AdminAssetCandidate | null;
  fallbackPlatform: ThemePlatform;
  onClose: () => void;
  onSaved: (asset: AdminAssetCandidate) => void;
}) {
  const [title, setTitle] = useState("");
  const [bubbleAdjustment, setBubbleAdjustment] = useState<AdminBubbleAdjustment>(createDefaultBubbleAdjustment());
  const [bubbleFile, setBubbleFile] = useState<ThemeProjectFile>();
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBubble = asset?.assetKind === "bubble" || asset?.slotRole.startsWith("bubble_");
  const editPlatform = asset?.platform === "all" || !asset ? fallbackPlatform : asset.platform;
  const bubbleSlot = asset ? (bubbleSlotFromRole(asset.slotRole) ?? "me") : "me";

  useEffect(() => {
    let cancelled = false;
    setTitle(asset?.title ?? "");
    setBubbleAdjustment(asset?.bubbleAdjustment ?? createDefaultBubbleAdjustment(asset?.analysis));
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

    setSaving(true);
    setError(null);
    try {
      const updatedAsset = await updateAdminAssetCandidate(asset.id, {
        title: normalizedTitle,
        bubbleAdjustment: isBubble ? bubbleAdjustment : undefined,
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

          <div className="grid content-start gap-5 overflow-y-auto px-5 py-5 sm:px-6">
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

            {isBubble ? (
              <section className="grid gap-3" aria-labelledby="bubble-adjustment-heading">
                <div>
                  <h3 id="bubble-adjustment-heading" className="text-sm font-black text-[var(--color-on-surface)]">말풍선 조정값</h3>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">이미지는 변경하지 않고 늘어나는 영역과 텍스트 여백만 수정합니다.</p>
                </div>
                {loadingFile ? (
                  <div className="flex min-h-28 items-center justify-center gap-2 rounded-[22px] bg-[var(--color-surface-low)] text-sm font-bold text-[var(--color-on-surface-variant)]">
                    <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> 편집기 준비 중
                  </div>
                ) : (
                  <InlineBubbleAdjuster
                    file={bubbleFile}
                    slot={bubbleSlot}
                    platform={editPlatform}
                    markers={bubbleAdjustment.markers}
                    insets={bubbleAdjustment.insets}
                    stretch={bubbleAdjustment.stretch}
                    onMarkersChange={(markers) => setBubbleAdjustment((current) => ({ ...current, markers }))}
                    onInsetsChange={(insets) => setBubbleAdjustment((current) => ({ ...current, insets }))}
                    onStretchChange={(stretch) => setBubbleAdjustment((current) => ({ ...current, stretch }))}
                  />
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
