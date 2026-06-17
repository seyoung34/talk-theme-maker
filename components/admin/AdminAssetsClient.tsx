"use client";

import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/layout/SiteHeader";
import { deleteAdminAssetCandidate, listAdminAssetCandidates, saveAdminAssetCandidate, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

export default function AdminAssetsClient() {
  const [platform, setPlatform] = useState<ThemePlatform>("android");
  const [assetPlatformScope, setAssetPlatformScope] = useState<ThemePlatform | "all">("android");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [assets, setAssets] = useState<AdminAssetCandidate[]>([]);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const slots = useMemo(() => getThemeSlots(platform).filter((slot) => slot.kind === "image" || slot.kind === "ninepatch"), [platform]);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? slots[0];
  const canUseCommonScope = Boolean(selectedSlot && getThemeSlots(platform === "android" ? "ios" : "android").some((slot) => slot.role === selectedSlot.role && slot.kind === selectedSlot.kind));
  const visibleAssets = assets.filter((asset) => selectedSlot && asset.slotRole === selectedSlot.role && (asset.platform === "all" || asset.platform === selectedSlot.platform));

  useEffect(() => {
    setSelectedSlotId(slots[0]?.id ?? "");
    setAssetPlatformScope(platform);
  }, [platform, slots]);

  useEffect(() => {
    if (!canUseCommonScope && assetPlatformScope === "all") {
      setAssetPlatformScope(platform);
    }
  }, [assetPlatformScope, canUseCommonScope, platform]);

  useEffect(() => {
    void refreshAssets();
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
        title: title.trim() || file.name,
        note: selectedSlot.label,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        blob: file,
      });
      setTitle("");
      setTags("");
      setFile(null);
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
              {slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className={`rounded-2xl border px-3 py-3 text-left transition ${selectedSlot?.id === slot.id ? "border-[#2563eb] bg-[#eff6ff]" : "border-[var(--color-outline-variant)] bg-white hover:bg-[var(--color-surface-low)]"}`}
                  onClick={() => setSelectedSlotId(slot.id)}
                >
                  <span className="block text-sm font-black text-[var(--color-on-surface)]">{slot.label}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{slot.fileName ?? slot.role}</span>
                </button>
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
                <span className="text-sm font-black text-[var(--color-on-surface)]">태그</span>
                <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" value={tags} onChange={(event) => setTags(event.currentTarget.value)} placeholder="쉼표로 구분" />
              </label>
              <label className="grid gap-2 md:col-span-2">
                <span className="text-sm font-black text-[var(--color-on-surface)]">이미지 파일</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
              </label>
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
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{slot?.label ?? asset.slotRole}</span>
        <span className="mt-1 block truncate text-xs font-black uppercase text-[var(--color-on-surface-variant)]">{asset.platform === "all" ? "Android/iOS" : asset.platform}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {asset.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-[var(--color-surface-low)] px-2 py-1 text-[11px] font-bold text-[var(--color-on-surface-variant)]">
            {tag}
          </span>
        ))}
      </div>
      <button type="button" className="rounded-full border border-[var(--color-outline-variant)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)]" onClick={onDelete}>
        삭제
      </button>
    </article>
  );
}
