"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { blobForThemeFile, themeFileCacheKey } from "@/components/preview/previewResourceUtils";
import { loadNinePatchBlob } from "@/lib/theme/android/ninepatch";
import { loadCachedBubbleAsset } from "@/lib/theme/preview/bubbleAssetCache";
import { defaultInsets as bubbleDefaultInsets, defaultStretch as bubbleDefaultStretch } from "@/lib/theme/preview/bubbleCanvas";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { BubbleAsset, BubbleSlot, Insets, Markers, Range, StretchPoint, ThemePlatform } from "@/lib/theme/types";

type MarkerSide = keyof Markers;
type InsetSide = keyof Insets;
type StretchPointSide = keyof StretchPoint;

export default function InlineBubbleAdjuster({
  file,
  slot,
  platform,
  markers,
  insets,
  stretch,
  onMarkersChange,
  onInsetsChange,
  onStretchChange,
  tone = "default",
}: {
  file?: ThemeProjectFile;
  slot: BubbleSlot;
  platform: ThemePlatform;
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
  onMarkersChange: (markers: Markers) => void;
  onInsetsChange: (insets: Insets) => void;
  onStretchChange: (stretch: StretchPoint) => void;
  tone?: "default" | "blue";
}) {
  const [asset, setAsset] = useState<BubbleAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!file) {
        setAsset(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // 파싱 결과에 slot이 담기므로 캐시 키에도 있어야 한다(BubbleCanvasPreview와 같은 규칙).
        const nextAsset = await loadCachedBubbleAsset(`${themeFileCacheKey(file)}:${slot}`, async () => {
          const blob = await blobForThemeFile(file);
          if (!blob) throw new Error(`bubble source missing: ${file.path}`);
          return loadNinePatchBlob(blob, file.name, slot);
        });
        if (cancelled) return;
        setAsset(nextAsset);
      } catch {
        if (cancelled) return;
        setAsset(null);
        setError("말풍선 이미지를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [file, slot]);

  const displayAsset = useMemo(() => {
    if (!asset) return null;
    return markers ? { ...asset, markers } : asset;
  }, [asset, markers]);
  const surfaceClassName = tone === "blue"
    ? "border border-blue-100 bg-white text-slate-500"
    : "border border-[#d7ddd8] bg-[#f6f7f5] text-[#5d6670]";

  if (loading) {
    return <div className={`rounded-[22px] px-4 py-5 text-sm font-bold ${surfaceClassName}`}>말풍선 편집기를 준비하는 중입니다.</div>;
  }

  if (error) {
    return <div className="rounded-[22px] border border-[#f1c9cb] bg-[#fff5f5] px-4 py-5 text-sm font-bold text-[#a33a41]">{error}</div>;
  }

  if (!displayAsset) {
    return <div className={`rounded-[22px] px-4 py-5 text-sm font-bold ${surfaceClassName}`}>이미지를 업로드하거나 기본 말풍선이 있는 슬롯을 선택하세요.</div>;
  }

  return (
    <section className={`grid gap-4 rounded-[26px] p-4 ${surfaceClassName}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#5d6670]">inline bubble adjuster</p>
          <h3 className="mt-1 text-xl font-black">{platform === "android" ? "나인패치 마커 조절" : "iOS inset 조절"}</h3>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#5d6670]">{platform === "android" ? "Android" : "iOS"}</span>
      </div>
      {platform === "android" ? (
        <MarkerEditor asset={displayAsset} onChange={onMarkersChange} />
      ) : (
        <InsetEditor
          asset={displayAsset}
          insets={insets ?? bubbleDefaultInsets[slot]}
          stretch={stretch ?? bubbleDefaultStretch[slot]}
          onChange={onInsetsChange}
          onStretchChange={onStretchChange}
        />
      )}
    </section>
  );
}

function MarkerEditor({ asset, onChange }: { asset: BubbleAsset; onChange: (markers: Markers) => void }) {
  const [activeMarker, setActiveMarker] = useState<MarkerSide>("top");
  const markerMeta: Record<MarkerSide, { label: string; help: string; max: number }> = useMemo(
    () => ({
      top: { label: "top", help: "가로 stretch", max: asset.width },
      left: { label: "left", help: "세로 stretch", max: asset.height },
      right: { label: "right", help: "텍스트 세로 영역", max: asset.height },
      bottom: { label: "bottom", help: "텍스트 가로 영역", max: asset.width },
    }),
    [asset.height, asset.width],
  );

  return (
    <div className="grid gap-4">
      <PatchImage asset={asset} activeMarker={activeMarker} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="marker selector">
        {(Object.keys(markerMeta) as MarkerSide[]).map((side) => (
          <button
            key={side}
            type="button"
            className={`grid gap-1 rounded-[14px] border px-3 py-3 text-left ${activeMarker === side ? "border-[#452cff] bg-white" : "border-[#d7ddd8] bg-[#fbfbfa]"}`}
            onClick={() => setActiveMarker(side)}
          >
            <strong className="text-sm font-black uppercase">{markerMeta[side].label}</strong>
            <span className="text-[11px] font-bold text-[#5d6670]">{markerMeta[side].help}</span>
          </button>
        ))}
      </div>
      <MarkerControl
        label={markerMeta[activeMarker].label}
        help={markerMeta[activeMarker].help}
        max={markerMeta[activeMarker].max}
        range={asset.markers[activeMarker]}
        onChange={(range) =>
          onChange({
            ...asset.markers,
            [activeMarker]: normalizeRange(range, activeMarker === "top" || activeMarker === "bottom" ? asset.width : asset.height),
          })
        }
      />
    </div>
  );
}

function InsetEditor({
  asset,
  insets,
  stretch,
  onChange,
  onStretchChange,
}: {
  asset: BubbleAsset;
  insets: Insets;
  stretch: StretchPoint;
  onChange: (insets: Insets) => void;
  onStretchChange: (stretch: StretchPoint) => void;
}) {
  const source = getIosSourceCanvas(asset);
  const safeInsets = normalizeInsets(insets, source.width, source.height);
  const safeStretch = normalizeStretchPoint(stretch, source.width, source.height);

  return (
    <div className="grid gap-4">
      <InsetImage asset={asset} insets={safeInsets} stretch={safeStretch} />
      <div className="grid gap-3 lg:grid-cols-2">
        <StretchPointControl
          label="x"
          value={safeStretch.x}
          max={Math.max(0, source.width - 1)}
          onChange={(value) => onStretchChange(normalizeStretchPoint({ ...safeStretch, x: value }, source.width, source.height))}
        />
        <StretchPointControl
          label="y"
          value={safeStretch.y}
          max={Math.max(0, source.height - 1)}
          onChange={(value) => onStretchChange(normalizeStretchPoint({ ...safeStretch, y: value }, source.width, source.height))}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {(["top", "right", "bottom", "left"] as InsetSide[]).map((side) => (
          <InsetControl
            key={side}
            label={side}
            value={safeInsets[side]}
            max={insetMax(source, safeInsets, side)}
            onChange={(value) => onChange(normalizeInsets({ ...safeInsets, [side]: value }, source.width, source.height))}
          />
        ))}
      </div>
      <IosCssPreview asset={asset} insets={safeInsets} stretch={safeStretch} />
    </div>
  );
}

function PatchImage({ asset, activeMarker }: { asset: BubbleAsset; activeMarker: MarkerSide }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxWidth = 420;
    const scale = Math.max(1, Math.floor(maxWidth / asset.width));
    canvas.width = asset.width * scale;
    canvas.height = asset.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawChecker(ctx, canvas.width, canvas.height, 12);
    ctx.drawImage(asset.fullCanvas, 0, 0, canvas.width, canvas.height);
    drawMarkerOverlay(ctx, asset, scale, activeMarker);
  }, [activeMarker, asset]);

  return <canvas className="mb-0 block w-full max-h-[260px] rounded-lg border border-[#d5e4e8] object-contain" ref={canvasRef} aria-label="9-patch preview" />;
}

function InsetImage({ asset, insets, stretch }: { asset: BubbleAsset; insets: Insets; stretch: StretchPoint }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = getIosSourceCanvas(asset);
    const maxWidth = 420;
    const scale = Math.max(1, Math.floor(maxWidth / source.width));
    canvas.width = source.width * scale;
    canvas.height = source.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawChecker(ctx, canvas.width, canvas.height, 12);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    drawInsetOverlay(ctx, insets, stretch, source.width, source.height, scale);
  }, [asset, insets, stretch]);

  return <canvas className="mb-0 block w-full max-h-[260px] rounded-lg border border-[#d5e4e8] object-contain" ref={canvasRef} aria-label="iOS inset preview" />;
}

function MarkerControl({
  label,
  help,
  max,
  range,
  onChange,
}: {
  label: string;
  help: string;
  max: number;
  range: Range;
  onChange: (range: Range) => void;
}) {
  const usableMax = Math.max(2, max - 1);
  return (
    <div className="grid gap-3 rounded-[18px] border border-[#d7ddd8] bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <strong className="text-sm font-black uppercase">{label}</strong>
        <span className="text-xs font-bold text-[#5d6670]">{help}</span>
      </div>
      <div className="grid gap-2">
        <input type="range" min={1} max={usableMax} value={range.start} onChange={(event) => onChange({ ...range, start: Number(event.currentTarget.value) })} />
        <input type="range" min={1} max={usableMax} value={range.end} onChange={(event) => onChange({ ...range, end: Number(event.currentTarget.value) })} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          start
          <input type="number" min={1} max={usableMax} value={range.start} onChange={(event) => onChange({ ...range, start: Number(event.currentTarget.value) })} />
        </label>
        <label>
          end
          <input type="number" min={1} max={usableMax} value={range.end} onChange={(event) => onChange({ ...range, end: Number(event.currentTarget.value) })} />
        </label>
      </div>
    </div>
  );
}

function InsetControl({ label, value, max, onChange }: { label: InsetSide; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-2 rounded-lg border border-[#e2ecef] bg-white/80 p-3">
      <span className="flex justify-between gap-2 text-xs font-semibold uppercase text-[#5d6670]">
        {label}
        <strong className="font-semibold normal-case text-[#111111]">{value}px</strong>
      </span>
      <input className="w-full accent-[var(--color-inverse-surface)]" type="range" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <input className="w-full rounded-md border border-[var(--color-outline-variant)] bg-white px-2.5 py-2 text-[var(--color-on-surface)]" type="number" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

function StretchPointControl({
  label,
  value,
  max,
  onChange,
}: {
  label: StretchPointSide;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2 rounded-lg border border-[color:rgba(42,103,103,0.26)] bg-[var(--color-secondary-container)]/30 p-3">
      <span className="flex justify-between gap-2 text-xs font-semibold uppercase text-[#5d6670]">
        {label}
        <strong className="font-semibold normal-case text-[#111111]">{value}px</strong>
      </span>
      <input className="w-full accent-[var(--color-inverse-surface)]" type="range" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <input className="w-full rounded-md border border-[var(--color-outline-variant)] bg-white px-2.5 py-2 text-[var(--color-on-surface)]" type="number" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

function IosCssPreview({ asset, insets, stretch }: { asset: BubbleAsset; insets: Insets; stretch: StretchPoint }) {
  const source = getIosSourceCanvas(asset);
  const sourceScale = getIosImageScale(asset);
  const css = getIosCssValues(insets, stretch, source.width, source.height, sourceScale);
  const imageBaseName = getIosCssImageName(asset);
  return (
    <div className="grid gap-2 rounded-lg border border-[color:rgba(42,103,103,0.22)] bg-[var(--color-secondary-container)]/30 p-3">
      <div className="flex justify-between gap-3 text-xs font-extrabold text-[#5d6670]">
        <span>CSS point stretch</span>
        <strong className="text-[#111111]">
          {css.stretchX}px {css.stretchY}px
        </strong>
      </div>
      <div className="flex justify-between gap-3 text-xs font-extrabold text-[#5d6670]">
        <span>title edgeInsets</span>
        <strong className="text-[#111111]">
          {css.edgeTop}px {css.edgeLeft}px {css.edgeBottom}px {css.edgeRight}px
        </strong>
      </div>
      <pre className="overflow-auto rounded-lg bg-white p-2.5 text-xs leading-[1.45] text-[#111111]">{`-ios-background-image: '${imageBaseName}' ${css.stretchX}px ${css.stretchY}px;
-ios-title-edgeinsets: ${css.edgeTop}px ${css.edgeLeft}px ${css.edgeBottom}px ${css.edgeRight}px;`}</pre>
    </div>
  );
}

function drawMarkerOverlay(ctx: CanvasRenderingContext2D, asset: BubbleAsset, scale: number, activeMarker: MarkerSide) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 167, 192, .25)";
  ctx.fillRect(asset.markers.top.start * scale, 0, (asset.markers.top.end - asset.markers.top.start) * scale, asset.height * scale);
  ctx.fillRect(0, asset.markers.left.start * scale, asset.width * scale, (asset.markers.left.end - asset.markers.left.start) * scale);
  ctx.strokeStyle = "rgba(255, 64, 128, .9)";
  ctx.lineWidth = Math.max(2, scale);
  ctx.strokeRect(
    asset.markers.bottom.start * scale,
    asset.markers.right.start * scale,
    (asset.markers.bottom.end - asset.markers.bottom.start) * scale,
    (asset.markers.right.end - asset.markers.right.start) * scale,
  );
  ctx.strokeStyle = "#ff7448";
  ctx.lineWidth = Math.max(3, scale * 2);
  if (activeMarker === "top") {
    ctx.strokeRect(asset.markers.top.start * scale, 0, (asset.markers.top.end - asset.markers.top.start) * scale, Math.max(3, scale * 2));
  } else if (activeMarker === "left") {
    ctx.strokeRect(0, asset.markers.left.start * scale, Math.max(3, scale * 2), (asset.markers.left.end - asset.markers.left.start) * scale);
  } else if (activeMarker === "right") {
    ctx.strokeRect(
      (asset.width - 1) * scale - Math.max(2, scale),
      asset.markers.right.start * scale,
      Math.max(3, scale * 2),
      (asset.markers.right.end - asset.markers.right.start) * scale,
    );
  } else {
    ctx.strokeRect(
      asset.markers.bottom.start * scale,
      (asset.height - 1) * scale - Math.max(2, scale),
      (asset.markers.bottom.end - asset.markers.bottom.start) * scale,
      Math.max(3, scale * 2),
    );
  }
  ctx.restore();
}

function drawInsetOverlay(ctx: CanvasRenderingContext2D, insets: Insets, stretch: StretchPoint, width: number, height: number, scale: number) {
  const safeInsets = normalizeInsets(insets, width, height);
  const safeStretch = normalizeStretchPoint(stretch, width, height);
  const x = safeInsets.left * scale;
  const y = safeInsets.top * scale;
  const rectWidth = Math.max(1, (width - safeInsets.left - safeInsets.right) * scale);
  const rectHeight = Math.max(1, (height - safeInsets.top - safeInsets.bottom) * scale);

  ctx.save();
  ctx.fillStyle = "rgba(0, 167, 192, .22)";
  ctx.fillRect(x, y, rectWidth, rectHeight);
  ctx.strokeStyle = "rgba(255, 64, 128, .9)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = Math.max(2, scale);
  ctx.strokeRect(x, y, rectWidth, rectHeight);
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(0, 107, 122, .95)";
  ctx.lineWidth = Math.max(2, scale * 2);
  const pointX = safeStretch.x * scale;
  const pointY = safeStretch.y * scale;
  ctx.beginPath();
  ctx.moveTo(pointX, 0);
  ctx.lineTo(pointX, height * scale);
  ctx.moveTo(0, pointY);
  ctx.lineTo(width * scale, pointY);
  ctx.stroke();
  ctx.fillStyle = "rgba(0, 107, 122, .95)";
  ctx.fillRect(pointX, pointY, Math.max(3, scale * 3), Math.max(3, scale * 3));
  ctx.restore();
}

function drawChecker(ctx: CanvasRenderingContext2D, width: number, height: number, size: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f4fafb";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e3eef1";
  for (let y = 0; y < height; y += size) {
    for (let x = (y / size) % 2 ? 0 : size; x < width; x += size * 2) {
      ctx.fillRect(x, y, size, size);
    }
  }
}

function normalizeRange(range: Range, max: number): Range {
  const start = clamp(Math.round(range.start), 1, max - 2);
  const end = clamp(Math.round(range.end), 2, max - 1);
  if (start >= end) return { start: Math.max(1, end - 1), end };
  return { start, end };
}

function normalizeInsets(current: Insets, sourceWidth: number, sourceHeight: number): Insets {
  const maxHorizontal = Math.max(0, Math.floor(sourceWidth - 1));
  const maxVertical = Math.max(0, Math.floor(sourceHeight - 1));
  const left = clamp(Math.round(current.left), 0, maxHorizontal);
  const right = clamp(Math.round(current.right), 0, Math.max(0, maxHorizontal - left));
  const top = clamp(Math.round(current.top), 0, maxVertical);
  const bottom = clamp(Math.round(current.bottom), 0, Math.max(0, maxVertical - top));
  return { top, right, bottom, left };
}

function normalizeStretchPoint(current: StretchPoint, sourceWidth: number, sourceHeight: number): StretchPoint {
  return {
    x: clamp(Math.round(current.x), 0, Math.max(0, sourceWidth - 1)),
    y: clamp(Math.round(current.y), 0, Math.max(0, sourceHeight - 1)),
  };
}

function insetMax(source: HTMLCanvasElement, insets: Insets, side: InsetSide) {
  if (side === "left") return Math.max(0, source.width - 1 - insets.right);
  if (side === "right") return Math.max(0, source.width - 1 - insets.left);
  if (side === "top") return Math.max(0, source.height - 1 - insets.bottom);
  return Math.max(0, source.height - 1 - insets.top);
}

function getIosCssValues(insets: Insets, stretch: StretchPoint, sourceWidth: number, sourceHeight: number, sourceScale: number) {
  const safeInsets = normalizeInsets(insets, sourceWidth, sourceHeight);
  const safeStretch = normalizeStretchPoint(stretch, sourceWidth, sourceHeight);
  return {
    stretchX: Math.round(safeStretch.x / sourceScale),
    stretchY: Math.round(safeStretch.y / sourceScale),
    edgeTop: Math.round(safeInsets.top / sourceScale),
    edgeLeft: Math.round(safeInsets.left / sourceScale),
    edgeBottom: Math.round(safeInsets.bottom / sourceScale),
    edgeRight: Math.round(safeInsets.right / sourceScale),
  };
}

function getIosImageScale(asset: BubbleAsset) {
  const match = asset.name.match(/@([23])x\.png$/i);
  return match ? Number(match[1]) : 3;
}

function getIosCssImageName(asset: BubbleAsset) {
  return asset.name.replace(/@(?:2|3)x(?=\.png$)/i, "").replace(/\.9\.png$/i, ".png");
}

function getIosSourceCanvas(asset: BubbleAsset) {
  return asset.name.toLowerCase().endsWith(".9.png") ? asset.innerCanvas : asset.fullCanvas;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
