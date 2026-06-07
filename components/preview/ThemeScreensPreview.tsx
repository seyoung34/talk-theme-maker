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
  { name: "류영수", sub: "오늘", cta: "선물하기" },
  { name: "유예원", sub: "오늘", cta: "선물하기" },
  { name: "고동욱", sub: "어제", cta: "선물하기" },
  { name: "최범규", sub: "어제", cta: "선물하기" },
];

const chatRows = [
  { name: "조용한 채팅방", sub: "23개의 채팅방", time: "2025.07.22" },
  { name: "이세영", sub: "장바구니처럼 에셋, 요소들을 담아서 나만의 테마를 만들 수 있는 서비스", time: "어제" },
  { name: "최승범", sub: "빡세더라~", time: "00:20", badge: "3" },
  { name: "정이지", sub: "그럴지도", time: "어제" },
  { name: "19 이종혁", sub: "4,000원을 받았어요. *(안내) 받은 분은 매일 이자 혜택 및 송금 수수료 무료 업데이트 대상자예요.", time: "어제", badge: "1" },
  { name: "드스그 5", sub: "두현이있어서 한번자를", time: "어제", badge: "70" },
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
  section: Exclude<ThemeSection, "chatroom">;
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

  const mainBackground = slotByRole.main_background;
  const headerSlot = slotByRole.main_header_color;
  const titleSlot = slotByRole.main_title_color;
  const bodySlot = slotByRole.main_body_color;
  const tabBackgroundSlot = slotByRole.tab_background;

  const headerColor = getResolvedColor(headerSlot, colors, selections, templateId, template) ?? template.defaults.mainHeader;
  const titleColor = getResolvedColor(titleSlot, colors, selections, templateId, template) ?? template.defaults.mainTitle;
  const bodyColor = getResolvedColor(bodySlot, colors, selections, templateId, template) ?? template.defaults.mainBody;
  const tabBackground = getResolvedColor(tabBackgroundSlot, colors, selections, templateId, template) ?? template.defaults.tabBackground;

  return (
    <PhoneFrame
      backgroundUrl={urls.main_background}
      fallbackBackground={template.defaults.mainBackground}
      selected={selectedSlotId === mainBackground?.id}
      onSelect={() => mainBackground && onSelectSlot?.(mainBackground.id)}
    >
      {section === "main" ? (
        <FriendsScreen
          selectedSlotId={selectedSlotId}
          titleColor={titleColor}
          bodyColor={bodyColor}
          headerColor={headerColor}
          tabBackground={tabBackground}
          slotByRole={slotByRole}
          urls={urls}
          onSelectSlot={onSelectSlot}
        />
      ) : (
        <ChatsScreen
          selectedSlotId={selectedSlotId}
          titleColor={titleColor}
          bodyColor={bodyColor}
          headerColor={headerColor}
          tabBackground={tabBackground}
          slotByRole={slotByRole}
          urls={urls}
          onSelectSlot={onSelectSlot}
        />
      )}
    </PhoneFrame>
  );
}

function FriendsScreen({
  selectedSlotId,
  titleColor,
  bodyColor,
  headerColor,
  tabBackground,
  slotByRole,
  urls,
  onSelectSlot,
}: {
  selectedSlotId?: string;
  titleColor: string;
  bodyColor: string;
  headerColor: string;
  tabBackground: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_96px]">
      <button
        type="button"
        className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-6 pb-4 pt-8 text-left ${
          selectedSlotId === slotByRole.main_header_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""
        }`}
        style={{ backgroundColor: hexToRgba(headerColor, 0.58) }}
        onClick={(event) => {
          event.stopPropagation();
          if (slotByRole.main_header_color) onSelectSlot?.(slotByRole.main_header_color.id);
        }}
      >
        <AvatarCircle src={urls.main_background} size="h-14 w-14" />
        <div>
          <strong className="block text-[15px] font-semibold" style={{ color: titleColor }}>
            이세영
          </strong>
        </div>
        <div className="flex items-center gap-3 text-[#0b7285]">
          <Search className="h-5 w-5" />
          <UserPlus className="h-5 w-5" />
          <Gift className="h-5 w-5" />
          <Settings className="h-5 w-5" />
        </div>
      </button>
      <div className="overflow-hidden px-4 pb-3">
        <div className="grid h-full content-start gap-3 overflow-hidden px-0.5 pb-2">
          <div className="flex gap-2 px-1 pt-2">
            <Chip active>친구</Chip>
            <Chip>소식</Chip>
          </div>

          <div className="overflow-hidden rounded-[26px] bg-white/92 px-5 py-5 shadow-[0_18px_32px_rgba(15,23,42,0.08)]">
            <div className="grid grid-cols-[1fr_156px] items-center gap-4">
              <div>
                <strong className="block text-[15px] font-semibold text-[#31343b]">오늘의 카카오가 궁금하다면?</strong>
                <span className="mt-1 block text-[12px] font-medium text-[#7b818b]">카카오소식 보러가기</span>
              </div>
              <div className="flex items-center justify-end gap-3 text-[#0d7786]">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#e9f7f7] text-xl">🟢</span>
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fff5d8] text-xl">📣</span>
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#eef2ff] text-xl">📅</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`px-1 text-left ${selectedSlotId === slotByRole.main_title_color?.id ? "rounded-lg ring-2 ring-[#60a5fa]" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              if (slotByRole.main_title_color) onSelectSlot?.(slotByRole.main_title_color.id);
            }}
          >
            <span className="text-[14px] font-semibold" style={{ color: titleColor }}>
              업데이트 프로필 12
            </span>
          </button>

          <div className="flex gap-3 overflow-hidden px-1">
            {["내 프로필", "조유민", "이승원", "1/12 준한...", "23 김수빈", "줄"].map((name, index) => (
              <div key={name} className="grid w-[62px] justify-items-center gap-2">
                <div className="relative">
                  <AvatarCircle src={urls.main_background} size="h-16 w-16" />
                  {index > 0 ? <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#ff7246]" /> : null}
                </div>
                <span
                  className={`line-clamp-2 text-center text-[11px] font-medium leading-[1.15] ${selectedSlotId === slotByRole.main_body_color?.id ? "rounded-md bg-white/70 px-1 py-0.5 ring-1 ring-[#60a5fa]" : ""}`}
                  style={{ color: bodyColor }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_body_color) onSelectSlot?.(slotByRole.main_body_color.id);
                  }}
                >
                  {name}
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-3 px-1">
            <SectionLabel
              label="생일인 친구 4"
              selected={selectedSlotId === slotByRole.main_title_color?.id}
              onClick={() => slotByRole.main_title_color && onSelectSlot?.(slotByRole.main_title_color.id)}
              color={titleColor}
            />
            {friendRows.map((row) => (
              <div key={row.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/20 pb-2">
                <AvatarCircle src={urls.main_background} size="h-12 w-12" />
                <div>
                  <strong className="block text-[14px] font-semibold leading-none" style={{ color: titleColor }}>
                    {row.name}
                  </strong>
                  <span className="mt-1 block text-[11px] font-medium leading-none" style={{ color: bodyColor }}>
                    {row.sub}
                  </span>
                </div>
                <button type="button" className="rounded-full border border-[#7aa8af]/35 bg-white/12 px-4 py-2 text-[12px] font-semibold text-[#25636c]">
                  {row.cta}
                </button>
              </div>
            ))}
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-[20px] bg-white/70 text-xl">🥳</span>
              <div>
                <strong className="block text-[14px] font-semibold leading-tight" style={{ color: titleColor }}>
                  친구의 생일을 확인해 보세요.
                </strong>
              </div>
              <span className="text-[14px] font-semibold" style={{ color: bodyColor }}>
                19
              </span>
            </div>
          </div>
        </div>
      </div>
      <BottomTabBar active="friends" selectedSlotId={selectedSlotId} slotByRole={slotByRole} urls={urls} tabBackground={tabBackground} onSelectSlot={onSelectSlot} />
    </div>
  );
}

function ChatsScreen({
  selectedSlotId,
  titleColor,
  bodyColor,
  headerColor,
  tabBackground,
  slotByRole,
  urls,
  onSelectSlot,
}: {
  selectedSlotId?: string;
  titleColor: string;
  bodyColor: string;
  headerColor: string;
  tabBackground: string;
  slotByRole: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
  urls: RoleUrls;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_96px]">
      <button
        type="button"
        className={`flex items-end justify-between px-6 pb-5 pt-8 text-left ${selectedSlotId === slotByRole.main_header_color?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
        style={{ backgroundColor: hexToRgba(headerColor, 0.72) }}
        onClick={(event) => {
          event.stopPropagation();
          if (slotByRole.main_header_color) onSelectSlot?.(slotByRole.main_header_color.id);
        }}
      >
        <strong className="text-[28px] font-semibold tracking-[-0.03em]" style={{ color: titleColor }}>
          채팅
        </strong>
        <div className="flex items-center gap-4 text-[#0b7285]">
          <Search className="h-6 w-6" />
          <MessageCirclePlus className="h-6 w-6" />
          <Settings className="h-6 w-6" />
        </div>
      </button>
      <div className="grid min-h-0 content-start gap-4 overflow-hidden pb-4">
        <div className="border-b border-[#5ab0bc]/18 bg-[#18b7d0] px-4 py-4 text-[#104950]">
          <div className="flex items-center gap-3 overflow-hidden">
            <FilterPill dark>전체</FilterPill>
            <FilterPill>
              <span className="text-xl">💬</span>
              <BadgeSmall value="415" />
            </FilterPill>
            <FilterPill wide>
              <span className="text-xl">🌍</span>
              <strong className="text-[14px] font-semibold">ChatGPT</strong>
              <BadgeSmall value="N" />
            </FilterPill>
            <CircleAction icon={<Bell className="h-5 w-5" />} />
            <CircleAction icon={<Search className="h-5 w-5" />} />
          </div>
        </div>
        <div className="px-4">
          <div className="rounded-[28px] bg-white/92 px-6 py-5 shadow-[0_20px_36px_rgba(15,23,42,0.08)]">
            <div className="grid grid-cols-[1fr_112px] items-center gap-4">
              <div>
                <span className="text-[11px] font-medium text-[#8d939a]">드래곤빌리지3 앱다운로드</span>
                <strong className="mt-1 block text-[15px] font-semibold text-[#2d3137]">전 세계 동시 출시!</strong>
                <span className="mt-1 block text-[11px] font-medium text-[#9ba1a8]">AD Moloco 광고 · 확률형 아이템 포함</span>
              </div>
              <div className="h-[84px] rounded-2xl bg-[linear-gradient(135deg,#e8f8ff,#fff1b6)]" />
            </div>
          </div>
        </div>
        <div className="grid min-h-0 gap-1 overflow-hidden px-4">
          {chatRows.map((row, index) => (
            <div key={`${row.name}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-[20px] px-2 py-2">
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
                  <strong className="text-[15px] font-semibold" style={{ color: titleColor }}>
                    {row.name}
                  </strong>
                </button>
                <button
                  type="button"
                  className={`mt-1 block text-left ${selectedSlotId === slotByRole.main_body_color?.id ? "rounded-md ring-1 ring-[#60a5fa]" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (slotByRole.main_body_color) onSelectSlot?.(slotByRole.main_body_color.id);
                  }}
                >
                  <span className="line-clamp-2 text-[12px] font-medium leading-[1.35]" style={{ color: bodyColor }}>
                    {row.sub}
                  </span>
                </button>
              </div>
              <div className="grid justify-items-end gap-2 pt-1">
                <span className="text-[11px] font-medium" style={{ color: bodyColor }}>
                  {row.time}
                </span>
                {row.badge ? <UnreadBadge value={row.badge} /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomTabBar active="chats" selectedSlotId={selectedSlotId} slotByRole={slotByRole} urls={urls} tabBackground={tabBackground} onSelectSlot={onSelectSlot} />
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
      className={`mx-auto aspect-[9/16] h-full w-full max-w-[360px] overflow-hidden rounded-[36px] border bg-[#f8fdff] shadow-[0_28px_60px_rgba(15,23,42,0.18)] ${selected ? "border-[#60a5fa]" : "border-[#d7ddd8]"}`}
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
      <TabAsset active={active === "friends"} label="친구" defaultUrl={urls.tab_icon_friends} focusedUrl={urls.tab_icon_friends_focused} slot={slotByRole.tab_icon_friends_focused ?? slotByRole.tab_icon_friends} selected={selectedSlotId === slotByRole.tab_icon_friends?.id || selectedSlotId === slotByRole.tab_icon_friends_focused?.id} badge="415" onSelectSlot={onSelectSlot} />
      <TabAsset active={active === "chats"} label="채팅" defaultUrl={urls.tab_icon_chats} focusedUrl={urls.tab_icon_chats_focused} slot={slotByRole.tab_icon_chats_focused ?? slotByRole.tab_icon_chats} selected={selectedSlotId === slotByRole.tab_icon_chats?.id || selectedSlotId === slotByRole.tab_icon_chats_focused?.id} badge="615" onSelectSlot={onSelectSlot} />
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
        <span className="h-8 w-8 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${active ? focusedUrl || defaultUrl || "" : defaultUrl || focusedUrl || ""})` }} />
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

function Chip({ active, children }: { active?: boolean; children: ReactNode }) {
  return <span className={`inline-flex h-10 items-center rounded-full px-6 text-[14px] font-semibold ${active ? "bg-[#0d5b66] text-white" : "border border-[#70aab3]/35 bg-white/14 text-[#0d5b66]"}`}>{children}</span>;
}

function FilterPill({ children, dark, wide }: { children: ReactNode; dark?: boolean; wide?: boolean }) {
  return <span className={`inline-flex h-14 items-center gap-2 rounded-full border border-[#0e8394]/28 px-5 text-[15px] font-semibold ${dark ? "bg-[#0d5b66] text-white" : "bg-white/6 text-[#0d4f58]"} ${wide ? "min-w-[128px] justify-center" : ""}`}>{children}</span>;
}

function BadgeSmall({ value }: { value: string }) {
  return <span className="rounded-full bg-[#ff6b37] px-2 py-[3px] text-[11px] font-bold leading-none text-white">{value}</span>;
}

function CircleAction({ icon }: { icon: ReactNode }) {
  return <span className="grid h-14 w-14 place-items-center rounded-full border border-[#0e8394]/28 bg-white/6">{icon}</span>;
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
  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
