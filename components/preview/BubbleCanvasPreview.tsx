"use client";

import { useEffect, useRef, useState } from "react";
import { loadNinePatchBlob } from "@/lib/theme/android/ninepatch";
import { loadCachedBubbleAsset } from "@/lib/theme/preview/bubbleAssetCache";
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
        // 편집기와 동일한 소스 캔버스(innerCanvas/fullCanvas)를 고르도록 원본 URL의 .9.png 여부를 이름에 보존한다.
        const sourcePath = imageUrl.split("?")[0];
        const isNinePatch = sourcePath.toLowerCase().endsWith(".9.png");
        // 서명 URL은 재발급될 때마다 쿼리가 바뀌므로 경로만 캐시 키로 쓴다.
        const loaded = await loadCachedBubbleAsset(`${sourcePath}:${slot}`, async () => {
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error(`bubble image fetch failed: ${sourcePath}`);
          return loadNinePatchBlob(await response.blob(), `${slot}-bubble${isNinePatch ? ".9" : ""}.png`, slot);
        });
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
    const { width, height } = getAutoBubbleSize(ctx, asset, platform, edit, text);
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    drawBubble(ctx, { asset, edit, platform, x: 0, y: 0, width, height, text, fill: fillColor, textColor });
    canvas.style.width = `${Math.round(width * scale)}px`;
    canvas.style.height = `${Math.round(height * scale)}px`;
  }, [asset, platform, edit, text, textColor, fillColor, scale]);

  return <canvas ref={canvasRef} className={className} />;
}
