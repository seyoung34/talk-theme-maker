"use client";

import { Bell, CalendarCheck2, CalendarClock, ChevronRight, Cloud, Gamepad2, Gift, IdCard, ListPlus, MessageCirclePlus, PackageOpen, PawPrint, Percent, Radio, Scan, Search, Settings, Share2, Smile, Store, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getResolvedColor, type SlotCandidateSelections } from "@/components/project/projectModel";
import { findBestFile, imageUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeResourceRole, ThemeSection } from "@/lib/theme/types";
import { readableThemeForeground, themeColorToCss } from "@/lib/theme/color";

type RoleFiles = Partial<Record<ThemeResourceRole, ThemeProjectFile>>;
type RoleUrls = Partial<Record<ThemeResourceRole, string>>;

const friendRows = [
  { name: "김민수", sub: "오늘도 화이팅", cta: "선물하기" },
  { name: "미나미", sub: "야호", cta: "선물하기" },
  { name: "정원이", sub: "거제", cta: "선물하기" },
  { name: "김가영", sub: "신라공주", cta: "선물하기" },
];

const chatRows = [
  { name: "수아", sub: "콜! 이따 6시에 보자 ㅎㅎ", time: "09:40" },
  { name: "가족 단톡방", sub: "엄마: 저녁 몇 시에 올 거야?", time: "어제", badge: "5" },
  { name: "정하늘", sub: "그 사진 봤어?? 완전 웃기다 ㅋㅋㅋ", time: "어제", badge: "1" },
  { name: "동아리 모임", sub: "이번 주 토요일에 다 같이 모이자~", time: "어제", badge: "3" },
  { name: "이준서", sub: "오늘 저녁에 시간 괜찮아?", time: "화요일" },
  { name: "박서연", sub: "고마워 진짜ㅠㅠ 다음에 내가 살게", time: "월요일" },
];

const moreFeatureItems = [
  { label: "선물하기", icon: Gift },
  { label: "받은선물", icon: PackageOpen },
  { label: "톡딜", icon: Percent },
  { label: "이모티콘", icon: Smile, badge: "light" as const },
  { label: "라이브쇼핑", icon: Radio, badge: "dark" as const },
  { label: "메이커스", icon: Store },
  { label: "프렌즈", icon: PawPrint },
  { label: "게임", icon: Gamepad2 },
  { label: "모바일신분증", icon: IdCard },
  { label: "톡클라우드", icon: Cloud },
  { label: "캘린더", icon: CalendarCheck2 },
  { label: "예약하기", icon: CalendarClock },
];

//메인
export function ThemeScreensPreview({
  analysis,
  section,
  slots,
  selectedSlotId,
  colors,
  selections,
  template,
  templateId,
  onSelectSlot,
}: {
  analysis: ThemeProjectAnalysis;
  section: Extract<ThemeSection, "main" | "tabs" | "more">;
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
  const platform = analysis.summary.platform;
  const slotByRole = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>,
    [slots],
  );
  const profileUrls = useMemo(() => getProfilePreviewUrls(urls), [urls]);

  const preview = useMemo(() => {
    const getColor = (role: ThemeResourceRole, fallback: string) => themeColorToCss(getResolvedColor(slotByRole[role], colors, selections, templateId, template) ?? fallback);
    const mainBackgroundColor = getColor("main_background_color", template.defaults.mainBackground);
    const androidHeaderBackgroundColor = getColor("main_header_color", template.defaults.mainHeader);

    return {
      mainBackgroundColor,
      headerBackgroundColor: platform === "ios" ? mainBackgroundColor : androidHeaderBackgroundColor,
      headerForegroundColor: getColor("main_header_foreground_color", template.defaults.mainTitle),
      titleColor: getColor("main_title_color", template.defaults.mainTitle),
      titlePressedColor: getColor("main_title_pressed_color", template.defaults.mainTitle),
      descriptionColor: getColor("main_description_color", template.defaults.mainBody),
      descriptionPressedColor: getColor("main_description_pressed_color", template.defaults.mainBody),
      paragraphColor: getColor("tab_paragraph_color", template.defaults.mainBody),
      paragraphPressedColor: getColor("tab_paragraph_pressed_color", template.defaults.mainBody),
      bodyCellColor: getColor("main_body_cell_color", withAlpha(template.defaults.mainBackground, "00")),
      bodyCellPressedColor: getColor("main_body_cell_pressed_color", withAlpha(template.defaults.mainBackground, "99")),
      bodyCellBorderColor: getColor("main_body_cell_border_color", withAlpha(template.defaults.mainTitle, "33")),
      sectionTitleColor: getColor("main_section_title_color", template.defaults.mainTitle),
      featureBrowseTabColor: getColor("main_feature_browse_tab_color", template.defaults.tabBackground),
      featurePrimaryColor: getColor("feature_primary_color", template.accent),
      bodySecondaryColor: getColor("main_body_secondary_cell_color", lighten(template.defaults.mainBackground, 0.06)),
      tabBackgroundColor: getColor("tab_background", template.defaults.tabBackground),
      lightBadgeColor: getColor("tab_light_banner_badge_background_color", template.accent),
      badgeColor: getColor("tab_banner_badge_background_color", template.accent),
    };
  }, [colors, selections, slotByRole, templateId, template, platform]);

  const mainBackgroundSlot = slotByRole.main_background;
  const mainBackgroundColorSlot = slotByRole.main_background_color;
  const moreBackgroundSlot = slotByRole.main_body_secondary_cell_color;

  return (
    <PhoneFrame
      backgroundUrl={section === "more" ? undefined : urls.main_background}
      fallbackBackground={section === "more" ? preview.bodySecondaryColor : preview.mainBackgroundColor}
      selected={section === "more" ? selectedSlotId === moreBackgroundSlot?.id : selectedSlotId === mainBackgroundSlot?.id || selectedSlotId === mainBackgroundColorSlot?.id}
      onSelect={() => onSelectSlot?.(section === "more" ? moreBackgroundSlot?.id ?? "" : mainBackgroundSlot?.id ?? mainBackgroundColorSlot?.id ?? "")}
    >
      {section === "main" ? (
        <FriendsScreen platform={platform} selectedSlotId={selectedSlotId} preview={preview} slotByRole={slotByRole} urls={urls} profileUrls={profileUrls} onSelectSlot={onSelectSlot} />
      ) : section === "tabs" ? (
        <ChatsScreen platform={platform} selectedSlotId={selectedSlotId} preview={preview} slotByRole={slotByRole} urls={urls} profileUrls={profileUrls} onSelectSlot={onSelectSlot} />
      ) : <MoreScreen selectedSlotId={selectedSlotId} preview={preview} slotByRole={slotByRole} urls={urls} onSelectSlot={onSelectSlot} />}
    </PhoneFrame>
  );
}

type MainPreviewPalette = {
  mainBackgroundColor: string;
  headerBackgroundColor: string;
  headerForegroundColor: string;
  titleColor: string;
  titlePressedColor: string;
  descriptionColor: string;
  descriptionPressedColor: string;
  paragraphColor: string;
  paragraphPressedColor: string;
  bodyCellColor: string;
  bodyCellPressedColor: string;
  bodyCellBorderColor: string;
  sectionTitleColor: string;
  featureBrowseTabColor: string;
  featurePrimaryColor: string;
  bodySecondaryColor: string;
  tabBackgroundColor: string;
  lightBadgeColor: string;
  badgeColor: string;
};

//친구탭
function FriendsScreen({
  platform,
  selectedSlotId,
  preview,
  slotByRole,
  urls,
  profileUrls,
  onSelectSlot,
}: {
  platform: "android" | "ios";
  selectedSlotId?: string;
  preview: MainPreviewPalette;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  profileUrls: string[];
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <MainScreenFrame>
      <button
        type="button"
        className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-6 pb-4 pt-4 text-left ${selectedSlotId === slotByRole.main_header_color?.id || selectedSlotId === slotByRole.main_header_foreground_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
        style={{ backgroundColor: hexToRgba(preview.headerBackgroundColor, platform === "ios" && urls.main_background ? 0.32 : 0.72) }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectSlot?.(slotByRole.main_header_color?.id ?? slotByRole.main_header_foreground_color?.id ?? "");
        }}
      >
        <AvatarCircle src={profileUrls[0]} size="h-6 w-8" />
        <strong className="block text-[13px] font-semibold" style={{ color: preview.headerForegroundColor }}>
          내 프로필
        </strong>
        <div className="flex items-center gap-3" style={{ color: preview.headerForegroundColor }}>
          <Search className="w-4 h-4" />
          <UserPlus className="w-4 h-4" />
          <Gift className="w-4 h-4" />
          <Settings className="w-4 h-4" />
        </div>
      </button>

      <div className="px-4 pb-3 mt-2 overflow-hidden">
        <div className="grid h-full content-start gap-3 overflow-hidden px-0.5 pb-2">
          <div className="flex gap-2">
            <Chip active backgroundColor={preview.titleColor} textColor={preview.mainBackgroundColor}>친구</Chip>
            <Chip textColor={preview.titleColor}>추천</Chip>
          </div>

          <div className="grid min-h-[60px] grid-cols-[64px_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-[12px] bg-[#f1f3f5] px-3 py-2 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)]" aria-label="카카오톡 광고 예시 영역">
            <span className="grid h-12 w-16 place-items-center rounded-lg bg-[#e2e5e9] text-[9px] font-bold tracking-[0.08em] text-[#868e96]" aria-hidden="true">AD</span>
            <span className="min-w-0">
              <strong className="block truncate text-[12px] font-semibold text-[#343a40]">카카오톡 채널의 새로운 소식</strong>
              <span className="mt-1 block truncate text-[10px] font-medium text-[#868e96]">테마와 무관한 광고 예시 영역입니다.</span>
            </span>
          </div>

          <button
            type="button"
            className={`px-1 text-left ${selectedSlotId === slotByRole.main_section_title_color?.id ? "rounded-lg ring-2 ring-[#60a5fa]" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              if (slotByRole.main_section_title_color) onSelectSlot?.(slotByRole.main_section_title_color.id);
            }}
          >
            <span className="text-[14px] font-semibold" style={{ color: preview.sectionTitleColor }}>
              업데이트 프로필 12
            </span>
          </button>

          <div className="grid grid-cols-5 gap-1 px-0.5">
            {["내 프로필", "코끼리", "강아지", "고양이", "다람쥐"].map((name, index) => (
              <div key={name} className="grid min-w-0 justify-items-center gap-1.5">
                <div className="relative">
                  <AvatarCircle src={profileUrls[index % profileUrls.length]} size="h-10 w-10" />
                  {index > 0 ? <span className="absolute -top-1 left-1 h-2 w-2 -translate-x-1/2 rounded-full bg-[#ff7246]" /> : null}
                </div>
                <button
                  type="button"
                  className={`block w-full text-center ${selectedSlotId === slotByRole.main_description_color?.id ? "rounded-md bg-white/70 px-0.5 py-0.5 ring-1 ring-[#60a5fa]" : ""}`}
                  style={{ color: preview.descriptionColor }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_description_color) onSelectSlot?.(slotByRole.main_description_color.id);
                  }}
                >
                  <span className="block w-full truncate text-[8px] font-medium leading-[1.2]">{name}</span>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            aria-label="친구·채팅 리스트 셀 구분선 색상 편집"
            className={`grid h-1 items-center rounded-sm ${selectedSlotId === slotByRole.main_body_cell_border_color?.id ? "ring-1 ring-[#60a5fa]" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              if (slotByRole.main_body_cell_border_color) onSelectSlot?.(slotByRole.main_body_cell_border_color.id);
            }}
          >
            <span className="block h-px w-full" style={{ backgroundColor: themeColorToCss(preview.bodyCellBorderColor) }} />
          </button>

          <div className="grid gap-3 px-1">
            <SectionLabel
              label="생일인 친구 4"
              color={preview.sectionTitleColor}
              selected={selectedSlotId === slotByRole.main_section_title_color?.id}
              onClick={() => slotByRole.main_section_title_color && onSelectSlot?.(slotByRole.main_section_title_color.id)}
            />
            {friendRows.map((row) => (
              <div key={row.name} className="grid gap-0.5">
                <button
                  type="button"
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-1 py-1.5 text-left ${selectedSlotId === slotByRole.main_body_cell_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
                  style={{ backgroundColor: getVisibleCellBackground(preview.bodyCellColor) }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_body_cell_color) onSelectSlot?.(slotByRole.main_body_cell_color.id);
                  }}
                >
                  <AvatarCircle src={profileUrls[friendRows.indexOf(row) % profileUrls.length]} size="h-12 w-12" />
                  <div>
                    <strong className="block text-[14px] font-semibold leading-none" style={{ color: preview.titleColor }}>
                      {row.name}
                    </strong>
                    <span className="mt-1 block text-[11px] font-medium leading-none" style={{ color: preview.descriptionColor }}>
                      {row.sub}
                    </span>
                  </div>
                  <span className="rounded-full border border-[#7aa8af]/35 bg-white/12 px-2 py-2 text-[10px] font-semibold" style={{ color: preview.descriptionPressedColor }}>
                    {row.cta}
                  </span>
                </button>
              </div>
            ))}


          </div>
        </div>
      </div>

      <MainBottomTabBar
        active="friends"
        selectedSlotId={selectedSlotId}
        preview={preview}
        slotByRole={slotByRole}
        urls={urls}
        onSelectSlot={onSelectSlot}
      />
    </MainScreenFrame>
  );
}

//채팅탭
function ChatsScreen({
  platform,
  selectedSlotId,
  preview,
  slotByRole,
  urls,
  profileUrls,
  onSelectSlot,
}: {
  platform: "android" | "ios";
  selectedSlotId?: string;
  preview: MainPreviewPalette;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  profileUrls: string[];
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <MainScreenFrame>
      <button
        type="button"
        className={`flex items-end justify-between px-5 pb-2 pt-3 text-left ${selectedSlotId === slotByRole.main_header_color?.id || selectedSlotId === slotByRole.main_header_foreground_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
        style={{ backgroundColor: hexToRgba(preview.headerBackgroundColor, platform === "ios" && urls.main_background ? 0.32 : 1) }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectSlot?.(slotByRole.main_header_color?.id ?? slotByRole.main_header_foreground_color?.id ?? "");
        }}
      >
        <strong className="text-xl font-semibold tracking-[-0.03em]" style={{ color: preview.headerForegroundColor }}>
          채팅
        </strong>
        <div className="flex items-center gap-4" style={{ color: preview.headerForegroundColor }}>
          <Search className="w-5 h-5" />
          <MessageCirclePlus className="w-5 h-5" />
          <Settings className="w-5 h-5" />
        </div>
      </button>

      <div className="grid content-start min-h-0 gap-3 pb-1 overflow-hidden">
        <div className={`px-4 pt-2 ${selectedSlotId === (platform === "ios" ? slotByRole.main_background_color?.id : slotByRole.main_header_color?.id) ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`} style={{ backgroundColor: hexToRgba(preview.headerBackgroundColor, platform === "ios" && urls.main_background ? 0.32 : 1) }} onClick={(event) => { event.stopPropagation(); const target = platform === "ios" ? slotByRole.main_background_color : slotByRole.main_header_color; if (target) onSelectSlot?.(target.id); }}>
          <div className="flex items-center gap-2 overflow-hidden">
            <FilterPill compact dark color={preview.headerForegroundColor}>전체</FilterPill>
            <FilterPill compact color={preview.headerForegroundColor}>
              <span className="text-sm">안읽음</span>
              <BadgeSmall value="40" />
            </FilterPill>
            <FilterPill compact color={preview.headerForegroundColor}>
              <strong className="text-[13px] font-semibold">친구</strong>
              <BadgeSmall value="12" />
            </FilterPill>
            <FilterPill compact color={preview.headerForegroundColor}>
              <ListPlus className="w-4 h-4" />
            </FilterPill>
          </div>
        </div>

        <div className="pl-4 pr-6">
          <div className="grid min-h-[60px] grid-cols-[64px_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-[12px] bg-[#f1f3f5] px-3 py-2 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)]" aria-label="카카오톡 광고 예시 영역">
            <span className="grid h-12 w-16 place-items-center rounded-lg bg-[#e2e5e9] text-[9px] font-bold tracking-[0.08em] text-[#868e96]" aria-hidden="true">AD</span>
            <span className="min-w-0">
              <strong className="block truncate text-[12px] font-semibold text-[#343a40]">카카오톡 채널의 새로운 소식</strong>
              <span className="mt-1 block truncate text-[10px] font-medium text-[#868e96]">테마와 무관한 광고 예시 영역입니다.</span>
            </span>
          </div>
        </div>



        <div className="grid min-h-0 gap-0 px-4 overflow-hidden">
          {chatRows.map((row, index) => (
            <div
              key={`${row.name}-${index}`}
              role="button"
              tabIndex={0}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-1 py-2 text-left ${selectedSlotId === slotByRole.main_body_cell_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
              style={{ backgroundColor: getVisibleCellBackground(preview.bodyCellColor) }}
              onClick={(event) => {
                event.stopPropagation();
                if (slotByRole.main_body_cell_color) onSelectSlot?.(slotByRole.main_body_cell_color.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                if (slotByRole.main_body_cell_color) onSelectSlot?.(slotByRole.main_body_cell_color.id);
              }}
            >
              <AvatarCircle src={profileUrls[index % profileUrls.length]} size="h-12 w-12" />
              <div className="min-w-0">
                <button
                  type="button"
                  className={`block text-left ${selectedSlotId === slotByRole.main_title_color?.id ? "rounded-md ring-1 ring-[#60a5fa]" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_title_color) onSelectSlot?.(slotByRole.main_title_color.id);
                  }}
                >
                  <strong className="line-clamp-1 text-[14px] font-semibold" style={{ color: preview.titleColor }}>
                    {row.name}
                  </strong>
                </button>
                <button
                  type="button"
                  className={`mt-0.5 block text-left ${selectedSlotId === slotByRole.tab_paragraph_color?.id ? "rounded-md ring-1 ring-[#60a5fa]" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.tab_paragraph_color) onSelectSlot?.(slotByRole.tab_paragraph_color.id);
                  }}
                >
                  <span className="line-clamp-1 text-[12px] font-medium leading-[1.3]" style={{ color: preview.paragraphColor }}>
                    {row.sub}
                  </span>
                </button>
              </div>
              <div className="grid justify-items-end gap-1 self-start pt-0.5">
                <span className="text-[10px] font-medium" style={{ color: preview.paragraphColor }}>
                  {row.time}
                </span>
                {row.badge ? <UnreadBadge value={row.badge} /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <MainBottomTabBar
        active="chats"
        selectedSlotId={selectedSlotId}
        preview={preview}
        slotByRole={slotByRole}
        urls={urls}
        onSelectSlot={onSelectSlot}
      />
    </MainScreenFrame>
  );
}

//더보기 (Android/iOS 공통 프리뷰)
function MoreScreen({ selectedSlotId, preview, slotByRole, urls, onSelectSlot }: { selectedSlotId?: string; preview: MainPreviewPalette; slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>; urls: RoleUrls; onSelectSlot?: (slotId: string) => void }) {
  const headerSelected = selectedSlotId === slotByRole.main_header_color?.id || selectedSlotId === slotByRole.main_header_foreground_color?.id;
  const hasMainBackgroundImage = Boolean(urls.main_background);
  const headerColor = hasMainBackgroundImage ? preview.headerBackgroundColor : preview.mainBackgroundColor;
  const chipColor = preview.headerBackgroundColor;

  return (
    <MainScreenFrame>
      <div className="min-w-0">
        <button
          type="button"
          className={`flex w-full min-w-0 items-center justify-between gap-4 px-4 pb-3 pt-4 text-left ${headerSelected ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
          style={{ backgroundColor: headerColor, color: preview.headerForegroundColor }}
          onClick={(event) => { event.stopPropagation(); onSelectSlot?.(slotByRole.main_header_color?.id ?? slotByRole.main_header_foreground_color?.id ?? ""); }}
        >
          <strong className="shrink-0 text-xl font-semibold tracking-[-0.03em]">더보기</strong>
          <div className="flex shrink-0 items-center gap-4">
            <Search className="size-5" aria-hidden="true" />
            <Scan className="size-5" aria-hidden="true" />
            <span className="relative">
              <Settings className="size-5" aria-hidden="true" />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#ff6b37]" aria-hidden="true" />
            </span>
          </div>
        </button>

        <div className="flex min-w-0 items-center gap-2 px-4 pb-3" style={{ backgroundColor: chipColor }}>
          <button
            type="button"
            className={`shrink-0 rounded-full px-4 py-1.5 text-[12px] font-bold ${selectedSlotId === slotByRole.main_title_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
            style={{ backgroundColor: preview.titleColor, color: preview.mainBackgroundColor }}
            onClick={(event) => { event.stopPropagation(); if (slotByRole.main_title_color) onSelectSlot?.(slotByRole.main_title_color.id); }}
          >
            홈
          </button>
          <button
            type="button"
            className={`flex shrink-0 items-center gap-1 rounded-full border px-4 py-1.5 text-[12px] font-bold ${selectedSlotId === slotByRole.main_title_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
            style={{ borderColor: hexToRgba(readableThemeForeground(chipColor), 0.22), color: preview.titleColor }}
            onClick={(event) => { event.stopPropagation(); if (slotByRole.main_title_color) onSelectSlot?.(slotByRole.main_title_color.id); }}
          >
            지갑<span className="rounded-full bg-[#ff6b37] px-1 text-[9px] font-bold text-white">N</span>
          </button>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 content-start gap-3 overflow-hidden px-4 py-3" style={{ backgroundColor: preview.bodySecondaryColor }}>
        <div className="grid min-w-0 gap-1 rounded-2xl bg-[#fee500] px-4 py-3" aria-label="pay 잔액 예시 영역 (테마와 무관)">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#2b2b2b]">pay 303,747원</span>
            <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-[#2b2b2b]/75">
              송금<span className="opacity-30">|</span>자산<span className="opacity-30">|</span>결제
            </span>
          </div>
          <span className="text-[9px] font-medium text-[#2b2b2b]/55">테마와 무관한 예시 영역입니다.</span>
        </div>

        <div className="rounded-2xl px-2 pb-1.5 pt-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]" style={{ backgroundColor: hexToRgba(preview.titleColor, 0.06) }}>
          <button
            type="button"
            className={`grid w-full grid-cols-4 gap-y-3 ${selectedSlotId === slotByRole.main_title_color?.id ? "rounded-xl ring-2 ring-[#60a5fa]" : ""}`}
            onClick={(event) => { event.stopPropagation(); if (slotByRole.main_title_color) onSelectSlot?.(slotByRole.main_title_color.id); }}
          >
            {moreFeatureItems.map(({ label, icon: Icon, badge }) => (
              <span key={label} className="grid justify-items-center gap-1">
                <span className="relative grid size-8 place-items-center">
                  <Icon className="size-[18px]" style={{ color: preview.titleColor }} aria-hidden="true" />
                  {badge ? <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: badge === "light" ? preview.lightBadgeColor : preview.badgeColor }} aria-hidden="true" /> : null}
                </span>
                <span className="text-center text-[8.5px] font-medium leading-tight" style={{ color: preview.titleColor }}>{label}</span>
              </span>
            ))}
          </button>
          <div className="mt-2 flex items-center justify-center gap-1 pb-1" aria-hidden="true">
            <span className="h-1.5 w-3 rounded-full" style={{ backgroundColor: preview.titleColor }} />
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: preview.featureBrowseTabColor }} />
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: preview.featureBrowseTabColor }} />
          </div>
        </div>

        <div className="grid min-w-0 gap-2 rounded-xl bg-[#f1f3f5] px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]" aria-label="카카오톡 광고 예시 영역">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e2e5e9] text-[#868e96]"><Share2 className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#343a40]">바로 공유 · 자주 쓰는 대상을 빠르게 선택하세요</span>
          </div>
          <div className="flex min-w-0 items-center gap-2.5 border-t border-black/5 pt-2">
            <Bell className="size-4 shrink-0 text-[#868e96]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#868e96]">새로운 테마 소식이 있습니다</span>
            <ChevronRight className="size-3.5 shrink-0 text-[#868e96]" aria-hidden="true" />
          </div>
          <span className="text-[9px] font-medium text-[#868e96]">테마와 무관한 광고 예시 영역입니다.</span>
        </div>

        <div className="grid min-h-[56px] grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[12px] bg-[#f1f3f5] px-3 py-2 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)]" aria-label="카카오톡 광고 예시 영역">
          <span className="grid h-10 w-14 place-items-center rounded-lg bg-[#e2e5e9] text-[8px] font-bold tracking-[0.08em] text-[#868e96]" aria-hidden="true">AD</span>
          <span className="min-w-0">
            <strong className="block truncate text-[11px] font-semibold text-[#343a40]">케이스티파이 NEW 리플 케이스</strong>
            <span className="mt-0.5 block truncate text-[9px] font-medium text-[#868e96]">테마와 무관한 광고 예시 영역입니다.</span>
          </span>
          <span className="shrink-0 rounded-lg border border-[#dee2e6] px-2 py-1 text-[9px] font-semibold text-[#495057]">구매하기</span>
        </div>

        <SectionLabel
          label="게임플레이"
          color={preview.sectionTitleColor}
          selected={selectedSlotId === slotByRole.main_section_title_color?.id}
          onClick={() => slotByRole.main_section_title_color && onSelectSlot?.(slotByRole.main_section_title_color.id)}
        />
      </div>

      <MainBottomTabBar active="more" selectedSlotId={selectedSlotId} preview={preview} slotByRole={slotByRole} urls={urls} onSelectSlot={onSelectSlot} />
    </MainScreenFrame>
  );
}

function MainScreenFrame({ children }: { children: ReactNode }) {
  return <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_72px]">{children}</div>;
}

function MainBottomTabBar({
  active,
  selectedSlotId,
  preview,
  slotByRole,
  urls,
  onSelectSlot,
}: {
  active: "friends" | "chats" | "now" | "shopping" | "more";
  selectedSlotId?: string;
  preview: MainPreviewPalette;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <BottomTabBar
      active={active}
      selectedSlotId={selectedSlotId}
      slotByRole={slotByRole}
      urls={urls}
      tabBackground={preview.tabBackgroundColor}
      tabBackgroundImageUrl={urls.tab_background_image}
      onSelectSlot={onSelectSlot}
    />
  );
}

function PhoneFrame({
  children,
  backgroundUrl,
  fallbackBackground,
  selected,
  onSelect,
}: {
  children: ReactNode;
  backgroundUrl?: string;
  fallbackBackground: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`mx-auto aspect-[1080/2340] h-full w-full max-w-[310px] overflow-hidden rounded-[32px] border shadow-[0_12px_32px_rgba(15,23,42,0.08)] ${selected ? "border-[#60a5fa]" : "border-transparent"}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
      style={{
        backgroundImage: backgroundUrl ? `linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.12)), url(${backgroundUrl})` : undefined,
        backgroundColor: fallbackBackground,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {children}
    </div>
  );
}

//탭바
function BottomTabBar({
  active,
  selectedSlotId,
  slotByRole,
  urls,
  tabBackground,
  tabBackgroundImageUrl,
  onSelectSlot,
}: {
  active: "friends" | "chats" | "now" | "shopping" | "more";
  selectedSlotId?: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  tabBackground: string;
  tabBackgroundImageUrl?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div
      className={`grid grid-cols-5 items-center px-3 ${selectedSlotId === slotByRole.tab_background?.id || selectedSlotId === slotByRole.tab_background_image?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      style={{
        backgroundColor: hexToRgba(tabBackground, 0.96),
        backgroundImage: tabBackgroundImageUrl ? `url(${tabBackgroundImageUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (slotByRole.tab_background_image) {
          onSelectSlot?.(slotByRole.tab_background_image.id);
          return;
        }
        if (slotByRole.tab_background) onSelectSlot?.(slotByRole.tab_background.id);
      }}
    >
      <TabAsset active={active === "friends"} label="친구" defaultUrl={urls.tab_icon_friends} focusedUrl={urls.tab_icon_friends_focused} slot={slotByRole.tab_icon_friends ?? slotByRole.tab_icon_friends_focused} selected={selectedSlotId === slotByRole.tab_icon_friends?.id || selectedSlotId === slotByRole.tab_icon_friends_focused?.id} badge="12" onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "chats"} label="채팅" defaultUrl={urls.tab_icon_chats} focusedUrl={urls.tab_icon_chats_focused} slot={slotByRole.tab_icon_chats ?? slotByRole.tab_icon_chats_focused} selected={selectedSlotId === slotByRole.tab_icon_chats?.id || selectedSlotId === slotByRole.tab_icon_chats_focused?.id} badge="8" onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "now"} label="Now" defaultUrl={urls.tab_icon_now} focusedUrl={urls.tab_icon_now_focused} slot={slotByRole.tab_icon_now ?? slotByRole.tab_icon_now_focused} selected={selectedSlotId === slotByRole.tab_icon_now?.id || selectedSlotId === slotByRole.tab_icon_now_focused?.id} onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "shopping"} label="쇼핑" defaultUrl={urls.tab_icon_shopping} focusedUrl={urls.tab_icon_shopping_focused} slot={slotByRole.tab_icon_shopping ?? slotByRole.tab_icon_shopping_focused} selected={selectedSlotId === slotByRole.tab_icon_shopping?.id || selectedSlotId === slotByRole.tab_icon_shopping_focused?.id} onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "more"} label="더보기" defaultUrl={urls.tab_icon_more} focusedUrl={urls.tab_icon_more_focused} slot={slotByRole.tab_icon_more ?? slotByRole.tab_icon_more_focused} selected={selectedSlotId === slotByRole.tab_icon_more?.id || selectedSlotId === slotByRole.tab_icon_more_focused?.id} dot onSelectSlot={onSelectSlot} />
    </div>
  );
}

function TabAsset({
  active,
  label,
  defaultUrl,
  focusedUrl,
  slot,
  selected,
  badge,
  dot,
  onSelectSlot,
}: {
  active: boolean;
  label: string;
  defaultUrl?: string;
  focusedUrl?: string;
  slot?: ThemeAssetSlot;
  selected: boolean;
  badge?: string;
  dot?: boolean;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`relative grid justify-items-center gap-0.5 rounded-[18px] px-0.5 py-0.5 ${selected ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        if (slot) onSelectSlot?.(slot.id);
      }}
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-full">
        <span className="h-7 w-7 bg-center bg-no-repeat bg-contain" style={{ backgroundImage: `url(${active ? focusedUrl || defaultUrl || "" : defaultUrl || focusedUrl || ""})` }} />
      </span>
      <span className="text-[9px] font-semibold text-[#57737a]">{label}</span>
      {badge ? <span className="absolute left-1/2 top-0 rounded-full bg-[#ff6b37] px-1.5 py-px text-[9px] font-bold text-white">{badge}</span> : null}
      {dot ? <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[#ff6b37]" /> : null}
    </button>
  );
}

function AvatarCircle({ src, size }: { src?: string; size: string }) {
  return <span className={`${size} block rounded-full border border-white/70 bg-[#dceff2] bg-cover bg-center shadow-[0_8px_18px_rgba(15,23,42,0.08)]`} style={{ backgroundImage: src ? `url(${src})` : undefined }} />;
}

function Chip({ active, backgroundColor, textColor, children }: { active?: boolean; backgroundColor?: string; textColor?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-full px-6 text-[14px] font-semibold ${active ? "text-white" : "border bg-white/14"}`}
      style={active
        ? { backgroundColor: backgroundColor ?? "#0d5b66", color: textColor ?? "#ffffff" }
        : { borderColor: textColor ?? "#0d5b66", color: textColor ?? "#ffffff" }}
    >
      {children}
    </span>
  );
}

function FilterPill({
  children,
  dark,
  wide,
  compact,
  color,
}: {
  children: ReactNode;
  dark?: boolean;
  wide?: boolean;
  compact?: boolean;
  color?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold ${compact ? "h-8" : "h-10"} ${wide ? "min-w-[116px] justify-center" : ""}`}
      style={
        dark
          ? { borderColor: "transparent", backgroundColor: hexToRgba(color ?? "#0d5b66", 0.95), color: "#ffffff" }
          : { borderColor: hexToRgba(color ?? "#0e8394", 0.28), backgroundColor: "rgba(255,255,255,0.08)", color: color ?? "#0d4f58" }
      }
    >
      {children}
    </span>
  );
}

function BadgeSmall({ value }: { value: string }) {
  return <span className="rounded-full bg-[#ff6b37] px-1 py-[3px] text-[11px] leading-none text-white">{value}</span>;
}

function UnreadBadge({ value }: { value: string }) {
  return <span className="rounded-full bg-[#ff6b37] px-2 py-1 text-[10px] font-bold text-white">{value}</span>;
}

function SectionLabel({ label, color, selected, onClick }: { label: string; color: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`text-left ${selected ? "rounded-lg ring-1 ring-[#60a5fa]" : ""}`} onClick={onClick}>
      <span className="text-[14px] font-semibold" style={{ color }}>
        {label}
      </span>
    </button>
  );
}

function selectRoleFiles(analysis: ThemeProjectAnalysis): RoleFiles {
  const roles: ThemeResourceRole[] = [
    "main_background",
    "tab_background_image",
    "tab_icon_friends",
    "tab_icon_friends_focused",
    "tab_icon_chats",
    "tab_icon_chats_focused",
    "tab_icon_now",
    "tab_icon_now_focused",
    "tab_icon_shopping",
    "tab_icon_shopping_focused",
    "tab_icon_more",
    "tab_icon_more_focused",
    "profile_image_1",
    "profile_image_2",
    "profile_image_3",
  ];

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
        const nextUrl = await imageUrlForThemeFile(file);
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

function getProfilePreviewUrls(urls: RoleUrls) {
  const ordered = [urls.profile_image_1, urls.profile_image_2, urls.profile_image_3].filter((value): value is string => Boolean(value));
  if (ordered.length > 0) return ordered;
  return [urls.main_background ?? ""];
}

function hexToRgba(hex: string, alpha: number) {
  const cssColor = themeColorToCss(hex);
  if (cssColor === "transparent") return cssColor;
  const functionalMatch = cssColor.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
  if (functionalMatch) {
    return `rgba(${functionalMatch[1]}, ${functionalMatch[2]}, ${functionalMatch[3]}, ${alpha})`;
  }

  const normalized = cssColor.replace("#", "");
  if (normalized.length === 8) {
    const r = Number.parseInt(normalized.slice(2, 4), 16);
    const g = Number.parseInt(normalized.slice(4, 6), 16);
    const b = Number.parseInt(normalized.slice(6, 8), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function withAlpha(color: string, alphaHex: string) {
  const normalized = color.trim().replace("#", "");
  const base = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized.slice(-6);
  return `#${alphaHex}${base}`.toUpperCase();
}

function getVisibleCellBackground(color: string) {
  const cssColor = themeColorToCss(color);
  return cssColor === "transparent" ? undefined : cssColor;
}

function lighten(color: string, amount: number) {
  const normalized = color.trim().replace("#", "");
  const base = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized.slice(-6);
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(base.slice(offset, offset + 2), 16));
  const adjust = (channel: number) => Math.max(0, Math.min(255, Math.round(channel + 255 * amount)));
  return `#${[adjust(r), adjust(g), adjust(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
