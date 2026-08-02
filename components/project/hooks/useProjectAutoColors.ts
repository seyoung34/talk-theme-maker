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
  const mainBackgroundFile = useMemo(() => findBestFile(analysis, "main_background"), [analysis]);
  const chatBackgroundFile = useMemo(() => findBestFile(analysis, "chat_background"), [analysis]);
  const { palette: activeImageColorPalette, error: imageColorPaletteError, pending: mainPalettePending } = useThemeImagePalette(mainBackgroundFile);
  const { palette: activeChatImagePalette, error: chatImageColorPaletteError, pending: chatPalettePending } = useThemeImagePalette(chatBackgroundFile);
  const mainBackgroundColorSlot = useMemo(() => slots.find((slot) => slot.role === "main_background_color"), [slots]);
  const chatBackgroundColorSlot = useMemo(() => slots.find((slot) => slot.role === "chat_background_color"), [slots]);
  const resolvedChatBackground = chatBackgroundColorSlot
    ? getResolvedColor(chatBackgroundColorSlot, colors, candidateSelections, templateId, activeTemplate, slots) ?? activeTemplate.defaults.chatBackground
    : activeTemplate.defaults.chatBackground;
  const resolvedMainBackground = mainBackgroundColorSlot
    ? getResolvedColor(mainBackgroundColorSlot, colors, candidateSelections, templateId, activeTemplate, slots) ?? activeTemplate.defaults.mainBackground
    : activeTemplate.defaults.mainBackground;

  const mainColorRecommendations = useMemo(
    () => buildMainPaletteRecommendations(slots, {
      imageActive: Boolean(mainBackgroundFile),
      palette: activeImageColorPalette,
      currentBackground: resolvedMainBackground,
      backgroundIsAuto: Boolean(mainBackgroundColorSlot && candidateSelections[mainBackgroundColorSlot.id] === autoMainPaletteCandidateId),
      templateAccent: activeTemplate.accent,
      chatImageActive: Boolean(chatBackgroundFile),
      chatPalette: activeChatImagePalette,
      currentChatBackground: resolvedChatBackground,
    }),
    [activeChatImagePalette, activeImageColorPalette, activeTemplate.accent, candidateSelections, chatBackgroundFile, mainBackgroundColorSlot, mainBackgroundFile, resolvedChatBackground, resolvedMainBackground, slots],
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
    // 분석 **중인** 이미지가 있으면 기다린다. 먼저 계산된 값으로 한 번 쓰고 나중에 덮으면
    // 화면이 두 번 튀고, 그 사이 값이 자동 저장에 남는다.
    //
    // "팔레트가 없다"로 판정하면 안 된다. 분석이 실패한 이미지는 팔레트가 영영 null이라
    // 자동 맞춤 전체가 멈춰 버린다 — 채팅방 이미지 하나가 깨지면 메인 색상까지 갱신이
    // 끊겼다. 실패는 대기가 아니므로 그대로 진행하고, 레시피가 현재 배경색으로 폴백한다.
    if (mainPalettePending || chatPalettePending) return;
    const linkedSlots = slots.filter((slot) => slot.autoColorRecipe && candidateSelections[slot.id] === autoMainPaletteCandidateId && mainColorRecommendations[slot.id]);
    if (!linkedSlots.length) return;
    setColors((current) => {
      if (linkedSlots.every((slot) => current[slot.id]?.toUpperCase() === mainColorRecommendations[slot.id]?.toUpperCase())) return current;
      const next = { ...current };
      for (const slot of linkedSlots) next[slot.id] = mainColorRecommendations[slot.id];
      return next;
    });
  }, [candidateSelections, chatPalettePending, mainColorRecommendations, mainPalettePending, setColors, slots]);

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
    chatImageColorPaletteError,
    chatPalettePending,
    contrastWarnings,
    imageColorPaletteError,
    mainBackgroundFile,
    mainColorRecommendations,
    mainPalettePending,
  };
}

function getThemeFilePaletteKey(file: ThemeProjectFile) {
  if (file.file) return `${file.path}:${file.file.name}:${file.file.size}:${file.file.lastModified}`;
  return `${file.path}:${file.sourceUrl ?? "embedded"}:${file.size}`;
}

/**
 * 배경 이미지에서 색 팔레트를 뽑는다.
 *
 * 추출은 이미지를 디코딩해 캔버스에서 픽셀을 읽는 비동기 작업이라 `getResolvedColor` 같은
 * 동기 경로에서는 조회할 수 없다. 그래서 여기서 뽑아 상태로 들고 있다가 자동 맞춤이
 * `colors`에 기록하는 방식을 쓴다.
 *
 * 파일이 바뀌면 이전 팔레트를 즉시 버린다. 남겨 두면 새 이미지가 준비되는 동안 옛 이미지의
 * 색으로 한 번 계산돼 화면이 튄다. 어느 파일에서 나온 값인지는 key로 확인한다.
 */
function useThemeImagePalette(file: ThemeProjectFile | undefined) {
  const [palette, setPalette] = useState<ImageColorPalette | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paletteKey = file ? getThemeFilePaletteKey(file) : null;

  useEffect(() => {
    let active = true;
    setPalette(null);
    setSourceKey(null);
    setError(null);
    if (!file) return () => { active = false; };

    extractThemeImagePalette(file)
      .then((next) => {
        if (!active) return;
        setPalette(next);
        setSourceKey(paletteKey);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setPalette(null);
        setError(cause instanceof Error ? cause.message : "배경 이미지 색상을 분석하지 못했습니다.");
      });
    return () => { active = false; };
  }, [file, paletteKey]);

  // `pending`은 "이 파일의 분석이 아직 안 끝났다"만 뜻한다. 실패는 끝난 것이다 — 실패를
  // 대기로 세면 호출부가 영원히 기다린다.
  return {
    palette: paletteKey && sourceKey === paletteKey ? palette : null,
    error,
    pending: Boolean(paletteKey) && sourceKey !== paletteKey && !error,
  };
}
