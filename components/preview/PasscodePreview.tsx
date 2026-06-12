"use client";

import { Delete } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getResolvedColor, type SlotCandidateSelections } from "@/components/project/projectModel";
import { findBestFile, imageUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeResourceRole } from "@/lib/theme/types";

type RoleFiles = Partial<Record<ThemeResourceRole, ThemeProjectFile>>;
type RoleUrls = Partial<Record<ThemeResourceRole, string>>;

type PasscodePalette = {
  background: string;
  text: string;
  keypad: string;
  keypadPressed: string;
  keypadBackground: string;
  keypadPressedBackground: string;
  patternLine: string;
};

export function PasscodePreview({
  analysis,
  slots,
  selectedSlotId,
  colors,
  selections,
  template,
  templateId,
  onSelectSlot,
}: {
  analysis: ThemeProjectAnalysis;
  slots: ThemeAssetSlot[];
  selectedSlotId?: string;
  colors: Record<string, string | undefined>;
  selections: SlotCandidateSelections;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  onSelectSlot?: (slotId: string) => void;
}) {
  const files = useMemo(() => selectRoleFiles(analysis), [analysis]);
  const urls = useRoleUrls(files);
  const slotByRole = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>,
    [slots],
  );

  const palette = useMemo<PasscodePalette>(() => {
    const getColor = (role: ThemeResourceRole, fallback: string) => getResolvedColor(slotByRole[role], colors, selections, templateId, template) ?? fallback;
    return {
      background: getColor("passcode_background_color", "#FCC5C5"),
      text: getColor("passcode_color", "#664242"),
      keypad: getColor("passcode_keypad_color", "#664242"),
      keypadPressed: getColor("passcode_keypad_pressed_color", "#CCB8B8"),
      keypadBackground: getColor("passcode_keypad_background_color", "#FFF2F2"),
      keypadPressedBackground: getColor("passcode_keypad_pressed_background_color", "#99FFDEDE"),
      patternLine: getColor("passcode_pattern_line_color", "#FCC5C5"),
    };
  }, [colors, selections, slotByRole, template, templateId]);

  const backgroundSelected = selectedSlotId === slotByRole.passcode_background?.id || selectedSlotId === slotByRole.passcode_background_color?.id;

  return (
    <section className="grid h-full w-full max-w-[760px] min-h-0 content-center gap-4 overflow-auto rounded-[28px] border border-[#d7ddd8] bg-white/96 p-5 shadow-[0_22px_48px_rgba(15,23,42,0.12)]">
      <div className="grid grid-cols-1 justify-items-center gap-4 lg:grid-cols-2">
        <PasscodePhone
          backgroundUrl={urls.passcode_background}
          palette={palette}
          selected={backgroundSelected}
          onSelect={() => onSelectSlot?.(slotByRole.passcode_background?.id ?? slotByRole.passcode_background_color?.id ?? "")}
        >
          <PasscodeTitle palette={palette} selectedSlotId={selectedSlotId} slotByRole={slotByRole} onSelectSlot={onSelectSlot} />
          <NumberKeypad palette={palette} selectedSlotId={selectedSlotId} slotByRole={slotByRole} onSelectSlot={onSelectSlot} />
        </PasscodePhone>

        <PasscodePhone
          backgroundUrl={urls.passcode_background}
          palette={palette}
          selected={backgroundSelected}
          onSelect={() => onSelectSlot?.(slotByRole.passcode_background?.id ?? slotByRole.passcode_background_color?.id ?? "")}
        >
          <PasscodeTitle palette={palette} selectedSlotId={selectedSlotId} slotByRole={slotByRole} onSelectSlot={onSelectSlot} />
          <PatternLock palette={palette} selectedSlotId={selectedSlotId} slotByRole={slotByRole} onSelectSlot={onSelectSlot} />
        </PasscodePhone>
      </div>
    </section>
  );
}

function PasscodePhone({
  children,
  backgroundUrl,
  palette,
  selected,
  onSelect,
}: {
  children: ReactNode;
  backgroundUrl?: string;
  palette: PasscodePalette;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`relative aspect-[1080/2340] h-full max-h-[620px] w-full max-w-[286px] overflow-hidden rounded-[28px] border shadow-[0_18px_38px_rgba(15,23,42,0.16)] ${selected ? "border-[#60a5fa]" : "border-[#d7ddd8]"}`}
      style={{
        backgroundColor: palette.background,
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
    >
      <div className="grid h-full grid-rows-[44%_1fr]">{children}</div>
    </div>
  );
}

function PasscodeTitle({
  palette,
  selectedSlotId,
  slotByRole,
  onSelectSlot,
}: {
  palette: PasscodePalette;
  selectedSlotId?: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`grid content-end justify-items-center gap-3 px-8 pb-7 text-center ${selectedSlotId === slotByRole.passcode_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      style={{ color: palette.text }}
      onClick={(event) => {
        event.stopPropagation();
        if (slotByRole.passcode_color) onSelectSlot?.(slotByRole.passcode_color.id);
      }}
    >
      <strong className="text-[22px] font-semibold leading-none">암호</strong>
      <span className="text-[12px] font-medium leading-none opacity-55">카카오톡 암호를 입력해주세요.</span>
    </button>
  );
}

function NumberKeypad({
  palette,
  selectedSlotId,
  slotByRole,
  onSelectSlot,
}: {
  palette: PasscodePalette;
  selectedSlotId?: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  onSelectSlot?: (slotId: string) => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"];

  return (
    <div
      role="button"
      tabIndex={0}
      className={`grid grid-cols-3 content-end gap-x-8 gap-y-4 px-10 pb-8 pt-4 ${selectedSlotId === slotByRole.passcode_keypad_background_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      style={{ backgroundColor: hexToRgba(palette.keypadBackground, 0.9) }}
      onClick={(event) => {
        event.stopPropagation();
        if (slotByRole.passcode_keypad_background_color) onSelectSlot?.(slotByRole.passcode_keypad_background_color.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (slotByRole.passcode_keypad_background_color) onSelectSlot?.(slotByRole.passcode_keypad_background_color.id);
      }}
    >
      {keys.map((key, index) =>
        key === "" ? (
          <span key={`blank-${index}`} />
        ) : (
          <button
            key={key}
            type="button"
            className={`grid h-11 w-11 place-items-center justify-self-center rounded-full text-[18px] font-semibold transition ${
              key === "5" || key === "delete" ? "ring-2 ring-inset ring-transparent" : ""
            } ${selectedSlotId === slotByRole.passcode_keypad_color?.id || selectedSlotId === slotByRole.passcode_keypad_pressed_color?.id || selectedSlotId === slotByRole.passcode_keypad_pressed_background_color?.id ? "outline outline-2 outline-[#60a5fa]/50" : ""}`}
            style={{
              color: key === "5" ? palette.keypadPressed : palette.keypad,
              backgroundColor: key === "5" ? hexToRgba(palette.keypadPressedBackground, 0.72) : "transparent",
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (key === "5" && slotByRole.passcode_keypad_pressed_background_color) {
                onSelectSlot?.(slotByRole.passcode_keypad_pressed_background_color.id);
                return;
              }
              if (key === "5" && slotByRole.passcode_keypad_pressed_color) {
                onSelectSlot?.(slotByRole.passcode_keypad_pressed_color.id);
                return;
              }
              if (slotByRole.passcode_keypad_color) onSelectSlot?.(slotByRole.passcode_keypad_color.id);
            }}
            aria-label={key === "delete" ? "delete" : key}
          >
            {key === "delete" ? <Delete className="h-4 w-4" /> : key}
          </button>
        ),
      )}
    </div>
  );
}

function PatternLock({
  palette,
  selectedSlotId,
  slotByRole,
  onSelectSlot,
}: {
  palette: PasscodePalette;
  selectedSlotId?: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`relative px-9 pb-16 pt-8 ${selectedSlotId === slotByRole.passcode_pattern_line_color?.id || selectedSlotId === slotByRole.passcode_keypad_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        if (slotByRole.passcode_pattern_line_color) onSelectSlot?.(slotByRole.passcode_pattern_line_color.id);
      }}
    >
      <div className="relative mx-auto grid aspect-square w-full max-w-[190px] grid-cols-3 place-items-center">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 180 180" aria-hidden="true">
          <path d="M30 30H90H150V90V150" fill="none" stroke={palette.patternLine} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </svg>
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} className="z-10 block h-3 w-3 rounded-full" style={{ backgroundColor: palette.keypad }} />
        ))}
      </div>
    </button>
  );
}

function selectRoleFiles(analysis: ThemeProjectAnalysis): RoleFiles {
  const roles: ThemeResourceRole[] = ["passcode_background"];
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

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length === 8) {
    const a = Number.parseInt(normalized.slice(0, 2), 16) / 255;
    const r = Number.parseInt(normalized.slice(2, 4), 16);
    const g = Number.parseInt(normalized.slice(4, 6), 16);
    const b = Number.parseInt(normalized.slice(6, 8), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(alpha, a).toFixed(3)})`;
  }

  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return hex;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
