"use client";

import { Delete, Grid3X3, KeyRound, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getResolvedColor, type SlotCandidateSelections } from "@/components/project/projectModel";
import { findBestFile, imageUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeResourceRole } from "@/lib/theme/types";
import { themeColorContrast, themeColorToCss } from "@/lib/theme/color";

type PasscodeMode = "number" | "pattern";
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

export function PasscodePreview({ analysis, slots, selectedSlotId, colors, selections, template, templateId, onSelectSlot }: {
  analysis: ThemeProjectAnalysis;
  slots: ThemeAssetSlot[];
  selectedSlotId?: string;
  colors: Record<string, string | undefined>;
  selections: SlotCandidateSelections;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  onSelectSlot?: (slotId: string) => void;
}) {
  const [mode, setMode] = useState<PasscodeMode>("number");
  const [enteredDigits, setEnteredDigits] = useState(0);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [patternNodes, setPatternNodes] = useState<number[]>([0, 1, 4, 7, 8]);
  const supportsPattern = analysis.summary.platform === "android";
  const files = useMemo(() => selectRoleFiles(analysis), [analysis]);
  const urls = useRoleUrls(files);
  const slotByRole = useMemo(() => Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>, [slots]);

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

  useEffect(() => {
    if (selectedSlotId === slotByRole.passcode_pattern_line_color?.id) setMode("pattern");
  }, [selectedSlotId, slotByRole.passcode_pattern_line_color?.id]);

  useEffect(() => {
    if (!supportsPattern && mode !== "number") setMode("number");
  }, [mode, supportsPattern]);

  const selectRole = (role: ThemeResourceRole) => {
    const slot = slotByRole[role];
    if (slot) onSelectSlot?.(slot.id);
  };
  const resetSimulation = () => {
    setEnteredDigits(0);
    setPressedKey(null);
    setPatternNodes([]);
  };
  const deviceProps = {
    mode,
    backgroundUrl: urls.passcode_background,
    indicatorUrls: urls,
    keypadPressedImageUrl: urls.passcode_keypad_pressed_image,
    palette,
    slotByRole,
    selectedSlotId,
    enteredDigits,
    pressedKey,
    patternNodes,
    onSelectRole: selectRole,
    onDigitsChange: setEnteredDigits,
    onPressedKeyChange: setPressedKey,
    onPatternChange: setPatternNodes,
  };
  const warnings = getContrastWarnings(palette, Boolean(urls.passcode_background), mode);

  return (
    <section className="grid h-full w-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-[24px] border border-[#d7ddd8] bg-white/96 p-3 shadow-[0_22px_48px_rgba(15,23,42,0.12)]">
      <PasscodeToolbar mode={mode} supportsPattern={supportsPattern} onModeChange={setMode} onReset={resetSimulation} />

      <div className="grid min-h-0 place-items-start overflow-auto rounded-[18px] bg-[#f5f7f6] px-3 py-4 sm:place-items-center">
        <PasscodeDevice {...deviceProps} />
      </div>

      {warnings.length ? <p className="truncate rounded-lg bg-[#fff6d8] px-3 py-2 text-[11px] font-semibold text-[#725a00]" title={warnings.join(" ")}>{warnings.join(" · ")}</p> : <span />}
    </section>
  );
}

function PasscodeToolbar({ mode, supportsPattern, onModeChange, onReset }: { mode: PasscodeMode; supportsPattern: boolean; onModeChange: (mode: PasscodeMode) => void; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className={`grid rounded-xl bg-[#eef2f3] p-1 ${supportsPattern ? "grid-cols-2" : "grid-cols-1"}`} role="group" aria-label="잠금 방식">
        <ModeButton active={mode === "number"} label="숫자" icon={<KeyRound size={14} />} onClick={() => onModeChange("number")} />
        {supportsPattern ? <ModeButton active={mode === "pattern"} label="패턴" icon={<Grid3X3 size={14} />} onClick={() => onModeChange("pattern")} /> : null}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className="grid size-9 place-items-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]" onClick={onReset} aria-label="입력 상태 초기화"><RotateCcw size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function ModeButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${active ? "bg-white text-[#0f172a] shadow-sm" : "text-[#64748b]"}`}>{icon}{label}</button>;
}

function PasscodeDevice({ mode, backgroundUrl, indicatorUrls, keypadPressedImageUrl, palette, slotByRole, selectedSlotId, enteredDigits, pressedKey, patternNodes, onSelectRole, onDigitsChange, onPressedKeyChange, onPatternChange }: {
  mode: PasscodeMode;
  backgroundUrl?: string;
  indicatorUrls: RoleUrls;
  keypadPressedImageUrl?: string;
  palette: PasscodePalette;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  selectedSlotId?: string;
  enteredDigits: number;
  pressedKey: string | null;
  patternNodes: number[];
  onSelectRole: (role: ThemeResourceRole) => void;
  onDigitsChange: (count: number) => void;
  onPressedKeyChange: (key: string | null) => void;
  onPatternChange: (nodes: number[]) => void;
}) {
  const backgroundSelected = selectedSlotId === slotByRole.passcode_background?.id || selectedSlotId === slotByRole.passcode_background_color?.id;
  return (
    <div className={`relative aspect-[1080/2340] w-full max-w-[268px] overflow-hidden rounded-[30px] border bg-cover bg-center shadow-[0_20px_48px_rgba(15,23,42,0.2)] transition ${backgroundSelected ? "border-[#2563eb] ring-2 ring-[#93c5fd]" : "border-[#cbd5d1]"}`} style={{ backgroundColor: themeColorToCss(palette.background), backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined }} onClick={() => onSelectRole(backgroundUrl ? "passcode_background" : "passcode_background_color")}>
      <div className="grid h-full grid-rows-[43%_1fr]">
        <PasscodeHeader mode={mode} palette={palette} enteredDigits={enteredDigits} indicatorUrls={indicatorUrls} selectedSlotId={selectedSlotId} slotByRole={slotByRole} onSelectRole={onSelectRole} />
        {mode === "number" ? (
          <NumberPad palette={palette} pressedImageUrl={keypadPressedImageUrl} selectedSlotId={selectedSlotId} slotByRole={slotByRole} enteredDigits={enteredDigits} pressedKey={pressedKey} onSelectRole={onSelectRole} onDigitsChange={onDigitsChange} onPressedKeyChange={onPressedKeyChange} />
        ) : (
          <PatternPad palette={palette} selectedSlotId={selectedSlotId} slotByRole={slotByRole} nodes={patternNodes} onSelectRole={onSelectRole} onChange={onPatternChange} />
        )}
      </div>
    </div>
  );
}

function PasscodeHeader({ mode, palette, enteredDigits, indicatorUrls, selectedSlotId, slotByRole, onSelectRole }: { mode: PasscodeMode; palette: PasscodePalette; enteredDigits: number; indicatorUrls: RoleUrls; selectedSlotId?: string; slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>; onSelectRole: (role: ThemeResourceRole) => void }) {
  return (
    <div className={`grid content-end justify-items-center gap-3 px-7 pb-5 text-center ${selectedSlotId === slotByRole.passcode_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`} style={{ color: themeColorToCss(palette.text) }}>
      <button type="button" className="grid gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]" onClick={(event) => { event.stopPropagation(); onSelectRole("passcode_color"); }}>
        <strong className="text-[21px] font-semibold leading-none">암호</strong>
        {mode === "number" ? <span className="text-[11px] font-medium leading-none opacity-65">카카오톡 암호를 입력해주세요.</span> : <span className="text-[11px] font-medium leading-none opacity-65">잠금해제 패턴을 입력해주세요.</span>}
      </button>
      {mode === "number" ? <PasscodeIndicators enteredDigits={enteredDigits} urls={indicatorUrls} selectedSlotId={selectedSlotId} slotByRole={slotByRole} onSelectRole={onSelectRole} /> : null}
    </div>
  );
}

function PasscodeIndicators({ enteredDigits, urls, selectedSlotId, slotByRole, onSelectRole }: { enteredDigits: number; urls: RoleUrls; selectedSlotId?: string; slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>; onSelectRole: (role: ThemeResourceRole) => void }) {
  return <div className="flex min-h-10 items-center justify-center gap-2" aria-label={`${enteredDigits}자리 입력됨`}>{Array.from({ length: 4 }).map((_, index) => {
    const position = index + 1;
    const checked = index < enteredDigits;
    const role = `passcode_indicator_${position}${checked ? "_checked" : ""}` as ThemeResourceRole;
    const src = urls[role];
    const selected = selectedSlotId === slotByRole[role]?.id;
    return <button key={position} type="button" className={`grid size-10 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${selected ? "ring-2 ring-[#60a5fa]" : ""}`} aria-label={`${position}번째 암호 ${checked ? "입력" : "기본"} 이미지`} onClick={(event) => { event.stopPropagation(); onSelectRole(role); }}>{src ? <img src={src} alt="" className="size-10 object-contain" /> : <span className={`size-2.5 rounded-full border border-current ${checked ? "bg-current" : "bg-transparent opacity-45"}`} />}</button>;
  })}</div>;
}

function NumberPad({ palette, pressedImageUrl, selectedSlotId, slotByRole, enteredDigits, pressedKey, onSelectRole, onDigitsChange, onPressedKeyChange }: {
  palette: PasscodePalette;
  pressedImageUrl?: string;
  selectedSlotId?: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  enteredDigits: number;
  pressedKey: string | null;
  onSelectRole: (role: ThemeResourceRole) => void;
  onDigitsChange: (count: number) => void;
  onPressedKeyChange: (key: string | null) => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"];
  const selected = ["passcode_keypad_color", "passcode_keypad_pressed_color", "passcode_keypad_background_color", "passcode_keypad_pressed_background_color", "passcode_keypad_pressed_image"].some((role) => selectedSlotId === slotByRole[role as ThemeResourceRole]?.id);
  return (
    <div className={`grid grid-cols-3 content-end gap-x-7 gap-y-3 px-8 pb-7 pt-4 ${selected ? "ring-2 ring-inset ring-[#60a5fa]/65" : ""}`} style={{ backgroundColor: themeColorToCss(palette.keypadBackground) }}>
      {keys.map((key, index) => key === "" ? <span key={`blank-${index}`} /> : (
        <button key={key} type="button" aria-label={key === "delete" ? "한 자리 지우기" : `${key} 입력`} className="grid size-11 place-items-center justify-self-center rounded-full text-[18px] font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]" style={{ color: themeColorToCss(pressedKey === key && !pressedImageUrl ? palette.keypadPressed : palette.keypad), backgroundColor: pressedKey === key && !pressedImageUrl ? themeColorToCss(palette.keypadPressedBackground) : "transparent", backgroundImage: pressedKey === key && pressedImageUrl ? `url(${pressedImageUrl})` : undefined, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" }}
          onPointerDown={() => onPressedKeyChange(key)} onPointerUp={() => onPressedKeyChange(null)} onPointerCancel={() => onPressedKeyChange(null)} onPointerLeave={() => { if (pressedKey === key) onPressedKeyChange(null); }}
          onClick={(event) => { event.stopPropagation(); if (selectedSlotId !== slotByRole.passcode_keypad_pressed_image?.id) onSelectRole("passcode_keypad_color"); onDigitsChange(key === "delete" ? Math.max(0, enteredDigits - 1) : Math.min(4, enteredDigits + 1)); }}>
          {key === "delete" ? <Delete className="size-4" aria-hidden="true" /> : key}
        </button>
      ))}
    </div>
  );
}

function PatternPad({ palette, selectedSlotId, slotByRole, nodes, onSelectRole, onChange }: { palette: PasscodePalette; selectedSlotId?: string; slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>; nodes: number[]; onSelectRole: (role: ThemeResourceRole) => void; onChange: (nodes: number[]) => void }) {
  const [drawing, setDrawing] = useState(false);
  const points = nodes.map((node) => `${30 + (node % 3) * 60},${30 + Math.floor(node / 3) * 60}`).join(" ");
  const selected = selectedSlotId === slotByRole.passcode_pattern_line_color?.id || selectedSlotId === slotByRole.passcode_keypad_color?.id;
  const addNode = (node: number) => onChange(nodes.includes(node) ? nodes : [...nodes, node]);
  return (
    <div className={`grid content-center px-8 pb-10 pt-6 ${selected ? "ring-2 ring-inset ring-[#60a5fa]/65" : ""}`} onPointerUp={() => setDrawing(false)} onPointerLeave={() => setDrawing(false)}>
      <div className="relative mx-auto grid aspect-square w-full max-w-[205px] grid-cols-3 place-items-center" onClick={(event) => { event.stopPropagation(); onSelectRole("passcode_pattern_line_color"); }}>
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 180 180" aria-hidden="true"><polyline points={points} fill="none" stroke={themeColorToCss(palette.patternLine)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" /></svg>
        {Array.from({ length: 9 }).map((_, index) => {
          const active = nodes.includes(index);
          return <button key={index} type="button" className="z-10 grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]" aria-label={`패턴 점 ${index + 1}`} aria-pressed={active} onPointerDown={(event) => { event.stopPropagation(); setDrawing(true); onChange([index]); onSelectRole("passcode_keypad_color"); }} onPointerEnter={() => { if (drawing) addNode(index); }} onClick={(event) => event.stopPropagation()}><span className={`block rounded-full transition ${active ? "size-4 ring-4 ring-current/20" : "size-3"}`} style={{ backgroundColor: themeColorToCss(palette.keypad), color: themeColorToCss(palette.keypad) }} /></button>;
        })}
      </div>
    </div>
  );
}

function selectRoleFiles(analysis: ThemeProjectAnalysis): RoleFiles {
  const roles: ThemeResourceRole[] = ["passcode_background", "passcode_indicator_1", "passcode_indicator_1_checked", "passcode_indicator_2", "passcode_indicator_2_checked", "passcode_indicator_3", "passcode_indicator_3_checked", "passcode_indicator_4", "passcode_indicator_4_checked", "passcode_keypad_pressed_image"];
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
    return () => { cancelled = true; objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [files]);
  return urls;
}

function getContrastWarnings(palette: PasscodePalette, hasBackgroundImage: boolean, mode: PasscodeMode) {
  const warnings: string[] = [];
  if (!hasBackgroundImage && themeColorContrast(palette.text, palette.background) < 3) warnings.push("제목과 배경의 대비가 낮습니다.");
  if (themeColorContrast(palette.keypad, palette.keypadBackground) < 3) warnings.push("키패드 숫자가 잘 보이지 않을 수 있습니다.");
  if (mode === "pattern" && !hasBackgroundImage && themeColorContrast(palette.patternLine, palette.background) < 2) warnings.push("패턴 선과 배경이 유사합니다.");
  return warnings;
}
