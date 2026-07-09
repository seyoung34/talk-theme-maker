"use client";

import { ArrowLeft, SendHorizontal, Menu, Phone, Plus, Search, Smile } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getResolvedColor, type BubbleEditState, type SlotCandidateSelections } from "@/components/project/projectModel";
import { dataUrlForThemeFile, findBestFile } from "@/components/preview/previewResourceUtils";
import { loadNinePatchDataUrl, mapContentRect, renderNinePatch } from "@/lib/theme/android/ninepatch";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleAsset, BubbleSlot, Insets, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";
import { themeColorToCss } from "@/lib/theme/color";

type Hotspot = {
  slotId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const previewCanvasWidth = 1080;
const previewCanvasHeight = 2123;
const minScrollCanvasHeight = 3180;
const inputBarHeightRatio = 86 / 1600;
const inputBarHeight = Math.round(previewCanvasHeight * inputBarHeightRatio);

const canvasTopInset = 132;
const canvasBottomInset = inputBarHeight + 44;

const bubbleLeftInset = 44;
const bubbleRightInset = 44;
const bubbleTextFontSize = 36;
const bubbleTextLineHeight = 48;

const defaultInsets: Record<BubbleSlot, Insets> = {
  me: { top: 14, right: 40, bottom: 59, left: 59 },
  you: { top: 17, right: 58, bottom: 60, left: 38 },
};

const defaultStretch: Record<BubbleSlot, StretchPoint> = {
  me: { x: 145, y: 65 },
  you: { x: 224, y: 59 },
};

const sampleMessages = [
  { role: "bubble_you_1" as ThemeResourceRole, slot: "you" as BubbleSlot, mine: false, author: "수아", text: "오늘 날씨 완전 좋다! 산책하기 딱이야 ☺️" },
  { role: "bubble_me_1" as ThemeResourceRole, slot: "me" as BubbleSlot, mine: true, author: "나", text: "그러니까! 나도 지금 잠깐 밖에 나와있어 ㅎㅎ" },
  { role: "bubble_you_2" as ThemeResourceRole, slot: "you" as BubbleSlot, mine: false, author: "수아", text: "오 어디야? 나도 갈까?" },
  { role: "bubble_me_2" as ThemeResourceRole, slot: "me" as BubbleSlot, mine: true, author: "나", text: "공원 앞에 새로 생긴 카페! 커피가 진짜 맛있어" },

  { role: "bubble_you_1" as ThemeResourceRole, slot: "you" as BubbleSlot, mine: false, author: "수아", text: "완전 좋다... 나도 이따 합류해도 돼?" },
  { role: "bubble_you_2" as ThemeResourceRole, slot: "you" as BubbleSlot, mine: false, author: "수아", text: "저녁엔 뭐 먹을지 정했어?" },
  { role: "bubble_me_1" as ThemeResourceRole, slot: "me" as BubbleSlot, mine: true, author: "나", text: "당연하지! 자리 맡아둘게" },
  { role: "bubble_me_2" as ThemeResourceRole, slot: "me" as BubbleSlot, mine: true, author: "나", text: "아직 못 정했는데, 오랜만에 떡볶이 어때? 저번에 갔던 그 집" },
  { role: "bubble_you_1" as ThemeResourceRole, slot: "you" as BubbleSlot, mine: false, author: "수아", text: "완전 좋아! 그럼 6시에 거기서 보자" },
  { role: "bubble_me_1" as ThemeResourceRole, slot: "me" as BubbleSlot, mine: true, author: "나", text: "콜! 이따 봐 ㅎㅎ" },
];

export function ChatroomPreview({
  analysis,
  platform,
  slots,
  colors,
  selections,
  template,
  templateId,
  bubbleEdits,
  selectedSlotId,
  onSelectSlot,
}: {
  analysis: ThemeProjectAnalysis;
  platform: ThemePlatform;
  slots: ThemeAssetSlot[];
  colors: Record<string, string | undefined>;
  selections: SlotCandidateSelections;
  template: ThemeTemplate;
  templateId: ThemeTemplateId;
  bubbleEdits: Partial<Record<ThemeResourceRole, BubbleEditState>>;
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  const slotByRole = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>,
    [slots],
  );
  const selectedFiles = useMemo(() => selectPreviewFiles(analysis), [analysis]);
  const backgroundFile = selectedFiles.chat_background;
  const backgroundFileSignature = useMemo(() => fileSignature(selectedFiles.chat_background), [selectedFiles]);
  const bubbleFilesSignature = useMemo(
    () => (["bubble_me_1", "bubble_me_2", "bubble_you_1", "bubble_you_2"] as const).map((role) => fileSignature(selectedFiles[role])).join("|"),
    [selectedFiles],
  );
  const expectedBubbleAssetSlotIds = useMemo(
    () =>
      (["bubble_me_1", "bubble_me_2", "bubble_you_1", "bubble_you_2"] as const)
        .map((role) => (selectedFiles[role] ? slotByRole[role]?.id : undefined))
        .filter((slotId): slotId is string => Boolean(slotId)),
    [selectedFiles, slotByRole],
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [bubbleAssets, setBubbleAssets] = useState<Record<string, BubbleAsset | undefined>>({});
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [contentCanvasHeight, setContentCanvasHeight] = useState(minScrollCanvasHeight);
  const [headerForeground, setHeaderForeground] = useState("#ffffff");

  const previewColor = (role: ThemeResourceRole, fallback: string) => themeColorToCss(getResolvedColor(slotByRole[role], colors, selections, templateId, template) ?? fallback);
  const isIos = platform === "ios";
  const inputBackground = previewColor("chat_input_background_color", template.defaults.chatInputBackground);
  const sendButtonColor = previewColor("chat_send_button_color", template.defaults.chatSendButton);
  const chatBackgroundColor = previewColor("chat_background_color", template.defaults.chatBackground);
  const myBubbleTextColor = previewColor("chat_bubble_me_color", template.defaults.mainTitle);
  const friendBubbleTextColor = previewColor("chat_bubble_you_color", template.defaults.mainTitle);
  const unreadCountColor = previewColor("chat_unread_count_color", template.accent);
  const sendIconColor = previewColor("chat_send_icon_color", template.defaults.mainTitle);
  // 입력바 텍스트/메뉴 색상은 android와 iOS가 서로 다른 role을 사용한다. (배경/보내기 계열은 공통 role)
  const inputTextColor = isIos
    ? previewColor("chat_button_text_color", template.defaults.mainTitle)
    : previewColor("chat_input_text_color", template.defaults.mainTitle);
  const menuIconColor = isIos
    ? previewColor("chat_button_foreground_color", template.defaults.mainBody)
    : previewColor("chat_menu_icon_color", template.defaults.mainBody);
  const menuButtonColor = isIos
    ? previewColor("chat_button_background_color", "#0FFFFFFF")
    : previewColor("chat_menu_button_color", "#14000000");

  useLayoutEffect(() => {
    if (!backgroundFile) {
      setBackgroundImage(null);
      setBackgroundImageUrl(null);
      return;
    }

    if (backgroundFile.file) {
      const objectUrl = URL.createObjectURL(backgroundFile.file);
      setBackgroundImage(null);
      setBackgroundImageUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    setBackgroundImage(null);
    setBackgroundImageUrl(backgroundFile.sourceUrl ?? null);
  }, [backgroundFileSignature]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!backgroundImageUrl) return;
      const nextBackgroundImage = await loadImage(backgroundImageUrl);
      if (!cancelled) setBackgroundImage(nextBackgroundImage);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [backgroundImageUrl]);

  useEffect(() => {
    let cancelled = false;

    const resolveHeaderColor = async () => {
      const nextColor = backgroundImage ? getContrastingHeaderColor(backgroundImage) : getReadableTextColor(chatBackgroundColor);
      if (!cancelled) setHeaderForeground(nextColor);
    };

    void resolveHeaderColor();
    return () => {
      cancelled = true;
    };
  }, [backgroundImage, chatBackgroundColor]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const nextAssets: Record<string, BubbleAsset | undefined> = {};
      for (const role of ["bubble_me_1", "bubble_me_2", "bubble_you_1", "bubble_you_2"] as const) {
        const file = selectedFiles[role];
        const slot = slotByRole[role];
        if (!file || !slot) continue;
        const dataUrl = await dataUrlForThemeFile(file);
        const bubbleSlot = role.includes("_me_") ? "me" : "you";
        const asset = await loadNinePatchDataUrl(dataUrl, file.name, bubbleSlot);
        const edits = bubbleEdits[role];
        nextAssets[slot.id] = edits?.markers ? { ...asset, markers: edits.markers } : asset;
      }

      if (!cancelled) setBubbleAssets(nextAssets);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bubbleEdits, bubbleFilesSignature, slotByRole.bubble_me_1?.id, slotByRole.bubble_me_2?.id, slotByRole.bubble_you_1?.id, slotByRole.bubble_you_2?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (expectedBubbleAssetSlotIds.some((slotId) => !bubbleAssets[slotId])) return;

    drawChatPreview(ctx, {
      defaults: analysis.previewDefaults,
      platform,
      slots: slotByRole,
      selectedSlotId,
      bubbleAssets,
      bubbleEdits,
      myBubbleTextColor,
      friendBubbleTextColor,
      unreadCountColor,
      authorColor: headerForeground,
      canvasHeight: contentCanvasHeight,
      onHotspotsChange: setHotspots,
      onCanvasHeightChange: setContentCanvasHeight,
    });
  }, [analysis.previewDefaults, bubbleAssets, bubbleEdits, contentCanvasHeight, expectedBubbleAssetSlotIds, friendBubbleTextColor, headerForeground, myBubbleTextColor, platform, selectedSlotId, slotByRole, unreadCountColor]);

  const backgroundSlot = slotByRole.chat_background;
  const inputSlot = slotByRole.chat_input_background_color;
  const sendSlot = slotByRole.chat_send_button_color;
  const inputTextSlot = isIos ? slotByRole.chat_button_text_color : slotByRole.chat_input_text_color;
  const sendIconSlot = slotByRole.chat_send_icon_color;
  const menuIconSlot = isIos ? slotByRole.chat_button_foreground_color : slotByRole.chat_menu_icon_color;
  const menuButtonSlot = isIos ? slotByRole.chat_button_background_color : slotByRole.chat_menu_button_color;

  return (
    <div className="relative aspect-1080/2123 h-full w-full max-w-[310px] overflow-hidden rounded-xl border border-transparent bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
      {backgroundSlot ? (
        <button
          type="button"
          className={`absolute inset-0 z-0 ${selectedSlotId === backgroundSlot.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
          aria-label="채팅방 배경 선택"
          onClick={() => onSelectSlot?.(backgroundSlot.id)}
        />
      ) : null}

      <div
        className="absolute inset-0 z-[1]"
        style={{
          backgroundColor: chatBackgroundColor || template.defaults.chatBackground,
          backgroundImage: backgroundImageUrl ? `url("${backgroundImageUrl}")` : undefined,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      />

      <div
        className="absolute inset-x-0 z-10 overflow-x-hidden overflow-y-auto chatroom-scroll"
        style={{
          top: `${(canvasTopInset / previewCanvasHeight) * 100}%`,
          bottom: `${(canvasBottomInset / previewCanvasHeight) * 100}%`,
        }}
      >
        <div className="relative w-full" style={{ aspectRatio: `${previewCanvasWidth} / ${contentCanvasHeight}` }}>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" width={previewCanvasWidth} height={contentCanvasHeight} />
          {hotspots.map((hotspot, index) => (
            <button
              key={`${hotspot.slotId}-${index}-${hotspot.y}`}
              type="button"
              className="absolute z-20 bg-transparent"
              style={{
                left: `${(hotspot.x / previewCanvasWidth) * 100}%`,
                top: `${(hotspot.y / contentCanvasHeight) * 100}%`,
                width: `${(hotspot.width / previewCanvasWidth) * 100}%`,
                height: `${(hotspot.height / contentCanvasHeight) * 100}%`,
              }}
              aria-label={hotspot.slotId}
              onClick={() => onSelectSlot?.(hotspot.slotId)}
            />
          ))}
        </div>
      </div>

      {/* 헤더 */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 pt-4 pb-4" style={{ color: headerForeground }}>
        <div className="flex items-center gap-4">
          <ArrowLeft className="h-7 w-7" strokeWidth={2.2} />
          <strong className="text-[18px] font-semibold tracking-[-0.02em]">채팅방</strong>
        </div>
        <div className="flex items-center gap-5">
          <Search className="w-6 h-6" strokeWidth={2.1} />
          <Phone className="w-6 h-6" strokeWidth={2.1} />
          <Menu className="w-6 h-6" strokeWidth={2.1} />
        </div>
      </div>

      <ChatroomInputBarV2
        inputBackground={inputBackground}
        sendButtonColor={sendButtonColor}
        inputTextColor={inputTextColor}
        sendIconColor={sendIconColor}
        menuIconColor={menuIconColor}
        menuButtonColor={menuButtonColor}
        inputSlot={inputSlot}
        sendSlot={sendSlot}
        inputTextSlot={inputTextSlot}
        sendIconSlot={sendIconSlot}
        menuIconSlot={menuIconSlot}
        menuButtonSlot={menuButtonSlot}
        selectedSlotId={selectedSlotId}
        onSelectSlot={onSelectSlot}
      />

      <style jsx>{`
        .chatroom-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(15, 23, 42, 0.26) transparent;
        }

        .chatroom-scroll::-webkit-scrollbar {
          width: 4px;
        }

        .chatroom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .chatroom-scroll::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.26);
        }
      `}</style>
    </div>
  );
}

function ChatroomInputBarV2({
  inputBackground,
  sendButtonColor,
  inputTextColor,
  sendIconColor,
  menuIconColor,
  menuButtonColor,
  inputSlot,
  sendSlot,
  inputTextSlot,
  sendIconSlot,
  menuIconSlot,
  menuButtonSlot,
  selectedSlotId,
  onSelectSlot,
}: {
  inputBackground: string;
  sendButtonColor: string;
  inputTextColor: string;
  sendIconColor: string;
  menuIconColor: string;
  menuButtonColor: string;
  inputSlot?: ThemeAssetSlot;
  sendSlot?: ThemeAssetSlot;
  inputTextSlot?: ThemeAssetSlot;
  sendIconSlot?: ThemeAssetSlot;
  menuIconSlot?: ThemeAssetSlot;
  menuButtonSlot?: ThemeAssetSlot;
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 border-t border-white/25 ${selectedSlotId === inputSlot?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      style={{
        height: `${inputBarHeightRatio * 100}%`,
        backgroundColor: hexToRgba(inputBackground, 0.96),
      }}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="입력바 선택"
        onClick={() => {
          if (inputSlot) onSelectSlot?.(inputSlot.id);
        }}
      />

      <div className="relative flex h-full items-center gap-[clamp(0.45rem,2.8%,0.75rem)] px-[clamp(0.65rem,4%,1rem)] py-[clamp(0.35rem,2.2%,0.65rem)] [container-type:inline-size]">
        <button type="button" className={`grid aspect-square h-[clamp(2rem,70%,2.65rem)] shrink-0 place-items-center rounded-full ${selectedSlotId === menuIconSlot?.id || selectedSlotId === menuButtonSlot?.id ? "ring-2 ring-[#60a5fa]" : ""}`} style={{ backgroundColor: menuButtonColor, color: menuIconColor }} onClick={(event) => { event.stopPropagation(); onSelectSlot?.(menuIconSlot?.id ?? menuButtonSlot?.id ?? ""); }}>
          <Plus className="h-[58%] w-[58%]" strokeWidth={2.4} />
        </button>

        {/* 입력 필드 배경은 메뉴 버튼 배경과 동일한 키를 공유한다(입력창 배경 컬러, 투명도 조절 가능). */}
        <div className="flex h-[clamp(2rem,72%,2.8rem)] min-w-0 flex-1 items-center gap-[clamp(0.35rem,2.4%,0.6rem)] rounded-full pl-[clamp(0.85rem,5%,1.35rem)] pr-[clamp(0.35rem,2%,0.5rem)]" style={{ backgroundColor: menuButtonColor }}>
          <button
            type="button"
            className={`min-w-0 flex-1 truncate text-left text-[clamp(0.98rem,4.2cqw,1.55rem)] font-medium ${selectedSlotId === inputTextSlot?.id ? "rounded-full ring-2 ring-[#60a5fa]" : ""}`}
            style={{ color: inputTextColor }}
            onClick={(event) => {
              event.stopPropagation();
              if (inputTextSlot) onSelectSlot?.(inputTextSlot.id);
            }}
          >
            사용자 입력
          </button>
          <span className="grid aspect-square h-[82%] shrink-0 place-items-center rounded-full bg-[#D8D8D8] text-[#191919]">
            <Smile className="h-[58%] w-[58%]" strokeWidth={2.2} />
          </span>
        </div>

        <button
          type="button"
          className={`grid aspect-square h-[clamp(2rem,70%,2.65rem)] shrink-0 place-items-center rounded-full ${selectedSlotId === sendSlot?.id || selectedSlotId === sendIconSlot?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
          style={{ backgroundColor: sendButtonColor }}
          onClick={(event) => {
            event.stopPropagation();
            if (sendSlot) onSelectSlot?.(sendSlot.id);
          }}
        >
          <SendHorizontal
            className="h-[58%] w-[58%]"
            strokeWidth={3}
            style={{ color: sendIconColor }}
            onClick={(event) => {
              event.stopPropagation();
              if (sendIconSlot) onSelectSlot?.(sendIconSlot.id);
            }}
          />
        </button>
      </div>
    </div>
  );
}

function ChatroomInputBar({
  inputBackground,
  sendButtonColor,
  inputTextColor,
  sendIconColor,
  inputSlot,
  sendSlot,
  inputTextSlot,
  sendIconSlot,
  selectedSlotId,
  onSelectSlot,
}: {
  inputBackground: string;
  sendButtonColor: string;
  inputTextColor: string;
  sendIconColor: string;
  inputSlot?: ThemeAssetSlot;
  sendSlot?: ThemeAssetSlot;
  inputTextSlot?: ThemeAssetSlot;
  sendIconSlot?: ThemeAssetSlot;
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 border-t border-white/25 ${selectedSlotId === inputSlot?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
      style={{
        height: `${inputBarHeightRatio * 100}%`,
        backgroundColor: hexToRgba(inputBackground, 0.96),
      }}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="입력바 선택"
        onClick={() => {
          if (inputSlot) onSelectSlot?.(inputSlot.id);
        }}
      />

      <div className="relative flex h-full items-center gap-[clamp(0.45rem,2.8%,0.75rem)] px-[clamp(0.65rem,4%,1rem)] py-[clamp(0.35rem,2.2%,0.65rem)] [container-type:inline-size]">
        <span className="grid aspect-square h-[clamp(2rem,70%,2.65rem)] shrink-0 place-items-center rounded-full bg-[#edf6f8] text-[#078aa3]">
          <Plus className="h-[58%] w-[58%]" strokeWidth={2.4} />
        </span>

        <div className="flex h-[clamp(2rem,72%,2.8rem)] min-w-0 flex-1 items-center gap-[clamp(0.35rem,2.4%,0.6rem)] rounded-full bg-[#edf6f8] pl-[clamp(0.85rem,5%,1.35rem)] pr-[clamp(0.35rem,2%,0.5rem)]">
          <span className="min-w-0 flex-1 truncate text-[clamp(0.98rem,4.2cqw,1.55rem)] font-medium text-[#a8c1c8] ">메시지 입력</span>
          <span className="grid aspect-square h-[82%] shrink-0 place-items-center rounded-full bg-[#dbecef] text-[#386f79]">
            <Smile className="h-[58%] w-[58%]" strokeWidth={2.2} />
          </span>
        </div>

        <button
          type="button"
          className={`grid aspect-square h-[clamp(2rem,70%,2.65rem)] shrink-0 place-items-center rounded-full text-[#078aa3] ${selectedSlotId === sendSlot?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
          style={{ backgroundColor: sendButtonColor }}
          onClick={(event) => {
            event.stopPropagation();
            if (sendSlot) onSelectSlot?.(sendSlot.id);
          }}
        >
          <SendHorizontal className="h-[58%] w-[58%]" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

function drawChatPreview(
  ctx: CanvasRenderingContext2D,
  options: {
    defaults?: ThemeProjectAnalysis["previewDefaults"];
    platform: ThemePlatform;
    slots: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
    selectedSlotId?: string;
    bubbleAssets: Record<string, BubbleAsset | undefined>;
    bubbleEdits: Partial<Record<ThemeResourceRole, BubbleEditState>>;
    myBubbleTextColor: string;
    friendBubbleTextColor: string;
    unreadCountColor: string;
    authorColor: string;
    canvasHeight: number;
    onHotspotsChange: (hotspots: Hotspot[]) => void;
    onCanvasHeightChange: (height: number) => void;
  },
) {
  const { defaults, platform, slots, selectedSlotId, bubbleAssets, bubbleEdits, myBubbleTextColor, friendBubbleTextColor, unreadCountColor, authorColor, canvasHeight, onHotspotsChange, onCanvasHeightChange } = options;

  ctx.clearRect(0, 0, previewCanvasWidth, canvasHeight);

  const hotspots: Hotspot[] = [];
  let y = 62;

  drawTimelineStamp(ctx, y - 24, "19:47");

  for (const message of sampleMessages) {
    const slot = slots[message.role];
    const edit = bubbleEdits[message.role];
    const asset = slot ? bubbleAssets[slot.id] ?? null : null;
    const size = getAutoBubbleSize(ctx, asset, platform, edit, message.text);
    const x = message.mine ? previewCanvasWidth - bubbleRightInset - size.width : bubbleLeftInset + 94;
    const avatarX = bubbleLeftInset;

    if (!message.mine) {
      drawAvatar(ctx, avatarX, y + 12, 74);
      ctx.fillStyle = authorColor;
      ctx.font = "32px Segoe UI, Noto Sans KR, sans-serif";
      ctx.fillText(message.author, x, y - 16);
    }

    drawBubble(ctx, {
      asset,
      edit,
      platform,
      x,
      y,
      width: size.width,
      height: size.height,
      text: message.text,
      fill: message.mine ? (defaults?.myBubble ?? "#facc15") : (defaults?.friendBubble ?? "#ffffff"),
      textColor: message.mine ? myBubbleTextColor : friendBubbleTextColor,
      selected: selectedSlotId === slot?.id,
    });

    if (slot) hotspots.push({ slotId: slot.id, x, y, width: size.width, height: size.height });

    const unreadCount = message.mine ? 0 : message.role === "bubble_you_1" ? 2 : 8;
    if (unreadCount > 0) {
      drawUnreadBadge(ctx, x + size.width + 14, y + size.height - 38, unreadCountColor, unreadCount);
    }

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "26px Segoe UI, sans-serif";
    ctx.textAlign = message.mine ? "right" : "left";
    ctx.fillText(message.mine ? "23:55" : "19:47", message.mine ? x - 20 : x + size.width + 72, y + size.height - 8);
    ctx.textAlign = "left";

    y += size.height + (message.mine ? 56 : 72);
  }

  const requiredCanvasHeight = Math.max(minScrollCanvasHeight, y + 140);
  if (Math.abs(requiredCanvasHeight - canvasHeight) > 1) {
    onCanvasHeightChange(requiredCanvasHeight);
  }

  drawTimelineStamp(ctx, Math.min(canvasHeight - 56, y + 26), "23:55");
  onHotspotsChange(hotspots);
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  options: {
    asset: BubbleAsset | null;
    edit?: BubbleEditState;
    platform: ThemePlatform;
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    fill: string;
    textColor: string;
    selected: boolean;
  },
) {
  const { asset, edit, platform, x, y, width, height, text, fill, textColor, selected } = options;

  if (asset) {
    if (platform === "ios") {
      const source = getIosSourceCanvas(asset);
      const stretch = normalizeStretchPoint(edit?.stretch ?? defaultStretch[asset.slot], source.width, source.height);
      renderCapInset(ctx, asset, stretch, x, y, width, height);
    } else {
      renderNinePatch(ctx, asset, x, y, width, height);
    }
  } else {
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(20,52,58,0.7)";
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, width, height, 28);
    ctx.fill();
    ctx.stroke();
  }

  const contentRect = getPreviewContentRect(asset, platform, edit, x, y, width, height);
  if (selected) {
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 6;
    roundRect(ctx, x - 4, y - 4, width + 8, height + 8, 34);
    ctx.stroke();
  }

  drawText(ctx, text, contentRect.x + 14, contentRect.y + 10, Math.max(24, contentRect.width - 28), Math.max(24, contentRect.height - 20), textColor);
}

function getAutoBubbleSize(ctx: CanvasRenderingContext2D, asset: BubbleAsset | null, platform: ThemePlatform, edit: BubbleEditState | undefined, text: string) {
  const maxWidth = 760;
  const source = asset ? (platform === "ios" ? getIosSourceCanvas(asset) : asset.innerCanvas) : null;
  const intrinsicWidth = source?.width ?? 212;
  const intrinsicHeight = source?.height ?? 96;
  const minWidth = clamp(Math.round(intrinsicWidth), 112, maxWidth);
  const minHeight = clamp(Math.round(intrinsicHeight), 72, 1400);
  let width = minWidth;
  let height = minHeight;

  ctx.font = `${bubbleTextFontSize}px Segoe UI, Noto Sans KR, sans-serif`;
  const longestRawLine = Math.max(0, ...String(text).split("\n").map((line) => ctx.measureText(line).width));

  for (let index = 0; index < 8; index += 1) {
    const content = getPreviewContentRect(asset, platform, edit, 0, 0, width, height);
    const widthDeficit = longestRawLine + 28 - content.width;
    if (widthDeficit <= 0 || width >= maxWidth) break;
    width = clamp(width + Math.ceil(widthDeficit), minWidth, maxWidth);
  }

  for (let index = 0; index < 8; index += 1) {
    const content = getPreviewContentRect(asset, platform, edit, 0, 0, width, height);
    const lines = wrapTextLines(ctx, text, Math.max(24, content.width - 28));
    const requiredContentHeight = lines.length * bubbleTextLineHeight + 32;
    const heightDeficit = requiredContentHeight - content.height;
    if (heightDeficit <= 0) break;
    height = clamp(height + Math.ceil(heightDeficit), minHeight, 1400);
  }

  return { width, height };
}

function getPreviewContentRect(asset: BubbleAsset | null, platform: ThemePlatform, edit: BubbleEditState | undefined, x: number, y: number, width: number, height: number) {
  if (!asset) return { x: x + 28, y: y + 20, width: width - 56, height: height - 40 };
  if (platform === "ios") {
    const source = getIosSourceCanvas(asset);
    return mapIosContentRect(edit?.insets ?? defaultInsets[asset.slot], source.width, source.height, x, y, width, height);
  }
  return mapContentRect(edit?.markers ? { ...asset, markers: edit.markers } : asset, x, y, width, height);
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxHeight: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `${bubbleTextFontSize}px Segoe UI, Noto Sans KR, sans-serif`;
  const lineHeight = bubbleTextLineHeight;
  const lines = wrapTextLines(ctx, text, maxWidth);
  const maxLines = Math.max(1, Math.min(lines.length, Math.floor(maxHeight / lineHeight)));
  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, x, y + bubbleTextFontSize + index * lineHeight);
  });
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const rawLine of String(text).split("\n")) {
    let line = "";
    for (const char of rawLine) {
      const next = line + char;
      if (ctx.measureText(next).width > maxWidth && line.length > 0) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function renderCapInset(ctx: CanvasRenderingContext2D, asset: BubbleAsset, stretch: StretchPoint, x: number, y: number, width: number, height: number) {
  const source = getIosSourceCanvas(asset);
  const safeInsets = stretchPointToInsets(stretch, source.width, source.height);
  const sx = [0, safeInsets.left, source.width - safeInsets.right, source.width];
  const sy = [0, safeInsets.top, source.height - safeInsets.bottom, source.height];
  const fixedLeft = safeInsets.left;
  const fixedRight = safeInsets.right;
  const fixedTop = safeInsets.top;
  const fixedBottom = safeInsets.bottom;
  const midWidth = Math.max(1, width - fixedLeft - fixedRight);
  const midHeight = Math.max(1, height - fixedTop - fixedBottom);
  const dx = [x, x + fixedLeft, x + fixedLeft + midWidth, x + width];
  const dy = [y, y + fixedTop, y + fixedTop + midHeight, y + height];

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const sourceWidth = sx[col + 1] - sx[col];
      const sourceHeight = sy[row + 1] - sy[row];
      const destWidth = dx[col + 1] - dx[col];
      const destHeight = dy[row + 1] - dy[row];
      if (sourceWidth <= 0 || sourceHeight <= 0 || destWidth <= 0 || destHeight <= 0) continue;
      ctx.drawImage(source, sx[col], sy[row], sourceWidth, sourceHeight, dx[col], dy[row], destWidth, destHeight);
    }
  }
}

function mapIosContentRect(insets: Insets, sourceWidth: number, sourceHeight: number, x: number, y: number, width: number, height: number) {
  const safeInsets = normalizeInsets(insets, sourceWidth, sourceHeight);
  return {
    x: x + safeInsets.left,
    y: y + safeInsets.top,
    width: Math.max(1, width - safeInsets.left - safeInsets.right),
    height: Math.max(1, height - safeInsets.top - safeInsets.bottom),
  };
}

function stretchPointToInsets(stretch: StretchPoint, sourceWidth: number, sourceHeight: number): Insets {
  const safeStretch = normalizeStretchPoint(stretch, sourceWidth, sourceHeight);
  return {
    top: safeStretch.y,
    right: Math.max(0, sourceWidth - safeStretch.x - 1),
    bottom: Math.max(0, sourceHeight - safeStretch.y - 1),
    left: safeStretch.x,
  };
}

function normalizeInsets(insets: Insets, sourceWidth: number, sourceHeight: number): Insets {
  const maxHorizontal = Math.max(0, Math.floor(sourceWidth - 1));
  const maxVertical = Math.max(0, Math.floor(sourceHeight - 1));
  const left = clamp(Math.round(insets.left), 0, maxHorizontal);
  const right = clamp(Math.round(insets.right), 0, Math.max(0, maxHorizontal - left));
  const top = clamp(Math.round(insets.top), 0, maxVertical);
  const bottom = clamp(Math.round(insets.bottom), 0, Math.max(0, maxVertical - top));
  return { top, right, bottom, left };
}

function normalizeStretchPoint(stretch: StretchPoint, sourceWidth: number, sourceHeight: number): StretchPoint {
  return {
    x: clamp(Math.round(stretch.x), 0, Math.max(0, sourceWidth - 1)),
    y: clamp(Math.round(stretch.y), 0, Math.max(0, sourceHeight - 1)),
  };
}

function getIosSourceCanvas(asset: BubbleAsset) {
  return asset.name.toLowerCase().endsWith(".9.png") ? asset.innerCanvas : asset.fullCanvas;
}

function drawTimelineStamp(ctx: CanvasRenderingContext2D, y: number, label: string) {
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, 470, y, 140, 44, 22);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "24px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 540, y + 30);
  ctx.textAlign = "left";
}

function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.14)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawUnreadBadge(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, count: number) {
  const label = String(count);
  ctx.fillStyle = color;
  ctx.font = "bold 22px Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y + 24);
  ctx.textAlign = "left";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  return ctx;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fileSignature(file?: ThemeProjectFile) {
  if (!file) return "";
  return `${file.path}:${file.size}:${file.file?.lastModified ?? file.sourceUrl ?? ""}`;
}

function selectPreviewFiles(analysis: ThemeProjectAnalysis) {
  return {
    chat_background: findBestFile(analysis, "chat_background"),
    bubble_me_1: findBestFile(analysis, "bubble_me_1"),
    bubble_me_2: findBestFile(analysis, "bubble_me_2"),
    bubble_you_1: findBestFile(analysis, "bubble_you_1"),
    bubble_you_2: findBestFile(analysis, "bubble_you_2"),
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed."));
    image.src = src;
  });
}

function hexToRgba(hex: string, alpha: number) {
  const functionalMatch = hex.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
  if (functionalMatch) return `rgba(${functionalMatch[1]}, ${functionalMatch[2]}, ${functionalMatch[3]}, ${alpha})`;
  if (hex === "transparent") return hex;
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getReadableTextColor(hex: string) {
  const normalized = normalizeHexForContrast(hex);
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#FFFFFF";
}

function getContrastingHeaderColor(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");

  const sampleWidth = 36;
  const sampleHeight = 24;

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "#FFFFFF";

  const sourceX = 0;
  const sourceY = 0;
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight * 0.08; // 상단 8%만 사용

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sampleWidth,
    sampleHeight
  );

  const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

  let luminanceTotal = 0;
  let sampleCount = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    luminanceTotal += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    sampleCount += 1;
  }

  if (sampleCount === 0) return "#FFFFFF";

  const averageLuminance = luminanceTotal / sampleCount;

  return averageLuminance > 0.55 ? "#191919" : "#FFFFFF";
}

function normalizeHexForContrast(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length === 3) {
    return normalized.split("").map((char) => `${char}${char}`).join("");
  }
  if (normalized.length === 8) {
    return normalized.slice(2);
  }
  return normalized.slice(-6);
}
