"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectGroupRail } from "@/components/project/ProjectGroupRail";
import { ProjectPreviewPanel } from "@/components/project/ProjectPreviewPanel";
import { ProjectQuickEditPanel } from "@/components/project/ProjectQuickEditPanel";
import { ProjectSectionRail } from "@/components/project/ProjectSectionRail";
import {
  bubbleSlotFromRole,
  getCompletion,
  getInitialSlotCandidateSelections,
  getResolvedColor,
  getResolvedAssetUrl,
  getSectionGroups,
  getSlotFile,
  sectionLabels,
  type BubbleEditState,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/components/project/projectModel";
import { dataUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile, ThemeProjectResource } from "@/lib/theme/project/types";
import {
  getThemeSlots,
  getThemeTemplate,
  templateStartStorageKey,
  type ThemeAssetSlot,
  type ThemeStartPayload,
  type ThemeTemplate,
  type ThemeTemplateId,
} from "@/lib/theme/templates";
import type { BubbleSlot, Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

const editorHandoffKey = "kakaotalk-theme-maker:editor-handoff:v1";

export default function ProjectImporterClient() {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<ThemeTemplateId>("basic");
  const [platform, setPlatform] = useState<ThemePlatform>("android");
  const [activeSection, setActiveSection] = useState<ThemeSection>("chatroom");
  const [activeGroup, setActiveGroup] = useState<ThemeSlotGroup>("bubbles");
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>();
  const [uploads, setUploads] = useState<SlotUploads>({});
  const [colors, setColors] = useState<SlotColors>({});
  const [candidateSelections, setCandidateSelections] = useState<SlotCandidateSelections>({});
  const [screenRailOpen, setScreenRailOpen] = useState(true);
  const [candidateOpen, setCandidateOpen] = useState(true);
  const [bubbleMarkers, setBubbleMarkers] = useState<Partial<Record<string, Markers>>>({});
  const [bubbleInsets, setBubbleInsets] = useState<Partial<Record<string, Insets>>>({});
  const [bubbleStretch, setBubbleStretch] = useState<Partial<Record<string, StretchPoint>>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const payload = readTemplateStartPayload();
    if (!payload) return;
    setTemplateId(payload.templateId);
    setPlatform(payload.platform);
    setActiveSection("chatroom");
    setActiveGroup("bubbles");
    setSelectedSlotId(undefined);
    setUploads({});
    setColors({});
    localStorage.removeItem(templateStartStorageKey);
  }, []);

  const activeTemplate = getThemeTemplate(templateId);
  const slots = useMemo(() => getThemeSlots(platform), [platform]);
  useEffect(() => {
    setCandidateSelections(getInitialSlotCandidateSelections(slots, templateId, activeTemplate));
  }, [activeTemplate, slots, templateId]);
  const groups = useMemo(() => getSectionGroups(activeSection, slots), [activeSection, slots]);
  const analysis = useMemo(
    () => createTemplateAnalysis(activeTemplate, platform, slots, uploads, colors, candidateSelections),
    [activeTemplate, platform, slots, uploads, colors, candidateSelections],
  );

  useEffect(() => {
    if (!groups.includes(activeGroup)) {
      setActiveGroup(groups[0] ?? "background");
    }
  }, [activeGroup, groups]);

  const visibleSlots = useMemo(() => slots.filter((slot) => slot.section === activeSection && slot.group === activeGroup), [activeGroup, activeSection, slots]);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? visibleSlots[0] ?? slots[0];
  const selectedFile = getSlotFile(selectedSlot, analysis.files);
  const selectedBubbleSlot = selectedSlot ? bubbleSlotFromRole(selectedSlot.role) : null;
  const canAdjustInline = Boolean(selectedSlot?.editableInBubbleEditor && selectedFile && selectedBubbleSlot);
  const completion = getCompletion(slots, uploads, colors, candidateSelections, templateId, activeTemplate);

  const selectSection = (section: ThemeSection) => {
    setActiveSection(section);
    const nextGroups = getSectionGroups(section, slots);
    const nextGroup = nextGroups[0];
    if (nextGroup) setActiveGroup(nextGroup);
    const firstSlot = slots.find((slot) => slot.section === section && (!nextGroup || slot.group === nextGroup));
    setSelectedSlotId(firstSlot?.id);
  };

  const selectGroup = (group: ThemeSlotGroup) => {
    setActiveGroup(group);
    const firstSlot = slots.find((slot) => slot.section === activeSection && slot.group === group);
    setSelectedSlotId(firstSlot?.id);
  };

  const uploadSlot = (slot: ThemeAssetSlot, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const uploadId = `${slot.id}:upload:${Date.now()}`;
    setUploads((current) => ({
      ...current,
      [slot.id]: [...(current[slot.id] ?? []), { id: uploadId, file }],
    }));
    setCandidateSelections((current) => ({ ...current, [slot.id]: uploadId }));
    setSelectedSlotId(slot.id);
    setActiveSection(slot.section);
    setActiveGroup(slot.group);
  };

  const clearSlot = (slot: ThemeAssetSlot) => {
    setUploads((current) => {
      const next = { ...current };
      delete next[slot.id];
      return next;
    });
    setCandidateSelections((current) => ({
      ...current,
      [slot.id]: getInitialSlotCandidateSelections([slot], templateId, activeTemplate)[slot.id],
    }));
  };

  const changeColor = (slot: ThemeAssetSlot, value: string) => {
    setColors((current) => ({ ...current, [slot.id]: value }));
    setSelectedSlotId(slot.id);
  };

  const selectCandidate = (slot: ThemeAssetSlot, candidateId: string) => {
    setCandidateSelections((current) => ({ ...current, [slot.id]: candidateId }));
    setSelectedSlotId(slot.id);

    if (slot.kind === "color") {
      setColors((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
    }
  };

  const openAdvancedBubbleEditor = async () => {
    if (!selectedSlot?.editableInBubbleEditor || !selectedFile) {
      router.push("/editor");
      return;
    }
    const bubbleSlot = bubbleSlotFromRole(selectedSlot.role);
    if (!bubbleSlot) {
      router.push("/editor");
      return;
    }
    const dataUrl = await dataUrlForThemeFile(selectedFile);
    if (!dataUrl) {
      router.push("/editor");
      return;
    }
    localStorage.setItem(
      editorHandoffKey,
      JSON.stringify({
        slot: bubbleSlot,
        platform,
        name: selectedSlot.fileName,
        path: selectedSlot.path,
        dataUrl,
        markers: bubbleMarkers[selectedSlot.id],
        insets: bubbleInsets[selectedSlot.id],
        stretch: bubbleStretch[selectedSlot.id],
        createdAt: Date.now(),
      }),
    );
    router.push("/editor");
  };

  return (
    <main className="h-[100dvh] overflow-hidden px-3 py-3 text-[#111827] md:px-4 md:py-4">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3 md:gap-4">
        <header className="flex min-h-[65px] items-center justify-between gap-4 rounded-[24px] border border-[#e5e7eb] bg-white/92 px-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
          <div className="flex items-center min-w-0 gap-5">
            <Link href="/template" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e5e7eb] bg-[#f8fafc] text-xl font-bold leading-none text-[#111827] transition hover:bg-white">
              &larr;
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-[28px] font-semibold tracking-[-0.02em] text-[#0f172a]">{activeTemplate.name}</h1>

            </div>
            <div className="hidden rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[#475569] md:block">{platform === "android" ? "Android" : "iOS"}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 shrink-0 md:gap-3">
            <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fafc]" onClick={openAdvancedBubbleEditor}>
              고급 말풍선 편집
            </button>
            <button type="button" className="rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-[#1e293b]">
              테마 만들기
            </button>
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_300px] gap-3 lg:grid-cols-[auto_minmax(0,1fr)_300px] lg:grid-rows-1 xl:grid-cols-[auto_minmax(0,1fr)_340px] 2xl:grid-cols-[auto_minmax(0,1fr)_380px]">
          <ProjectSectionRail
            activeSection={activeSection}
            slots={slots}
            uploads={uploads}
            colors={colors}
            selections={candidateSelections}
            templateId={templateId}
            template={activeTemplate}
            isOpen={screenRailOpen}
            onToggle={() => setScreenRailOpen((current) => !current)}
            onSelectSection={selectSection}
          />

          <section className="grid min-h-0 min-w-0 grid-cols-[172px_minmax(0,1fr)] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white/92 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
            <ProjectGroupRail
              groups={groups}
              activeGroup={activeGroup}
              onSelectGroup={selectGroup}
              slots={visibleSlots}
              selectedSlotId={selectedSlot?.id}
              uploads={uploads}
              colors={colors}
              selections={candidateSelections}
              templateId={templateId}
              template={activeTemplate}
              onSelectSlot={(slot) => {
                setSelectedSlotId(slot.id);
                setActiveSection(slot.section);
                setActiveGroup(slot.group);
              }}
            />
            <div className="grid min-w-0 min-h-0 px-3">
              <ProjectQuickEditPanel
                slot={selectedSlot}
                file={selectedFile}
                uploads={uploads}
                colors={colors}
                selections={candidateSelections}
                templateId={templateId}
                template={activeTemplate}
                platform={platform}
                selectedBubbleSlot={selectedBubbleSlot}
                markers={selectedSlot ? bubbleMarkers[selectedSlot.id] : undefined}
                insets={selectedSlot ? bubbleInsets[selectedSlot.id] : undefined}
                stretch={selectedSlot ? bubbleStretch[selectedSlot.id] : undefined}
                fileInputRefs={fileInputRefs}
                onUpload={uploadSlot}
                onClear={clearSlot}
                onColorChange={changeColor}
                onSelectCandidate={selectCandidate}
                onOpenAdvanced={openAdvancedBubbleEditor}
                onMarkersChange={(markers) => selectedSlot && setBubbleMarkers((current) => ({ ...current, [selectedSlot.id]: markers }))}
                onInsetsChange={(insets) => selectedSlot && setBubbleInsets((current) => ({ ...current, [selectedSlot.id]: insets }))}
                onStretchChange={(stretch) => selectedSlot && setBubbleStretch((current) => ({ ...current, [selectedSlot.id]: stretch }))}
                canAdjustInline={canAdjustInline}
                candidateOpen={candidateOpen}
                onToggleCandidates={() => setCandidateOpen((current) => !current)}
              />
            </div>
          </section>

          <ProjectPreviewPanel
            analysis={analysis}
            activeSection={activeSection}
            template={activeTemplate}
            templateId={templateId}
            slots={slots}
            colors={colors}
            selections={candidateSelections}
            bubbleEdits={{
              me: slotEditFromMaps(["bubble_me_1", "bubble_me_2"], slots, bubbleMarkers, bubbleInsets, bubbleStretch),
              you: slotEditFromMaps(["bubble_you_1", "bubble_you_2"], slots, bubbleMarkers, bubbleInsets, bubbleStretch),
            }}
            selectedSlotId={selectedSlot?.id}
            className="col-span-2 lg:col-span-1 lg:row-start-auto"
            onSelectSlot={setSelectedSlotId}
          />
        </section>
      </div>
    </main>
  );
}

function createTemplateAnalysis(
  template: ThemeTemplate,
  platform: ThemePlatform,
  slots: ThemeAssetSlot[],
  uploads: SlotUploads,
  colors: SlotColors,
  selections: SlotCandidateSelections,
): ThemeProjectAnalysis {
  const files: ThemeProjectFile[] = [];
  const resources: ThemeProjectResource[] = [];
  const diagnostics = [];

  for (const slot of slots) {
    if (slot.kind === "color") {
      resources.push({ id: slot.id, slotId: slot.id, platform, role: slot.role, screen: slot.screen });
      if (slot.required && !getResolvedColor(slot, colors, selections, template.id, template)) {
        diagnostics.push({ level: "warning" as const, message: `${slot.label} 값이 필요합니다.` });
      }
      continue;
    }

    const upload = (uploads[slot.id] ?? []).find((entry) => entry.id === selections[slot.id])?.file;
    const sourceUrl = getResolvedAssetUrl(slot, uploads, selections, template.id, template);
    if (slot.path && slot.fileName) {
      files.push({ path: slot.path, name: slot.fileName, size: upload?.size ?? 0, file: upload, sourceUrl });
      resources.push({ id: slot.id, slotId: slot.id, platform, role: slot.role, screen: slot.screen, filePath: slot.path });
    }

    if (slot.required && !upload && !sourceUrl) {
      diagnostics.push({ level: "warning" as const, message: `${slot.label} 이미지가 필요합니다.`, filePath: slot.path });
    }
  }

  return {
    summary: {
      platform,
      rootName: template.name,
      screens: ["friends", "tabs", "chatroom"],
      resourceCount: resources.length,
      diagnosticsCount: diagnostics.length,
    },
    files,
    resources,
    diagnostics,
    previewDefaults: {
      chatBackground: template.defaults.chatBackground,
      myBubble: template.defaults.myBubble,
      friendBubble: template.defaults.friendBubble,
      accent: template.accent,
    },
  };
}

function readTemplateStartPayload(): ThemeStartPayload | null {
  try {
    const raw = localStorage.getItem(templateStartStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThemeStartPayload>;
    if ((parsed.templateId === "basic" || parsed.templateId === "spongebob") && (parsed.platform === "android" || parsed.platform === "ios")) {
      return { templateId: parsed.templateId, platform: parsed.platform };
    }
    return null;
  } catch {
    return null;
  }
}

function slotEditFromMaps(
  roles: ThemeResourceRole[],
  slots: ThemeAssetSlot[],
  bubbleMarkers: Partial<Record<string, Markers>>,
  bubbleInsets: Partial<Record<string, Insets>>,
  bubbleStretch: Partial<Record<string, StretchPoint>>,
): BubbleEditState | undefined {
  const slot = slots.find((item) => roles.includes(item.role));
  if (!slot) return undefined;
  const next = {
    markers: bubbleMarkers[slot.id],
    insets: bubbleInsets[slot.id],
    stretch: bubbleStretch[slot.id],
  };
  return next.markers || next.insets || next.stretch ? next : undefined;
}
