"use client";

import { useState, type DragEvent, type MutableRefObject } from "react";
import InlineBubbleAdjuster from "@/components/editor/InlineBubbleAdjuster";
import { buildSlotCandidates, getDefaultColor, getSelectedCandidate, getSlotUploadEntries, slotStatusLabel, type SlotCandidate, type SlotCandidateSelections, type SlotColors, type SlotUploads } from "@/components/project/projectModel";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform } from "@/lib/theme/types";

export function ProjectQuickEditPanel({
  slot,
  file,
  uploads,
  colors,
  selections,
  templateId,
  template,
  platform,
  selectedBubbleSlot,
  markers,
  insets,
  stretch,
  fileInputRefs,
  onUpload,
  onClear,
  onColorChange,
  onSelectCandidate,
  onOpenAdvanced,
  onMarkersChange,
  onInsetsChange,
  onStretchChange,
  canAdjustInline,
  candidateOpen,
  onToggleCandidates,
}: {
  slot?: ThemeAssetSlot;
  file?: ThemeProjectFile;
  uploads: SlotUploads;
  colors: SlotColors;
  selections: SlotCandidateSelections;
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
  platform: ThemePlatform;
  selectedBubbleSlot: BubbleSlot | null;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onUpload: (slot: ThemeAssetSlot, files: FileList | null) => void;
  onClear: (slot: ThemeAssetSlot) => void;
  onColorChange: (slot: ThemeAssetSlot, value: string) => void;
  onSelectCandidate: (slot: ThemeAssetSlot, candidateId: string) => void;
  onOpenAdvanced: () => void;
  onMarkersChange: (markers: Markers) => void;
  onInsetsChange: (insets: Insets) => void;
  onStretchChange: (stretch: StretchPoint) => void;
  canAdjustInline: boolean;
  candidateOpen: boolean;
  onToggleCandidates: () => void;
}) {
  const [dragActive, setDragActive] = useState(false);

  if (!slot) return null;

  const hasImage = Boolean(file?.file || file?.sourceUrl);
  const status = slotStatusLabel(slot, uploads, colors, selections, templateId, template);
  const candidates = buildSlotCandidates(slot, uploads, colors, selections, templateId, template);
  const selectedCandidate = getSelectedCandidate(slot, selections, templateId, template);
  const uploadEntries = getSlotUploadEntries(slot, uploads);

  const handleDrop = (event: DragEvent<HTMLButtonElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (slot.kind !== "color") {
      onUpload(slot, event.dataTransfer.files);
    }
  };

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <CandidatePicker
        slot={slot}
        candidates={candidates}
        isOpen={candidateOpen}
        onToggle={onToggleCandidates}
        onApplyCandidate={(candidate) => {
          onSelectCandidate(slot, candidate.id);
        }}
      />
      <section className="grid min-h-0 content-start gap-5 overflow-auto rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        {/* <div className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
            {slot.kind === "color" ? "Color token" : slot.kind === "ninepatch" ? "Nine-patch asset" : "Image asset"}
          </span>
          <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[#0f172a]">{slot.label}</h2>
        </div> */}
        <div className="grid gap-3 lg:grid-cols-2">
          <DetailRow label={slot.kind === "color" ? "설정 키" : "파일명"} value={slot.kind === "color" ? slot.colorKey ?? "-" : slot.fileName ?? "-"} />
          <DetailRow label="상태" value={status} />
        </div>
        {slot.kind === "color" ? (
          <ColorEditor slot={slot} value={colors[slot.id] ?? selectedCandidate?.colorValue ?? getDefaultColor(slot, templateId, template)} onChange={onColorChange} />
        ) : (
          <>
            <input
              ref={(node) => {
                fileInputRefs.current[slot.id] = node;
              }}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => onUpload(slot, event.currentTarget.files)}
            />
            <div
              className={`grid gap-4 rounded-[18px] border-2 border-dashed p-4 transition ${dragActive ? "border-[#60a5fa] bg-[#eff6ff]" : "border-[#d7dee8] bg-[#f8fafc]"}`}
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
              onDrop={handleDrop}
            >
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">이미지 업로드</p>
                <p className="mt-1 text-[12px] font-medium text-[#6b7280]">파일을 여기로 드래그하거나 버튼으로 선택합니다.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1e293b]" onClick={() => fileInputRefs.current[slot.id]?.click()}>
                  이미지 선택
                </button>
                <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm font-semibold text-[#374151] transition enabled:hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45" disabled={uploadEntries.length === 0} onClick={() => onClear(slot)}>
                  업로드 비우기
                </button>
                {slot.editableInBubbleEditor && (
                  <button type="button" className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm font-semibold text-[#1d4ed8] transition enabled:hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-45" disabled={!hasImage} onClick={onOpenAdvanced}>
                    고급 말풍선 편집
                  </button>
                )}
              </div>
            </div>
            {canAdjustInline && selectedBubbleSlot && (
              <InlineBubbleAdjuster
                file={file}
                slot={selectedBubbleSlot}
                platform={platform}
                markers={markers}
                insets={insets}
                stretch={stretch}
                onMarkersChange={onMarkersChange}
                onInsetsChange={onInsetsChange}
                onStretchChange={onStretchChange}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function CandidatePicker({
  slot,
  candidates,
  isOpen,
  onToggle,
  onApplyCandidate,
}: {
  slot: ThemeAssetSlot;
  candidates: SlotCandidate[];
  isOpen: boolean;
  onToggle: () => void;
  onApplyCandidate: (candidate: SlotCandidate) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="mt-0.5 text-base font-semibold text-[#0f172a]">{slot.label}</h2>
        </div>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-[#e5e7eb] bg-[#f8fafc] text-sm font-bold text-[#475569]" onClick={onToggle} aria-label={isOpen ? "후보 접기" : "후보 펼치기"}>
          {isOpen ? "−" : "+"}
        </button>
      </div>
      {isOpen && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(148px,1fr))] gap-2.5">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`grid h-[88px] content-between rounded-[14px] border px-3 py-3 text-left transition ${
                candidate.selected ? "border-[#bfdbfe] bg-[#eff6ff]" : candidate.active ? "border-[#cbd5e1] bg-white" : "border-[#e5e7eb] bg-[#f8fafc]"
              } hover:border-[#cbd5e1] hover:bg-white`}
              onClick={() => {
                onApplyCandidate(candidate);
              }}
            >
              <span className="text-[13px] font-semibold text-[#111827]">{candidate.title}</span>
              <span className="line-clamp-2 text-[11px] font-medium leading-[1.3] text-[#6b7280]">{candidate.status}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ColorEditor({
  slot,
  value,
  onChange,
}: {
  slot: ThemeAssetSlot;
  value: string;
  onChange: (slot: ThemeAssetSlot, value: string) => void;
}) {
  return (
    <div className="grid gap-4 rounded-[18px] border border-[#e5e7eb] bg-[#f8fafc] p-4">
      <div className="flex items-center gap-4">
        <input
          type="color"
          value={value}
          className="h-12 w-16 cursor-pointer rounded-lg border border-[#d1d5db] bg-white p-1"
          onChange={(event) => onChange(slot, event.currentTarget.value)}
        />
        <input
          type="text"
          value={value}
          className="h-12 flex-1 rounded-xl border border-[#d1d5db] bg-white px-4 text-sm font-semibold text-[#111827]"
          onChange={(event) => onChange(slot, event.currentTarget.value)}
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</span>
      <strong className="mt-1 block break-all text-sm font-semibold text-[#111827]">{value}</strong>
    </div>
  );
}
