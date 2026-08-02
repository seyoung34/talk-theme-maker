"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildSlotContrastWarnings } from "@/components/project/slotContrast";
import { getResolvedColor, type SlotCandidateSelections, type SlotColors } from "@/components/project/projectModel";
import { findBestFile } from "@/components/preview/previewResourceUtils";
import { autoMainPaletteCandidateId, buildMainPaletteRecommendations } from "@/lib/theme/autoColor";
import { extractThemeImagePalette, type ImageColorPalette } from "@/lib/theme/colorPalette";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

type UseProjectAutoColorsOptions = {
  activeTemplate: ThemeTemplate;
  analysis: ThemeProjectAnalysis;
  candidateSelections: SlotCandidateSelections;
  colors: SlotColors;
  platform: ThemePlatform;
  setCandidateSelections: Dispatch<SetStateAction<SlotCandidateSelections>>;
  setColors: Dispatch<SetStateAction<SlotColors>>;
  slots: ThemeAssetSlot[];
  templateId: ThemeTemplateId;
};

export function useProjectAutoColors({
  activeTemplate,
  analysis,
  candidateSelections,
  colors,
  platform,
  setCandidateSelections,
  setColors,
  slots,
  templateId,
}: UseProjectAutoColorsOptions) {
  const [imageColorPalette, setImageColorPalette] = useState<ImageColorPalette | null>(null);
  const [imageColorPaletteSourceKey, setImageColorPaletteSourceKey] = useState<string | null>(null);
  const [imageColorPaletteError, setImageColorPaletteError] = useState<string | null>(null);

  const mainBackgroundFile = useMemo(() => findBestFile(analysis, "main_background"), [analysis]);
  const mainBackgroundPaletteKey = mainBackgroundFile ? getThemeFilePaletteKey(mainBackgroundFile) : null;
  const activeImageColorPalette = mainBackgroundPaletteKey && imageColorPaletteSourceKey === mainBackgroundPaletteKey ? imageColorPalette : null;
  const mainBackgroundColorSlot = useMemo(() => slots.find((slot) => slot.role === "main_background_color"), [slots]);
  const resolvedMainBackground = mainBackgroundColorSlot
    ? getResolvedColor(mainBackgroundColorSlot, colors, candidateSelections, templateId, activeTemplate, slots) ?? activeTemplate.defaults.mainBackground
    : activeTemplate.defaults.mainBackground;

  useEffect(() => {
    let active = true;
    if (!mainBackgroundFile) {
      setImageColorPalette(null);
      setImageColorPaletteSourceKey(null);
      setImageColorPaletteError(null);
      return () => { active = false; };
    }

    setImageColorPalette(null);
    setImageColorPaletteSourceKey(null);
    setImageColorPaletteError(null);
    extractThemeImagePalette(mainBackgroundFile)
      .then((palette) => {
        if (!active) return;
        setImageColorPalette(palette);
        setImageColorPaletteSourceKey(mainBackgroundPaletteKey);
        setImageColorPaletteError(null);
      })
      .catch((error) => {
        if (!active) return;
        setImageColorPalette(null);
        setImageColorPaletteError(error instanceof Error ? error.message : "배경 이미지 색상을 분석하지 못했습니다.");
      });
    return () => { active = false; };
  }, [mainBackgroundPaletteKey, mainBackgroundFile]);

  const mainColorRecommendations = useMemo(
    () => buildMainPaletteRecommendations(slots, {
      imageActive: Boolean(mainBackgroundFile),
      palette: activeImageColorPalette,
      currentBackground: resolvedMainBackground,
      backgroundIsAuto: Boolean(mainBackgroundColorSlot && candidateSelections[mainBackgroundColorSlot.id] === autoMainPaletteCandidateId),
      templateAccent: activeTemplate.accent,
    }),
    [activeImageColorPalette, activeTemplate.accent, candidateSelections, mainBackgroundColorSlot, mainBackgroundFile, resolvedMainBackground, slots],
  );

  const contrastWarnings = useMemo(
    () => buildSlotContrastWarnings({
      platform,
      slots,
      colors,
      selections: candidateSelections,
      templateId,
      template: activeTemplate,
      imageColorPalette: activeImageColorPalette,
    }),
    [activeImageColorPalette, activeTemplate, candidateSelections, colors, platform, slots, templateId],
  );

  useEffect(() => {
    if (mainBackgroundFile && !activeImageColorPalette) return;
    const linkedSlots = slots.filter((slot) => slot.autoColorRecipe && candidateSelections[slot.id] === autoMainPaletteCandidateId && mainColorRecommendations[slot.id]);
    if (!linkedSlots.length) return;
    setColors((current) => {
      if (linkedSlots.every((slot) => current[slot.id]?.toUpperCase() === mainColorRecommendations[slot.id]?.toUpperCase())) return current;
      const next = { ...current };
      for (const slot of linkedSlots) next[slot.id] = mainColorRecommendations[slot.id];
      return next;
    });
  }, [activeImageColorPalette, candidateSelections, mainBackgroundFile, mainColorRecommendations, setColors, slots]);

  useEffect(() => {
    if (mainBackgroundFile || !mainBackgroundColorSlot) return;
    if (candidateSelections[mainBackgroundColorSlot.id] !== autoMainPaletteCandidateId) return;
    setColors((current) => current[mainBackgroundColorSlot.id] ? current : { ...current, [mainBackgroundColorSlot.id]: resolvedMainBackground });
    setCandidateSelections((current) => {
      const next = { ...current };
      delete next[mainBackgroundColorSlot.id];
      return next;
    });
  }, [candidateSelections, mainBackgroundColorSlot, mainBackgroundFile, resolvedMainBackground, setCandidateSelections, setColors]);

  return {
    activeImageColorPalette,
    contrastWarnings,
    imageColorPaletteError,
    mainBackgroundFile,
    mainColorRecommendations,
  };
}

function getThemeFilePaletteKey(file: ThemeProjectFile) {
  if (file.file) return `${file.path}:${file.file.name}:${file.file.size}:${file.file.lastModified}`;
  return `${file.path}:${file.sourceUrl ?? "embedded"}:${file.size}`;
}
