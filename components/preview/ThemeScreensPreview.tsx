"use client";

import { Bell, Gift, MessageCirclePlus, Search, Settings, UserPlus } from "lucide-react";
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
  { name: "개발 노트", sub: "Android 프로젝트 ZIP 내보내기까지 연결되었습니다.", time: "어제" },
];

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
  section: Extract<ThemeSection, "main" | "tabs">;
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

  const preview = useMemo(() => {
    const getColor = (role: ThemeResourceRole, fallback: string) => getResolvedColor(slotByRole[role], colors, selections, templateId, template) ?? fallback;

    return {
      mainBackgroundColor: getColor("main_background_color", template.defaults.mainBackground),
      headerBackgroundColor: getColor("main_header_color", template.defaults.mainHeader),
      headerForegroundColor: getColor("main_header_foreground_color", template.defaults.mainTitle),
      titleColor: getColor("main_title_color", template.defaults.mainTitle),
      titlePressedColor: getColor("main_title_pressed_color", template.defaults.mainTitle),
      descriptionColor: getColor("main_description_color", template.defaults.mainBody),
      bodyColor: getColor("main_body_color", template.defaults.mainBody),
      bodyPressedColor: getColor("main_paragraph_pressed_color", template.defaults.mainBody),
      bodyCellPressedColor: getColor("main_body_cell_pressed_color", withAlpha(template.defaults.mainBackground, "99")),
      bodyCellBorderColor: getColor("main_body_cell_border_color", withAlpha(template.defaults.mainTitle, "33")),
      sectionTitleColor: getColor("main_section_title_color", template.defaults.mainTitle),
      featureBrowseTabColor: getColor("main_feature_browse_tab_color", template.defaults.tabBackground),
      bodySecondaryColor: getColor("main_body_secondary_cell_color", lighten(template.defaults.mainBackground, 0.06)),
      tabBackgroundColor: getColor("tab_background", template.defaults.tabBackground),
    };
  }, [colors, selections, slotByRole, templateId, template]);

  const mainBackgroundSlot = slotByRole.main_background;
  const mainBackgroundColorSlot = slotByRole.main_background_color;

  return (
    <PhoneFrame
      backgroundUrl={urls.main_background}
      fallbackBackground={preview.mainBackgroundColor}
      selected={selectedSlotId === mainBackgroundSlot?.id || selectedSlotId === mainBackgroundColorSlot?.id}
      onSelect={() => onSelectSlot?.(mainBackgroundSlot?.id ?? mainBackgroundColorSlot?.id ?? "")}
    >
      {section === "main" ? (
        <FriendsScreen
          selectedSlotId={selectedSlotId}
          preview={preview}
          slotByRole={slotByRole}
          urls={urls}
          onSelectSlot={onSelectSlot}
        />
      ) : (
        <ChatsScreen
          selectedSlotId={selectedSlotId}
          preview={preview}
          slotByRole={slotByRole}
          urls={urls}
          onSelectSlot={onSelectSlot}
        />
      )}
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
  bodyColor: string;
  bodyPressedColor: string;
  bodyCellPressedColor: string;
  bodyCellBorderColor: string;
  sectionTitleColor: string;
  featureBrowseTabColor: string;
  bodySecondaryColor: string;
  tabBackgroundColor: string;
};

function FriendsScreen({
  selectedSlotId,
  preview,
  slotByRole,
  urls,
  onSelectSlot,
}: {
  selectedSlotId?: string;
  preview: MainPreviewPalette;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_96px]">
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
        <strong className="block text-base font-semibold" style={{ color: preview.headerForegroundColor }}>
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
            <Chip active titleColor={preview.titleColor} backgroundColor={preview.mainBackgroundColor}>친구</Chip>
            <Chip titleColor={preview.titleColor} backgroundColor={preview.mainBackgroundColor}>추천</Chip>
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
                  <AvatarCircle src={urls.main_background} size="h-16 w-16" />
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
                <AvatarCircle src={urls.main_background} size="h-12 w-12" />
                <div>
                  <strong className="block text-[14px] font-semibold leading-none" style={{ color: preview.titleColor }}>
                    {row.name}
                  </strong>
                  <span className="mt-1 block text-[11px] font-medium leading-none" style={{ color: preview.descriptionColor }}>
                    {row.sub}
                  </span>
                </div>
                <span className="rounded-full border border-[#7aa8af]/35 bg-white/12 px-2 py-2 text-[10px] font-semibold" style={{ color: preview.bodyPressedColor }}>
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

      <BottomTabBar active="friends" selectedSlotId={selectedSlotId} slotByRole={slotByRole} urls={urls} tabBackground={preview.tabBackgroundColor} onSelectSlot={onSelectSlot} />
    </div>
  );
}

function ChatsScreen({
  selectedSlotId,
  preview,
  slotByRole,
  urls,
  onSelectSlot,
}: {
  selectedSlotId?: string;
  preview: MainPreviewPalette;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_96px]">
      <button
        type="button"
        className={`flex items-end justify-between px-4 pb-3 pt-4 text-left ${selectedSlotId === slotByRole.main_header_color?.id || selectedSlotId === slotByRole.main_header_foreground_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
        style={{ backgroundColor: preview.headerBackgroundColor }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectSlot?.(slotByRole.main_header_color?.id ?? slotByRole.main_header_foreground_color?.id ?? "");
        }}
      >
        <strong className="text-base font-semibold tracking-[-0.03em]" style={{ color: preview.headerForegroundColor }}>
          채팅
        </strong>
        <div className="flex items-center gap-4" style={{ color: preview.headerForegroundColor }}>
          <Search className="w-6 h-6" />
          <MessageCirclePlus className="w-6 h-6" />
          <Settings className="w-6 h-6" />
        </div>
      </button>

      <div className="grid content-start min-h-0 gap-4 pb-4 overflow-hidden">
        <div className="px-4 py-4 border-b" style={{ borderColor: hexToRgba(preview.bodyCellBorderColor, 0.4), backgroundColor: preview.featureBrowseTabColor, color: preview.headerForegroundColor }}>
          <div className="flex items-center gap-3 overflow-hidden">
            <FilterPill dark color={preview.headerForegroundColor}>전체</FilterPill>
            <FilterPill color={preview.headerForegroundColor}>
              <span className="text-xl">◎</span>
              <BadgeSmall value="12" />
            </FilterPill>
            <FilterPill wide color={preview.headerForegroundColor}>
              <span className="text-xl">✦</span>
              <strong className="text-[14px] font-semibold">ChatGPT</strong>
              <BadgeSmall value="N" />
            </FilterPill>
            <CircleAction color={preview.headerForegroundColor} icon={<Bell className="w-5 h-5" />} />
            <CircleAction color={preview.headerForegroundColor} icon={<Search className="w-5 h-5" />} />
          </div>
        </div>

        <div className="px-4">
          <button
            type="button"
            className={`w-full rounded-[28px] px-6 py-5 text-left shadow-[0_20px_36px_rgba(15,23,42,0.08)] ${selectedSlotId === slotByRole.main_body_secondary_cell_color?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
            style={{ backgroundColor: preview.bodySecondaryColor }}
            onClick={(event) => {
              event.stopPropagation();
              if (slotByRole.main_body_secondary_cell_color) onSelectSlot?.(slotByRole.main_body_secondary_cell_color.id);
            }}
          >
            <div className="grid grid-cols-[1fr_112px] items-center gap-4">
              <div>
                <span className="text-[11px] font-medium" style={{ color: preview.descriptionColor }}>
                  테스트 배너
                </span>
                <strong className="mt-1 block text-[15px] font-semibold" style={{ color: preview.titlePressedColor }}>
                  메인 화면 보조 카드 색상을 확인합니다.
                </strong>
                <span className="mt-1 block text-[11px] font-medium" style={{ color: preview.descriptionColor }}>
                  설명 텍스트와 눌림 상태 색상도 함께 점검할 수 있습니다.
                </span>
              </div>
              <div className="h-[84px] rounded-2xl bg-[linear-gradient(135deg,#e8f8ff,#fff1b6)]" />
            </div>
          </button>
        </div>

        <div className="grid min-h-0 gap-1 px-4 overflow-hidden">
          {chatRows.map((row, index) => (
            <button
              key={`${row.name}-${index}`}
              type="button"
              className={`grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-[20px] px-2 py-2 text-left ${selectedSlotId === slotByRole.main_body_cell_border_color?.id ? "ring-1 ring-[#60a5fa]" : ""}`}
              style={{ borderBottom: `1px solid ${preview.bodyCellBorderColor}` }}
              onClick={(event) => {
                event.stopPropagation();
                if (slotByRole.main_body_cell_border_color) onSelectSlot?.(slotByRole.main_body_cell_border_color.id);
              }}
            >
              <AvatarCircle src={urls.main_background} size={index === 0 ? "h-14 w-14" : "h-12 w-12"} />
              <div>
                <button
                  type="button"
                  className={`block text-left ${selectedSlotId === slotByRole.main_title_color?.id ? "rounded-md ring-1 ring-[#60a5fa]" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_title_color) onSelectSlot?.(slotByRole.main_title_color.id);
                  }}
                >
                  <strong className="text-[15px] font-semibold" style={{ color: preview.titleColor }}>
                    {row.name}
                  </strong>
                </button>
                <button
                  type="button"
                  className={`mt-1 block text-left ${selectedSlotId === slotByRole.main_description_color?.id ? "rounded-md ring-1 ring-[#60a5fa]" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_description_color) onSelectSlot?.(slotByRole.main_description_color.id);
                  }}
                >
                  <span className="line-clamp-2 text-[12px] font-medium leading-[1.35]" style={{ color: preview.descriptionColor }}>
                    {row.sub}
                  </span>
                </button>
              </div>
              <div className="grid gap-2 pt-1 justify-items-end">
                <span className="text-[11px] font-medium" style={{ color: preview.bodyColor }}>
                  {row.time}
                </span>
                {row.badge ? <UnreadBadge value={row.badge} /> : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      <BottomTabBar active="chats" selectedSlotId={selectedSlotId} slotByRole={slotByRole} urls={urls} tabBackground={preview.tabBackgroundColor} onSelectSlot={onSelectSlot} />
    </div>
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

function BottomTabBar({
  active,
  selectedSlotId,
  slotByRole,
  urls,
  tabBackground,
  onSelectSlot,
}: {
  active: "friends" | "chats" | "now" | "shopping" | "more";
  selectedSlotId?: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  tabBackground: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div
      className={`grid grid-cols-5 items-center px-4 py-3 ${selectedSlotId === slotByRole.tab_background?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      style={{ backgroundColor: hexToRgba(tabBackground, 0.96) }}
      onClick={(event) => {
        event.stopPropagation();
        if (slotByRole.tab_background) onSelectSlot?.(slotByRole.tab_background.id);
      }}
    >
      <TabAsset active={active === "friends"} label="친구" defaultUrl={urls.tab_icon_friends} focusedUrl={urls.tab_icon_friends_focused} slot={slotByRole.tab_icon_friends_focused ?? slotByRole.tab_icon_friends} selected={selectedSlotId === slotByRole.tab_icon_friends?.id || selectedSlotId === slotByRole.tab_icon_friends_focused?.id} badge="12" onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "chats"} label="채팅" defaultUrl={urls.tab_icon_chats} focusedUrl={urls.tab_icon_chats_focused} slot={slotByRole.tab_icon_chats_focused ?? slotByRole.tab_icon_chats} selected={selectedSlotId === slotByRole.tab_icon_chats?.id || selectedSlotId === slotByRole.tab_icon_chats_focused?.id} badge="8" onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "now"} label="Now" defaultUrl={urls.tab_icon_now} focusedUrl={urls.tab_icon_now_focused} slot={slotByRole.tab_icon_now_focused ?? slotByRole.tab_icon_now} selected={selectedSlotId === slotByRole.tab_icon_now?.id || selectedSlotId === slotByRole.tab_icon_now_focused?.id} onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "shopping"} label="쇼핑" defaultUrl={urls.tab_icon_shopping} focusedUrl={urls.tab_icon_shopping_focused} slot={slotByRole.tab_icon_shopping_focused ?? slotByRole.tab_icon_shopping} selected={selectedSlotId === slotByRole.tab_icon_shopping?.id || selectedSlotId === slotByRole.tab_icon_shopping_focused?.id} onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "more"} label="더보기" defaultUrl={urls.tab_icon_more} focusedUrl={urls.tab_icon_more_focused} slot={slotByRole.tab_icon_more_focused ?? slotByRole.tab_icon_more} selected={selectedSlotId === slotByRole.tab_icon_more?.id || selectedSlotId === slotByRole.tab_icon_more_focused?.id} dot onSelectSlot={onSelectSlot} />
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
      className={`relative grid justify-items-center gap-1 rounded-[22px] px-1 py-1.5 ${selected ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        if (slot) onSelectSlot?.(slot.id);
      }}
    >
      <span className="relative grid h-12 w-12 place-items-center rounded-full bg-[#aeccfb]/55">
        <span className="w-8 h-8 bg-center bg-no-repeat bg-contain" style={{ backgroundImage: `url(${active ? focusedUrl || defaultUrl || "" : defaultUrl || focusedUrl || ""})` }} />
      </span>
      <span className="text-[10px] font-semibold text-[#57737a]">{label}</span>
      {badge ? <span className="absolute left-1/2 top-0 rounded-full bg-[#ff6b37] px-2 py-[1px] text-[10px] font-bold text-white">{badge}</span> : null}
      {dot ? <span className="absolute right-5 top-1 h-2 w-2 rounded-full bg-[#ff6b37]" /> : null}
    </button>
  );
}

function AvatarCircle({ src, size }: { src?: string; size: string }) {
  return <span className={`${size} block rounded-full border border-white/70 bg-[#dceff2] bg-cover bg-center shadow-[0_8px_18px_rgba(15,23,42,0.08)]`} style={{ backgroundImage: src ? `url(${src})` : undefined }} />;
}

function Chip({ active, titleColor, backgroundColor, children }: { active?: boolean; titleColor?: string; backgroundColor?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-full px-6 text-[14px] font-semibold ${active ? "" : "border"
        }`}
      style={
        active
          ? {
            backgroundColor: titleColor ?? "#111111",
            color: backgroundColor ?? "#ffffff",
          }
          : {
            borderColor: titleColor ?? "#0d5b66",
            color: titleColor ?? "#0d5b66",
          }
      }
    >
      {children}
    </span>
  );
}

function FilterPill({ children, dark, wide, color }: { children: ReactNode; dark?: boolean; wide?: boolean; color?: string }) {
  return (
    <span
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-5 text-xs font-semibold ${wide ? "min-w-[128px] justify-center" : ""}`}
      style={dark ? { borderColor: "transparent", backgroundColor: hexToRgba(color ?? "#0d5b66", 0.95), color: "#ffffff" } : { borderColor: hexToRgba(color ?? "#0e8394", 0.28), backgroundColor: "rgba(255,255,255,0.08)", color: color ?? "#0d4f58" }}
    >
      {children}
    </span>
  );
}

function BadgeSmall({ value }: { value: string }) {
  return <span className="rounded-full bg-[#ff6b37] px-2 py-[3px] text-[11px] font-bold leading-none text-white">{value}</span>;
}

function CircleAction({ icon, color }: { icon: ReactNode; color?: string }) {
  return <span className="grid border rounded-full h-14 w-14 place-items-center bg-white/6" style={{ borderColor: hexToRgba(color ?? "#0e8394", 0.28), color: color ?? "#0d4f58" }}>{icon}</span>;
}

function UnreadBadge({ value }: { value: string }) {
  return <span className="rounded-full bg-[#ff6b37] px-2.5 py-1 text-[11px] font-bold text-white">{value}</span>;
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
