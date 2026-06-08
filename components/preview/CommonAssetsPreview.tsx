"use client";

import { ImageIcon, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { findBestFile, imageUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeResourceRole } from "@/lib/theme/types";

type RoleFiles = Partial<Record<ThemeResourceRole, ThemeProjectFile>>;
type RoleUrls = Partial<Record<ThemeResourceRole, string>>;

const iconRoles: ThemeResourceRole[] = ["theme_icon"];
const profileRoles: ThemeResourceRole[] = [
  "profile_image_1",
  "profile_image_2",
  "profile_image_3",
  "profile_image_full_1",
  "profile_image_full_2",
  "profile_image_full_3",
];

export function CommonAssetsPreview({
  analysis,
  activeGroup,
  slots,
  selectedSlotId,
  onSelectSlot,
}: {
  analysis: ThemeProjectAnalysis;
  activeGroup: "icon" | "profiles";
  slots: ThemeAssetSlot[];
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  const slotByRole = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>,
    [slots],
  );
  const files = useMemo(() => selectRoleFiles(analysis), [analysis]);
  const urls = useRoleUrls(files);

  return (
    <section className="grid h-full w-full max-w-[920px] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 rounded-[28px] border border-[#d7ddd8] bg-white/96 p-5 shadow-[0_22px_48px_rgba(15,23,42,0.12)]">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[#0f172a]">{activeGroup === "icon" ? "대표 아이콘" : "프로필 이미지"}</h2>
        <span className="rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#475569]">{activeGroup === "icon" ? "icon" : "profiles"}</span>
      </header>

      <div className="min-h-0 overflow-auto">
        {activeGroup === "icon" ? (
          <CommonIconPreview slotByRole={slotByRole} urls={urls} selectedSlotId={selectedSlotId} onSelectSlot={onSelectSlot} />
        ) : (
          <CommonProfilePreview slotByRole={slotByRole} urls={urls} selectedSlotId={selectedSlotId} onSelectSlot={onSelectSlot} />
        )}
      </div>
    </section>
  );
}

function CommonIconPreview({
  slotByRole,
  urls,
  selectedSlotId,
  onSelectSlot,
}: {
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  const slot = slotByRole.theme_icon;
  if (!slot) return null;

  return (
    <div className="grid min-h-full content-center justify-items-center px-4 py-6">
      <button
        type="button"
        className={`grid w-full max-w-[360px] gap-5 rounded-[28px] border p-6 text-left transition ${
          selectedSlotId === slot.id ? "border-[#60a5fa] bg-[#eff6ff] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]" : "border-[#e5e7eb] bg-white hover:border-[#cbd5e1]"
        }`}
        onClick={() => onSelectSlot?.(slot.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <strong className="block text-base font-semibold text-[#0f172a]">{slot.fileName}</strong>
          {slot.required ? <span className="rounded-full bg-[#dbeafe] px-2.5 py-1 text-[11px] font-semibold text-[#1d4ed8]">필수</span> : null}
        </div>

        <div className="grid place-items-center rounded-[24px] border border-[#e5e7eb] bg-[linear-gradient(180deg,#f8fafc,#eef2f7)] py-8">
          {urls.theme_icon ? (
            <span
              className="block h-[184px] w-[184px] rounded-[40px] border border-[#d1d5db] bg-white bg-contain bg-center bg-no-repeat shadow-[0_18px_34px_rgba(15,23,42,0.12)]"
              style={{ backgroundImage: `url(${urls.theme_icon})` }}
            />
          ) : (
            <span className="grid h-[184px] w-[184px] place-items-center rounded-[40px] border border-dashed border-[#cbd5e1] bg-white">
              <ImageIcon className="h-12 w-12 text-[#94a3b8]" />
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function CommonProfilePreview({
  slotByRole,
  urls,
  selectedSlotId,
  onSelectSlot,
}: {
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  const profileSlots = profileRoles.map((role) => slotByRole[role]).filter((slot): slot is ThemeAssetSlot => Boolean(slot));
  const activeSlot = profileSlots.find((slot) => slot.id === selectedSlotId) ?? profileSlots[0];
  if (!activeSlot) return null;

  const previewUrl = urls[activeSlot.role];
  const isThumb = activeSlot.role.startsWith("profile_image_") && !activeSlot.role.includes("_full_");

  return (
    <div className="grid min-h-full content-center justify-items-center gap-4 px-4 py-6">
      <button
        type="button"
        className={`grid w-full max-w-[420px] gap-5 rounded-[28px] border p-6 text-left transition ${
          selectedSlotId === activeSlot.id ? "border-[#60a5fa] bg-[#eff6ff] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]" : "border-[#e5e7eb] bg-white"
        }`}
        onClick={() => onSelectSlot?.(activeSlot.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <strong className="block text-base font-semibold text-[#0f172a]">{activeSlot.fileName}</strong>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-2 py-1 text-[10px] font-semibold text-[#475569]">{isThumb ? "목록형" : "전체형"}</span>
            {activeSlot.required ? <span className="rounded-full bg-[#dbeafe] px-2 py-1 text-[10px] font-semibold text-[#1d4ed8]">필수</span> : null}
          </div>
        </div>

        <div className="grid place-items-center rounded-[24px] border border-[#e5e7eb] bg-[#f8fafc] px-6 py-8">
          {previewUrl ? (
            <span
              className={`${isThumb ? "h-[180px] w-[180px] rounded-full" : "h-[260px] w-full max-w-[240px] rounded-[28px]"} block border border-[#d1d5db] bg-white bg-contain bg-center bg-no-repeat shadow-[0_18px_34px_rgba(15,23,42,0.12)]`}
              style={{ backgroundImage: `url(${previewUrl})` }}
            />
          ) : (
            <span className="grid h-[260px] w-full max-w-[240px] place-items-center rounded-[28px] border border-dashed border-[#cbd5e1] bg-white">
              {isThumb ? <UserRound className="h-12 w-12 text-[#94a3b8]" /> : <ImageIcon className="h-12 w-12 text-[#94a3b8]" />}
            </span>
          )}
        </div>
      </button>

      <div className="flex flex-wrap justify-center gap-2">
        {profileSlots.map((slot) => {
          const slotUrl = urls[slot.role];
          const slotIsThumb = slot.role.startsWith("profile_image_") && !slot.role.includes("_full_");
          return (
            <button
              key={slot.id}
              type="button"
              className={`grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border bg-white transition ${
                slot.id === activeSlot.id ? "border-[#60a5fa] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]" : "border-[#e5e7eb] hover:border-[#cbd5e1]"
              }`}
              onClick={() => onSelectSlot?.(slot.id)}
              aria-label={slot.fileName}
            >
              {slotUrl ? (
                <span
                  className={`${slotIsThumb ? "h-10 w-10 rounded-full" : "h-11 w-11 rounded-xl"} block bg-white bg-contain bg-center bg-no-repeat`}
                  style={{ backgroundImage: `url(${slotUrl})` }}
                />
              ) : (
                <span className="text-[#94a3b8]">{slotIsThumb ? <UserRound className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function selectRoleFiles(analysis: ThemeProjectAnalysis): RoleFiles {
  const roles: ThemeResourceRole[] = [...iconRoles, ...profileRoles];
  return Object.fromEntries(roles.map((role) => [role, findBestFile(analysis, role)])) as RoleFiles;
}

function useRoleUrls(files: RoleFiles): RoleUrls {
  const [urls, setUrls] = useState<RoleUrls>({});

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    async function load() {
      const nextUrls: RoleUrls = {};
      for (const [role, file] of Object.entries(files) as Array<[ThemeResourceRole, ThemeProjectFile | undefined]>) {
        if (!file) continue;
        const nextUrl = await imageUrlForThemeFile(file, false);
        nextUrls[role] = nextUrl;
        if (nextUrl.startsWith("blob:")) objectUrls.push(nextUrl);
      }
      if (!cancelled) setUrls(nextUrls);
    }

    void load();
    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [files]);

  return urls;
}
