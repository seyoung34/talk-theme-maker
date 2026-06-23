"use client";

import { Bell, ChevronRight, Gift, MessageCirclePlus, Search, Settings, Share2, UserPlus, ListPlus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getResolvedColor, type SlotCandidateSelections } from "@/components/project/projectModel";
import { findBestFile, imageUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeResourceRole, ThemeSection } from "@/lib/theme/types";

type RoleFiles = Partial<Record<ThemeResourceRole, ThemeProjectFile>>;
type RoleUrls = Partial<Record<ThemeResourceRole, string>>;

const friendRows = [
  { name: "테스트 프로필", sub: "오늘", cta: "추가" },
  { name: "샘플 그룹", sub: "어제", cta: "초대" },
  { name: "워크스페이스", sub: "어제", cta: "보기" },
  { name: "디자인 리뷰", sub: "최근", cta: "열기" },
];

const chatRows = [
  { name: "프로젝트 공지", sub: "템플릿 미리보기를 최종 점검해 주세요.", time: "09:40" },
  { name: "내부 QA", sub: "메인 화면 색상과 아이콘 상태를 다시 확인합니다.", time: "어제" },
  { name: "디자인 리뷰", sub: "후보 카드와 공통 리소스 프리뷰를 정리했습니다.", time: "어제", badge: "3" },
  { name: "블루베리군", sub: "블루베리가 크고 맛있다", time: "어제", badge: "2" },
  { name: "개발 노트", sub: "Android 프로젝트 ZIP 내보내기까지 연결되었습니다.", time: "어제" },
  { name: "딸기양", sub: "딸기는 맛있다", time: "어제" },
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
  const slotByRole = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>,
    [slots],
  );
  const profileUrls = useMemo(() => getProfilePreviewUrls(urls), [urls]);

  const preview = useMemo(() => {
    const getColor = (role: ThemeResourceRole, fallback: string) => getResolvedColor(slotByRole[role], colors, selections, templateId, template) ?? fallback;

    return {
      mainBackgroundColor: getColor("main_background_color", template.defaults.mainBackground),
      headerBackgroundColor: getColor("main_header_color", template.defaults.mainHeader),
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
      featureBrowseTabFocusedColor: getColor("main_feature_browse_tab_focused_color", template.defaults.mainTitle),
      featurePrimaryColor: getColor("feature_primary_color", template.accent),
      bodySecondaryColor: getColor("main_body_secondary_cell_color", lighten(template.defaults.mainBackground, 0.06)),
      tabBackgroundColor: getColor("tab_background", template.defaults.tabBackground),
      lightBadgeColor: getColor("tab_light_banner_badge_background_color", template.accent),
      badgeColor: getColor("tab_banner_badge_background_color", template.accent),
      directShareTextColor: getColor("direct_share_text_color", template.defaults.mainTitle),
      directShareButtonColor: getColor("direct_share_button_color", template.accent),
      directShareBackgroundColor: getColor("direct_share_background_color", lighten(template.defaults.mainBackground, 0.04)),
      notificationTextColor: getColor("notification_text_color", template.defaults.mainTitle),
      notificationBackgroundColor: getColor("notification_background_color", template.defaults.friendBubble),
    };
  }, [colors, selections, slotByRole, templateId, template]);

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
        <FriendsScreen selectedSlotId={selectedSlotId} preview={preview} slotByRole={slotByRole} urls={urls} profileUrls={profileUrls} onSelectSlot={onSelectSlot} />
      ) : section === "tabs" ? (
        <ChatsScreen selectedSlotId={selectedSlotId} preview={preview} slotByRole={slotByRole} urls={urls} profileUrls={profileUrls} onSelectSlot={onSelectSlot} />
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
  featureBrowseTabFocusedColor: string;
  featurePrimaryColor: string;
  bodySecondaryColor: string;
  tabBackgroundColor: string;
  lightBadgeColor: string;
  badgeColor: string;
  directShareTextColor: string;
  directShareButtonColor: string;
  directShareBackgroundColor: string;
  notificationTextColor: string;
  notificationBackgroundColor: string;
};

//친구탭
function FriendsScreen({
  selectedSlotId,
  preview,
  slotByRole,
  urls,
  profileUrls,
  onSelectSlot,
}: {
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
        style={{ backgroundColor: hexToRgba(preview.headerBackgroundColor, 0.72) }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectSlot?.(slotByRole.main_header_color?.id ?? slotByRole.main_header_foreground_color?.id ?? "");
        }}
      >
        <AvatarCircle src={urls.main_background} size="h-6 w-8" />
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

          <button
            type="button"
            className={`overflow-hidden rounded-[12px] px-5 py-6 text-left shadow-[0_18px_32px_rgba(15,23,42,0.08)] ${selectedSlotId === slotByRole.main_body_secondary_cell_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
            style={{ backgroundColor: preview.bodySecondaryColor }}
            onClick={(event) => {
              event.stopPropagation();
              if (slotByRole.main_body_secondary_cell_color) onSelectSlot?.(slotByRole.main_body_secondary_cell_color.id);
            }}
          >
            <span className="block text-[11px] font-semibold" style={{ color: preview.descriptionColor }}>
              추천 카드
            </span>
            <strong className="mt-2 block text-[15px] font-semibold" style={{ color: preview.titlePressedColor }}>
              새 메인 화면 요소를 바로 점검할 수 있습니다.
            </strong>
          </button>

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

          <div className="flex gap-3 px-1 overflow-hidden">
            {["샘플 A", "샘플 B", "샘플 C", "샘플 D", "더보기"].map((name, index) => (
              <div key={name} className="grid w-[62px] justify-items-center gap-2">
                <div className="relative">
                  <AvatarCircle src={profileUrls[index % profileUrls.length]} size="h-16 w-16" />
                  {index > 0 ? <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#ff7246]" /> : null}
                </div>
                <button
                  type="button"
                  className={`line-clamp-2 text-center text-[11px] font-medium leading-[1.15] ${selectedSlotId === slotByRole.main_description_color?.id ? "rounded-md bg-white/70 px-1 py-0.5 ring-1 ring-[#60a5fa]" : ""}`}
                  style={{ color: preview.descriptionColor }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_description_color) onSelectSlot?.(slotByRole.main_description_color.id);
                  }}
                >
                  {name}
                </button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 px-1">
            <SectionLabel
              label="생일인 친구 4"
              color={preview.sectionTitleColor}
              selected={selectedSlotId === slotByRole.main_section_title_color?.id}
              onClick={() => slotByRole.main_section_title_color && onSelectSlot?.(slotByRole.main_section_title_color.id)}
            />
            {friendRows.map((row) => (
              <button
                key={row.name}
                type="button"
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b pb-2 text-left ${selectedSlotId === slotByRole.main_body_cell_border_color?.id ? "rounded-lg ring-1 ring-[#60a5fa]" : ""}`}
                style={{ borderColor: preview.bodyCellBorderColor }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (slotByRole.main_body_cell_border_color) onSelectSlot?.(slotByRole.main_body_cell_border_color.id);
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
            ))}

            <button
              type="button"
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[16px] px-1 py-1 text-left ${selectedSlotId === slotByRole.main_body_cell_pressed_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
              style={{ backgroundColor: preview.bodyCellPressedColor }}
              onClick={(event) => {
                event.stopPropagation();
                if (slotByRole.main_body_cell_pressed_color) onSelectSlot?.(slotByRole.main_body_cell_pressed_color.id);
              }}
            >
              <span className="grid h-12 w-12 place-items-center rounded-[20px] bg-white/70 text-xl">★</span>
              <div>
                <strong className="block text-[14px] font-semibold leading-tight" style={{ color: preview.titleColor }}>
                  친구의 생일 일정을 확인해 보세요
                </strong>
              </div>
              <span className="text-[14px] font-semibold" style={{ color: preview.descriptionColor }}>
                19
              </span>
            </button>
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
  selectedSlotId,
  preview,
  slotByRole,
  urls,
  profileUrls,
  onSelectSlot,
}: {
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
        style={{ backgroundColor: preview.headerBackgroundColor }}
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
        <div className={`px-4 pt-2 ${selectedSlotId === slotByRole.main_header_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`} style={{ borderColor: hexToRgba(preview.bodyCellBorderColor, 0.28), backgroundColor: preview.headerBackgroundColor }} onClick={(event) => { event.stopPropagation(); if (slotByRole.main_header_color) onSelectSlot?.(slotByRole.main_header_color.id); }}>
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

        <div className="px-4">
          <button
            type="button"
            className={`w-full overflow-hidden rounded-[12px] px-5 py-4 text-left shadow-[0_18px_32px_rgba(15,23,42,0.08)] ${selectedSlotId === slotByRole.main_body_secondary_cell_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
            style={{ backgroundColor: preview.bodySecondaryColor }}
            onClick={(event) => {
              event.stopPropagation();
              if (slotByRole.main_body_secondary_cell_color) onSelectSlot?.(slotByRole.main_body_secondary_cell_color.id);
            }}
          >
            <strong className="mt-2 block text-[15px] font-semibold" style={{ color: preview.titlePressedColor }}>
              나만의 테마 만들기
            </strong>
          </button>
        </div>

        <div className="grid min-h-0 gap-0 px-4 overflow-hidden">
          {chatRows.map((row, index) => (
            <div
              key={`${row.name}-${index}`}
              role="button"
              tabIndex={0}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-1 py-2 text-left ${selectedSlotId === slotByRole.main_body_cell_border_color?.id ? "rounded-[18px] ring-1 ring-[#60a5fa]" : ""}`}
              style={{ backgroundColor: preview.bodyCellColor }}
              onClick={(event) => {
                event.stopPropagation();
                if (slotByRole.main_body_cell_border_color) onSelectSlot?.(slotByRole.main_body_cell_border_color.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                if (slotByRole.main_body_cell_border_color) onSelectSlot?.(slotByRole.main_body_cell_border_color.id);
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

function MoreScreen({ selectedSlotId, preview, slotByRole, urls, onSelectSlot }: { selectedSlotId?: string; preview: MainPreviewPalette; slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>; urls: RoleUrls; onSelectSlot?: (slotId: string) => void }) {
  return (
    <MainScreenFrame>
      <button type="button" className={`flex items-end justify-between px-5 pb-3 pt-4 text-left ${selectedSlotId === slotByRole.main_header_color?.id || selectedSlotId === slotByRole.main_header_foreground_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`} style={{ backgroundColor: preview.headerBackgroundColor, color: preview.headerForegroundColor }} onClick={(event) => { event.stopPropagation(); onSelectSlot?.(slotByRole.main_header_color?.id ?? slotByRole.main_header_foreground_color?.id ?? ""); }}>
        <strong className="text-xl font-semibold tracking-[-0.03em]">더보기</strong>
        <div className="flex items-center gap-4"><Search className="size-5" /><Settings className="size-5" /></div>
      </button>
      <div className="grid min-h-0 content-start gap-3 overflow-hidden px-4 py-3" style={{ backgroundColor: preview.bodySecondaryColor }}>
        <div className="flex gap-2 overflow-hidden rounded-xl p-2" style={{ backgroundColor: preview.headerBackgroundColor }}>
          <span className="rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ backgroundColor: preview.featureBrowseTabFocusedColor, color: preview.headerBackgroundColor }}>전체</span>
          <span className="rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ color: preview.featureBrowseTabColor }}>생활</span>
          <span className="rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ color: preview.featureBrowseTabColor }}>콘텐츠</span>
        </div>
        <button type="button" className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl p-3 text-left ${selectedSlotId === slotByRole.direct_share_background_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`} style={{ backgroundColor: preview.directShareBackgroundColor, color: preview.directShareTextColor }} onClick={(event) => { event.stopPropagation(); if (slotByRole.direct_share_background_color) onSelectSlot?.(slotByRole.direct_share_background_color.id); }}>
          <span className="grid size-9 place-items-center rounded-full bg-white/70"><Share2 className="size-4" /></span><span><strong className="block text-[13px]">바로 공유</strong><span className="mt-0.5 block text-[10px] opacity-75">자주 쓰는 대상을 빠르게 선택하세요</span></span><span className="rounded-full px-3 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: preview.directShareButtonColor }}>공유</span>
        </button>
        <button type="button" className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl p-3 text-left ${selectedSlotId === slotByRole.notification_background_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`} style={{ backgroundColor: preview.notificationBackgroundColor, color: preview.notificationTextColor }} onClick={(event) => { event.stopPropagation(); if (slotByRole.notification_background_color) onSelectSlot?.(slotByRole.notification_background_color.id); }}>
          <Bell className="size-5" /><span className="text-[12px] font-semibold">새로운 테마 소식이 있습니다.</span><ChevronRight className="size-4" />
        </button>
        <div className="grid grid-cols-2 gap-2">
          {["선물하기", "멜론", "쇼핑", "예약하기"].map((label, index) => <span key={label} className="relative rounded-xl bg-white/75 p-3 text-[12px] font-bold" style={{ color: preview.featurePrimaryColor }}>{label}{index < 2 ? <span className="absolute right-2 top-2 size-2 rounded-full" style={{ backgroundColor: index ? preview.badgeColor : preview.lightBadgeColor }} /> : null}</span>)}
        </div>
      </div>
      <MainBottomTabBar active="more" selectedSlotId={selectedSlotId} preview={preview} slotByRole={slotByRole} urls={urls} onSelectSlot={onSelectSlot} />
    </MainScreenFrame>
  );
}

function MainScreenFrame({ children }: { children: ReactNode }) {
  return <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_96px]">{children}</div>;
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
      className={`mx-auto aspect-[1080/2340] h-full w-full max-w-[310px] overflow-hidden rounded-[32px] border shadow-[0_22px_48px_rgba(15,23,42,0.16)] ${selected ? "border-[#60a5fa]" : "border-[#d7ddd8]"}`}
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
      className={`grid grid-cols-5 items-center px-4 ${selectedSlotId === slotByRole.tab_background?.id || selectedSlotId === slotByRole.tab_background_image?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
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
      className={`relative grid justify-items-center gap-1 rounded-[22px] px-1 py-1 ${selected ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        if (slot) onSelectSlot?.(slot.id);
      }}
    >
      <span className="relative grid h-10 w-10 place-items-center rounded-full">
        <span className="w-8 h-8 bg-center bg-no-repeat bg-contain" style={{ backgroundImage: `url(${active ? focusedUrl || defaultUrl || "" : defaultUrl || focusedUrl || ""})` }} />
      </span>
      <span className="text-[10px] font-semibold text-[#57737a]">{label}</span>
      {badge ? <span className="absolute left-1/2 top-0 rounded-full bg-[#ff6b37] px-2 py-[1px] text-[10px] font-bold text-white">{badge}</span> : null}
      {dot ? <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-[#ff6b37]" /> : null}
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
  const normalized = hex.replace("#", "");
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

function lighten(color: string, amount: number) {
  const normalized = color.trim().replace("#", "");
  const base = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized.slice(-6);
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(base.slice(offset, offset + 2), 16));
  const adjust = (channel: number) => Math.max(0, Math.min(255, Math.round(channel + 255 * amount)));
  return `#${[adjust(r), adjust(g), adjust(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
