"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { findBestFile, imageUrlForThemeFile, previewRoleFilesSignature } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeResourceRole, ThemeSlotGroup } from "@/lib/theme/types";

type CommonAssetsGroup = Extract<ThemeSlotGroup, "icon" | "profiles" | "launcher">;
type RoleUrls = Partial<Record<ThemeResourceRole, string>>;

const groupLabels: Record<CommonAssetsGroup, string> = {
  icon: "대표 아이콘",
  profiles: "프로필 이미지",
  launcher: "런처 아이콘",
};

const circularRoles = new Set<ThemeResourceRole>(["profile_image_1", "profile_image_2", "profile_image_3"]);

export function CommonAssetsPreview({
  analysis,
  activeGroup,
  slots,
  selectedSlotId,
  onSelectSlot,
}: {
  analysis: ThemeProjectAnalysis;
  activeGroup: CommonAssetsGroup;
  slots: ThemeAssetSlot[];
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  const groupSlots = useMemo(() => sortSlots(slots.filter((slot) => slot.group === activeGroup)), [slots, activeGroup]);
  const activeSlot = groupSlots.find((slot) => slot.id === selectedSlotId) ?? groupSlots[0];
  const files = useMemo(() => selectRoleFiles(analysis, groupSlots), [analysis, groupSlots]);
  const urls = useRoleUrls(files);

  if (!activeSlot) return null;

  const url = urls[activeSlot.role];
  const circular = circularRoles.has(activeSlot.role);

  return (
    <section className="grid h-full w-full max-w-[920px] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 rounded-[28px] border border-[#d7ddd8] bg-white/96 p-5 shadow-[0_22px_48px_rgba(15,23,42,0.12)]">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[#0f172a]">{groupLabels[activeGroup]}</h2>
        <span className="rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#475569]">{activeSlot.label}</span>
      </header>

      <div className="grid min-h-0 place-items-center overflow-auto p-4">
        <div className="grid w-full max-w-[320px] justify-items-center gap-4">
          <div className={`grid aspect-square w-full place-items-center overflow-hidden border border-[#e5e7eb] bg-[linear-gradient(180deg,#f8fafc,#eef2f7)] ${circular ? "rounded-full" : "rounded-[28px]"}`}>
            {url ? (
              <span className="block h-full w-full bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${url})` }} />
            ) : (
              <ImageIcon className="h-12 w-12 text-[#94a3b8]" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#0f172a]">{activeSlot.label}</span>
            {activeSlot.required ? <span className="shrink-0 rounded-full bg-[#dbeafe] px-2 py-0.5 text-[11px] font-semibold text-[#1d4ed8]">필수</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function sortSlots(slots: ThemeAssetSlot[]) {
  return [...slots].sort((a, b) => {
    const aAdvanced = a.optionLevel === "advanced" ? 1 : 0;
    const bAdvanced = b.optionLevel === "advanced" ? 1 : 0;
    return aAdvanced - bAdvanced;
  });
}

function selectRoleFiles(analysis: ThemeProjectAnalysis, groupSlots: ThemeAssetSlot[]): Partial<Record<ThemeResourceRole, ThemeProjectFile>> {
  return Object.fromEntries(groupSlots.map((slot) => [slot.role, findBestFile(analysis, slot.role)]));
}

function useRoleUrls(files: Partial<Record<ThemeResourceRole, ThemeProjectFile>>): RoleUrls {
  const fileSignature = previewRoleFilesSignature(files);
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
  }, [fileSignature]);

  return urls;
}
