"use client";

import { useEffect, useRef, useState } from "react";
import { loadNinePatchDataUrl } from "@/lib/theme/android/ninepatch";
import { drawBubble, getAutoBubbleSize } from "@/lib/theme/preview/bubbleCanvas";
import type { BubbleEditState } from "@/lib/theme/project/state";
import type { BubbleAsset, BubbleSlot, ThemePlatform } from "@/lib/theme/types";

// 갤러리 모달용: 편집기(ChatroomPreview)와 동일한 캔버스 9-slice 로직으로 말풍선 하나를 렌더한다.
// 소스 픽셀 공간에서 그린 뒤 scale로 CSS 축소해 표시 → 편집기와 픽셀 단위로 일치.
export default function BubbleCanvasPreview({
  imageUrl,
  platform,
  slot,
  edit,
  text,
  textColor,
  fillColor,
  scale,
  className,
}: {
  imageUrl: string;
  platform: ThemePlatform;
  slot: BubbleSlot;
  edit?: BubbleEditState;
  text: string;
  textColor: string;
  fillColor: string;
  scale: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [asset, setAsset] = useState<BubbleAsset | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const dataUrl = await fetchAsDataUrl(imageUrl);
        // 편집기와 동일한 소스 캔버스(innerCanvas/fullCanvas)를 고르도록 원본 URL의 .9.png 여부를 이름에 보존한다.
        const isNinePatch = imageUrl.split("?")[0].toLowerCase().endsWith(".9.png");
        const loaded = await loadNinePatchDataUrl(dataUrl, `${slot}-bubble${isNinePatch ? ".9" : ""}.png`, slot);
        if (active) setAsset(loaded);
      } catch {
        if (active) setAsset(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [imageUrl, slot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 편집기 ChatroomPreview와 동일하게 편집 마커를 asset에 반영한다.
    // (Android renderNinePatch는 asset.markers로 stretch 영역을 그리므로 edit만으로는 부족하다.)
    const drawAsset = asset && edit?.markers ? { ...asset, markers: edit.markers } : asset;
    const { width, height } = getAutoBubbleSize(ctx, drawAsset, platform, edit, text);
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    drawBubble(ctx, { asset: drawAsset, edit, platform, x: 0, y: 0, width, height, text, fill: fillColor, textColor });
    canvas.style.width = `${Math.round(width * scale)}px`;
    canvas.style.height = `${Math.round(height * scale)}px`;
  }, [asset, platform, edit, text, textColor, fillColor, scale]);

  return <canvas ref={canvasRef} className={className} />;
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
