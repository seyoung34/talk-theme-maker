"use client";

import { ArrowLeft, Hash, Menu, Phone, Plus, Search, Smile } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getResolvedColor, type BubbleEditState, type SlotCandidateSelections } from "@/components/project/projectModel";
import { dataUrlForThemeFile, findBestFile, imageUrlForThemeFile } from "@/components/preview/previewResourceUtils";
import { loadNinePatchDataUrl, mapContentRect, renderNinePatch } from "@/lib/theme/android/ninepatch";
import type { ThemeProjectAnalysis } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleAsset, BubbleSlot, Insets, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

type Hotspot = {
  slotId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const previewCanvasWidth = 1080;
const previewCanvasHeight = 1920;
const headerHeight = 144;
const inputBarHeightRatio = 86 / 1600;
const inputBarHeight = Math.round(previewCanvasHeight * inputBarHeightRatio);
const canvasTopInset = 132;
const canvasBottomInset = inputBarHeight + 44;
const bubbleLeftInset = 44;
const bubbleRightInset = 44;

const defaultInsets: Record<BubbleSlot, Insets> = {
  me: { top: 24, right: 28, bottom: 24, left: 28 },
  you: { top: 24, right: 28, bottom: 24, left: 28 },
};

const defaultStretch: Record<BubbleSlot, StretchPoint> = {
  me: { x: 28, y: 24 },
  you: { x: 28, y: 24 },
};

const sampleMessages = [
  { role: "bubble_you_1" as ThemeResourceRole, slot: "you" as BubbleSlot, mine: false, author: "정이지", text: "엥 이게 릴스에서 그거???" },
  { role: "bubble_me_1" as ThemeResourceRole, slot: "me" as BubbleSlot, mine: true, author: "나", text: "한꺼번에 옮겨다니는거" },
  { role: "bubble_you_2" as ThemeResourceRole, slot: "you" as BubbleSlot, mine: false, author: "정이지", text: "언덕이라 힘들지더" },
  { role: "bubble_me_2" as ThemeResourceRole, slot: "me" as BubbleSlot, mine: true, author: "나", text: "그럴지도" },
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
  bubbleEdits: Partial<Record<BubbleSlot, BubbleEditState>>;
  selectedSlotId?: string;
  onSelectSlot?: (slotId: string) => void;
}) {
  const slotByRole = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.role, slot])) as Partial<Record<ThemeResourceRole, ThemeAssetSlot>>,
    [slots],
  );
  const selectedFiles = useMemo(() => selectPreviewFiles(analysis), [analysis]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [bubbleAssets, setBubbleAssets] = useState<Record<string, BubbleAsset | undefined>>({});
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);

  const inputBackground = getResolvedColor(slotByRole.chat_input_background_color, colors, selections, templateId, template) ?? template.defaults.chatInputBackground;
  const sendButtonColor = getResolvedColor(slotByRole.chat_send_button_color, colors, selections, templateId, template) ?? template.defaults.chatSendButton;
  const chatBackgroundColor = getResolvedColor(slotByRole.chat_background_color, colors, selections, templateId, template) ?? template.defaults.chatBackground;

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    async function load() {
      let nextBackgroundImage: HTMLImageElement | null = null;
      if (selectedFiles.chat_background) {
        const nextBackgroundUrl = await imageUrlForThemeFile(selectedFiles.chat_background, false);
        if (nextBackgroundUrl.startsWith("blob:")) objectUrls.push(nextBackgroundUrl);
        nextBackgroundImage = await loadImage(nextBackgroundUrl);
      }

      if (!cancelled) setBackgroundImage(nextBackgroundImage);
    }

    void load();
    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [selectedFiles.chat_background]);

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
        const edits = bubbleEdits[bubbleSlot];
        nextAssets[slot.id] = edits?.markers ? { ...asset, markers: edits.markers } : asset;
      }

      if (!cancelled) setBubbleAssets(nextAssets);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bubbleEdits, selectedFiles, slotByRole]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawChatPreview(ctx, {
      backgroundImage,
      defaults: analysis.previewDefaults,
      platform,
      slots: slotByRole,
      selectedSlotId,
      bubbleAssets,
      bubbleEdits,
      chatBackgroundColor,
      onHotspotsChange: setHotspots,
    });
  }, [analysis.previewDefaults, backgroundImage, bubbleAssets, bubbleEdits, chatBackgroundColor, platform, selectedSlotId, slotByRole]);

  const backgroundSlot = slotByRole.chat_background;
  const inputSlot = slotByRole.chat_input_background_color;
  const sendSlot = slotByRole.chat_send_button_color;

  return (
    <div className="relative aspect-[9/16] h-full w-full max-w-[360px] overflow-hidden rounded-[36px] border border-[#d7ddd8] bg-white shadow-[0_28px_60px_rgba(15,23,42,0.18)]">
      {backgroundSlot ? (
        <button
          type="button"
          className={`absolute inset-0 z-0 ${selectedSlotId === backgroundSlot.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
          aria-label="채팅방 배경 선택"
          onClick={() => onSelectSlot?.(backgroundSlot.id)}
        />
      ) : null}
      <canvas ref={canvasRef} className="relative z-10 h-full w-full" width={previewCanvasWidth} height={previewCanvasHeight} />
      {hotspots.map((hotspot) => (
        <button
          key={hotspot.slotId}
          type="button"
          className="absolute z-20 bg-transparent"
          style={{
            left: `${(hotspot.x / previewCanvasWidth) * 100}%`,
            top: `${(hotspot.y / previewCanvasHeight) * 100}%`,
            width: `${(hotspot.width / previewCanvasWidth) * 100}%`,
            height: `${(hotspot.height / previewCanvasHeight) * 100}%`,
          }}
          aria-label={hotspot.slotId}
          onClick={() => onSelectSlot?.(hotspot.slotId)}
        />
      ))}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[116px] bg-[linear-gradient(180deg,rgba(28,32,41,0.34),rgba(28,32,41,0.08),transparent)]" />
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 pb-4 pt-9 text-white">
        <div className="flex items-center gap-4">
          <ArrowLeft className="h-7 w-7" strokeWidth={2.2} />
          <strong className="text-[18px] font-semibold tracking-[-0.02em]">정이지</strong>
        </div>
        <div className="flex items-center gap-5">
          <Search className="h-6 w-6" strokeWidth={2.1} />
          <Phone className="h-6 w-6" strokeWidth={2.1} />
          <Menu className="h-6 w-6" strokeWidth={2.1} />
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-30 border-t border-white/20 ${selectedSlotId === inputSlot?.id ? "ring-2 ring-inset ring-[#60a5fa]" : ""}`}
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
        <div className="relative flex h-full items-center gap-2 px-3 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf3f6] text-[#1781a3]">
            <Plus className="h-5 w-5" />
          </span>
          <div className="flex h-10 flex-1 items-center rounded-full bg-white/92 px-4 shadow-[inset_0_0_0_1px_rgba(203,213,225,0.85)]">
            <span className="text-[14px] font-medium text-[#b3c0ca]">메시지 입력</span>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf3f6] text-[#5b7682]">
            <Smile className="h-5 w-5" />
          </span>
          <button
            type="button"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#0b6070] ${selectedSlotId === sendSlot?.id ? "ring-2 ring-[#60a5fa]" : ""}`}
            style={{ backgroundColor: sendButtonColor }}
            onClick={(event) => {
              event.stopPropagation();
              if (sendSlot) onSelectSlot?.(sendSlot.id);
            }}
          >
            <Hash className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function drawChatPreview(
  ctx: CanvasRenderingContext2D,
  options: {
    backgroundImage: HTMLImageElement | null;
    defaults?: ThemeProjectAnalysis["previewDefaults"];
    platform: ThemePlatform;
    slots: Partial<Record<ThemeResourceRole, ThemeAssetSlot>>;
    selectedSlotId?: string;
    bubbleAssets: Record<string, BubbleAsset | undefined>;
    bubbleEdits: Partial<Record<BubbleSlot, BubbleEditState>>;
    chatBackgroundColor: string;
    onHotspotsChange: (hotspots: Hotspot[]) => void;
  },
) {
  const { backgroundImage, defaults, platform, slots, selectedSlotId, bubbleAssets, bubbleEdits, chatBackgroundColor, onHotspotsChange } = options;

  ctx.clearRect(0, 0, previewCanvasWidth, previewCanvasHeight);
  ctx.fillStyle = chatBackgroundColor || defaults?.chatBackground || "#b8f2f7";
  ctx.fillRect(0, 0, previewCanvasWidth, previewCanvasHeight);

  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, previewCanvasWidth, previewCanvasHeight);
  }

  const hotspots: Hotspot[] = [];
  let y = canvasTopInset + 62;

  drawTimelineStamp(ctx, y - 24, "19:47");

  for (const message of sampleMessages) {
    const slot = slots[message.role];
    const edit = bubbleEdits[message.slot];
    const asset = slot ? bubbleAssets[slot.id] ?? null : null;
    const size = getAutoBubbleSize(ctx, asset, platform, edit, message.text);
    const x = message.mine ? previewCanvasWidth - bubbleRightInset - size.width : bubbleLeftInset + 94;
    const avatarX = bubbleLeftInset;

    if (!message.mine) {
      drawAvatar(ctx, avatarX, y + 12, 74);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
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
      fill: message.mine ? defaults?.myBubble ?? "#facc15" : defaults?.friendBubble ?? "#ffffff",
      selected: selectedSlotId === slot?.id,
    });

    if (slot) hotspots.push({ slotId: slot.id, x, y, width: size.width, height: size.height });

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "26px Segoe UI, sans-serif";
    ctx.textAlign = message.mine ? "right" : "left";
    ctx.fillText(message.mine ? "23:55" : "19:47", message.mine ? x - 20 : x + size.width + 20, y + size.height - 8);
    ctx.textAlign = "left";

    y += size.height + (message.mine ? 56 : 72);
  }

  drawTimelineStamp(ctx, previewCanvasHeight - canvasBottomInset - 48, "23:55");
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
    selected: boolean;
  },
) {
  const { asset, edit, platform, x, y, width, height, text, fill, selected } = options;

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

  drawText(ctx, text, contentRect.x + 14, contentRect.y + 10, Math.max(24, contentRect.width - 28), Math.max(24, contentRect.height - 20));
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

  for (let index = 0; index < 12; index += 1) {
    const content = getPreviewContentRect(asset, platform, edit, 0, 0, width, height);
    const lines = wrapTextLines(ctx, text, Math.max(24, content.width - 24));
    const requiredContentHeight = lines.length * 44 + 30;
    const longestLine = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
    const widthDeficit = longestLine + 34 - content.width;
    const heightDeficit = requiredContentHeight - content.height;
    if (widthDeficit <= 0 && heightDeficit <= 0) break;
    if (widthDeficit > 0 && width < maxWidth) {
      width = clamp(width + Math.ceil(widthDeficit), 112, maxWidth);
    } else if (heightDeficit > 0) {
      height = clamp(height + Math.ceil(heightDeficit), 72, 1400);
    } else {
      break;
    }
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

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxHeight: number) {
  ctx.fillStyle = "#14343a";
  ctx.font = "34px Segoe UI, Noto Sans KR, sans-serif";
  const lineHeight = 44;
  const lines = wrapTextLines(ctx, text, maxWidth);
  const maxLines = Math.max(1, Math.min(lines.length, Math.floor(maxHeight / lineHeight)));
  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, x, y + 34 + index * lineHeight);
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
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
