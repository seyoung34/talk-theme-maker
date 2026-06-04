import { useEffect, useMemo, useRef, useState } from "react";
import type { BubbleAsset, BubbleSlot, Insets, Markers, PlatformMode, PreviewConfig, Range, StretchPoint } from "./types";
import { downloadNinePatch, loadNinePatchDataUrl, loadNinePatchFile, mapContentRect, mapStretchRect, renderNinePatch } from "./ninepatch";

type MarkerSide = keyof Markers;
type PreviewSizeKey = keyof Pick<PreviewConfig, "maxBubbleWidth" | "minBubbleWidth" | "minBubbleHeight">;
type InsetSide = keyof Insets;
type StretchPointSide = keyof StretchPoint;

const previewCanvasWidth = 1080;
const previewHorizontalInset = 10;
const previewMaxBubbleRenderWidth = previewCanvasWidth - previewHorizontalInset * 2;

const slotLabels: Record<BubbleSlot, string> = {
  me: "내 말풍선",
  you: "상대 말풍선",
};

const downloadNames: Record<BubbleSlot, string> = {
  me: "theme_chatroom_bubble_me_01_image.9.png",
  you: "theme_chatroom_bubble_you_01_image.9.png",
};

const platformLabels: Record<PlatformMode, string> = {
  android: "Android .9.png",
  ios: "iOS inset",
};

const previewSizeLimits = {
  maxBubbleWidth: { min: 220, max: previewMaxBubbleRenderWidth, initial: 760 },
  minBubbleWidth: { min: 80, max: 1080, initial: 150 },
  minBubbleHeight: { min: 48, max: 512, initial: 86 },
} as const;

const initialConfig: PreviewConfig = {
  platform: "android",
  maxBubbleWidth: previewSizeLimits.maxBubbleWidth.initial,
  minBubbleWidth: previewSizeLimits.minBubbleWidth.initial,
  minBubbleHeight: previewSizeLimits.minBubbleHeight.initial,
  meMessage: "아 ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ\n나인패치 늘어나는지 테스트",
  youMessage: "상대 말풍선도 따로 확인",
  showContent: false,
  showStretch: false,
  iosInsets: {
    me: { top: 24, right: 28, bottom: 24, left: 28 },
    you: { top: 24, right: 28, bottom: 24, left: 28 },
  },
  iosStretch: {
    me: { x: 28, y: 24 },
    you: { x: 28, y: 24 },
  },
};

const storageKey = "kakaotalk-theme-maker:v1";

type SavedAsset = {
  name: string;
  dataUrl: string;
  markers: Markers;
};

type SavedState = {
  activeSlot: BubbleSlot;
  config: PreviewConfig;
  assets: Partial<Record<BubbleSlot, SavedAsset>>;
};

function App() {
  const [activeSlot, setActiveSlot] = useState<BubbleSlot>("me");
  const [assets, setAssets] = useState<Partial<Record<BubbleSlot, BubbleAsset>>>({});
  const [config, setConfig] = useState<PreviewConfig>(initialConfig);
  const [restored, setRestored] = useState(false);
  const activeAsset = assets[activeSlot] ?? null;

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const saved = readSavedState();
      if (!saved) {
        setRestored(true);
        return;
      }
      const restoredAssets: Partial<Record<BubbleSlot, BubbleAsset>> = {};
      for (const slot of ["me", "you"] as BubbleSlot[]) {
        const savedAsset = saved.assets[slot];
        if (!savedAsset) continue;
        try {
          const asset = await loadNinePatchDataUrl(savedAsset.dataUrl, savedAsset.name, slot);
          restoredAssets[slot] = { ...asset, markers: savedAsset.markers };
        } catch {
          // Ignore broken localStorage image payloads.
        }
      }
      if (cancelled) return;
      setAssets(restoredAssets);
      setActiveSlot(saved.activeSlot);
      setConfig(sanitizePreviewConfig(saved.config));
      setRestored(true);
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    writeSavedState({ activeSlot, config: sanitizePreviewConfig(config), assets });
  }, [activeSlot, assets, config, restored]);

  const updateAsset = (slot: BubbleSlot, asset: BubbleAsset) => {
    setAssets((current) => ({ ...current, [slot]: asset }));
  };

  const updateMarkers = (markers: Markers) => {
    if (!activeAsset) return;
    updateAsset(activeSlot, { ...activeAsset, markers });
  };

  return (
    <main className="app-shell">
      <section className="workbench">
        <header className="app-header">
          <div>
            <p className="eyebrow">KakaoTalk Theme Maker</p>
            <h1>9-Patch 말풍선 편집기</h1>
          </div>
          <div className="resolution-badge">1080 x 1920</div>
        </header>

        <PlatformTabs platform={config.platform} setPlatform={(platform) => setConfig((current) => sanitizePreviewConfig({ ...current, platform }))} />

        <SlotTabs activeSlot={activeSlot} setActiveSlot={setActiveSlot} />

        <FileDropzone slot={activeSlot} onAsset={updateAsset} />

        {activeAsset ? (
          <>
            <Diagnostics asset={activeAsset} />
            {config.platform === "ios" ? (
              <InsetEditor
                asset={activeAsset}
                insets={config.iosInsets[activeSlot]}
                stretch={config.iosStretch[activeSlot]}
                onChange={(insets) =>
                  setConfig((current) =>
                    sanitizePreviewConfig({
                      ...current,
                      iosInsets: { ...current.iosInsets, [activeSlot]: insets },
                    }),
                  )
                }
                onStretchChange={(stretch) =>
                  setConfig((current) =>
                    sanitizePreviewConfig({
                      ...current,
                      iosStretch: { ...current.iosStretch, [activeSlot]: stretch },
                    }),
                  )
                }
              />
            ) : (
              <>
                <MarkerEditor asset={activeAsset} onChange={updateMarkers} />
                <DownloadPanel asset={activeAsset} slot={activeSlot} />
              </>
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </section>

      <section className="preview-stage">
        <ChatPreview me={assets.me ?? null} you={assets.you ?? null} config={config} />
      </section>

      <aside className="control-rail">
        <PreviewControls config={config} setConfig={setConfig} />
      </aside>
    </main>
  );
}

function PlatformTabs({ platform, setPlatform }: { platform: PlatformMode; setPlatform: (platform: PlatformMode) => void }) {
  return (
    <div className="segmented platform-tabs" role="tablist" aria-label="platform mode">
      {(["android", "ios"] as PlatformMode[]).map((mode) => (
        <button
          key={mode}
          className={platform === mode ? "active" : ""}
          type="button"
          onClick={() => setPlatform(mode)}
        >
          {platformLabels[mode]}
        </button>
      ))}
    </div>
  );
}

function SlotTabs({ activeSlot, setActiveSlot }: { activeSlot: BubbleSlot; setActiveSlot: (slot: BubbleSlot) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label="말풍선 슬롯">
      {(["me", "you"] as BubbleSlot[]).map((slot) => (
        <button
          key={slot}
          className={activeSlot === slot ? "active" : ""}
          type="button"
          onClick={() => setActiveSlot(slot)}
        >
          {slotLabels[slot]}
        </button>
      ))}
    </div>
  );
}

function FileDropzone({ slot, onAsset }: { slot: BubbleSlot; onAsset: (slot: BubbleSlot, asset: BubbleAsset) => void }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputId = `file-${slot}`;

  const load = async (file: File) => {
    setBusy(true);
    try {
      onAsset(slot, await loadNinePatchFile(file, slot));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      className={`dropzone ${dragging ? "dragging" : ""}`}
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void load(file);
      }}
    >
      <input
        id={inputId}
        type="file"
        accept="image/png,.png"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void load(file);
        }}
      />
      <span className="drop-title">{busy ? "불러오는 중" : `${slotLabels[slot]} PNG/.9.png 드롭`}</span>
      <span className="drop-copy">Figma에서 export한 PNG도 가능하며, marker가 없으면 기본값으로 시작합니다.</span>
    </label>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <strong>파일을 올리면 편집 패널이 열립니다.</strong>
      <p>먼저 `theme_chatroom_bubble_me_01_image.9.png` 하나로 시작하세요.</p>
    </div>
  );
}

function Diagnostics({ asset }: { asset: BubbleAsset }) {
  const invalidPreview = asset.invalidPixels
    .slice(0, 4)
    .map((p) => `(${p.x}, ${p.y}) rgba(${p.rgba.join(",")})`)
    .join("\n");

  return (
    <div className="panel diagnostics">
      <div>
        <span className="metric-label">파일</span>
        <strong>{asset.name}</strong>
      </div>
      <div>
        <span className="metric-label">크기</span>
        <strong>
          {asset.width} x {asset.height}
        </strong>
      </div>
      <div className={asset.invalidPixels.length ? "metric bad" : "metric good"}>
        <span className="metric-label">invalid border pixel</span>
        <strong>{asset.invalidPixels.length}</strong>
      </div>
      {invalidPreview && <pre className="invalid-list">{invalidPreview}</pre>}
    </div>
  );
}

function MarkerEditor({ asset, onChange }: { asset: BubbleAsset; onChange: (markers: Markers) => void }) {
  const [activeMarker, setActiveMarker] = useState<MarkerSide>("top");
  const markers = asset.markers;
  const setMarker = (side: MarkerSide, range: Range) => {
    onChange({ ...markers, [side]: normalizeRange(range, side === "top" || side === "bottom" ? asset.width : asset.height) });
  };
  const markerMeta: Record<MarkerSide, { label: string; help: string; max: number }> = useMemo(
    () => ({
      top: { label: "top", help: "가로 stretch", max: asset.width },
      left: { label: "left", help: "세로 stretch", max: asset.height },
      right: { label: "right", help: "텍스트 세로 영역", max: asset.height },
      bottom: { label: "bottom", help: "텍스트 가로 영역", max: asset.width },
    }),
    [asset.height, asset.width],
  );
  const activeMeta = markerMeta[activeMarker];

  return (
    <div className="panel marker-editor">
      <div className="panel-title">
        <h2>마커 수정</h2>
        <span>검은 1px 라인을 직접 조절합니다.</span>
      </div>

      <PatchImage asset={asset} activeMarker={activeMarker} />

      <div className="marker-tabs" role="tablist" aria-label="마커 선택">
        {(Object.keys(markerMeta) as MarkerSide[]).map((side) => (
          <button
            key={side}
            type="button"
            className={activeMarker === side ? "active" : ""}
            onClick={() => setActiveMarker(side)}
          >
            <strong>{markerMeta[side].label}</strong>
            <span>{markerMeta[side].help}</span>
          </button>
        ))}
      </div>

      <MarkerControl
        label={activeMeta.label}
        help={activeMeta.help}
        max={activeMeta.max}
        range={markers[activeMarker]}
        onChange={(range) => setMarker(activeMarker, range)}
      />
    </div>
  );
}

function PatchImage({ asset, activeMarker }: { asset: BubbleAsset; activeMarker: MarkerSide }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxWidth = 360;
    const scale = Math.max(1, Math.floor(maxWidth / asset.width));
    canvas.width = asset.width * scale;
    canvas.height = asset.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawChecker(ctx, canvas.width, canvas.height, 12);
    ctx.drawImage(asset.fullCanvas, 0, 0, canvas.width, canvas.height);
    drawMarkerOverlay(ctx, asset, scale, activeMarker);
  }, [asset, activeMarker]);

  return <canvas className="patch-image" ref={canvasRef} aria-label="9-patch marker preview" />;
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
  const setInset = (side: InsetSide, value: number) => {
    onChange(normalizeInsets({ ...safeInsets, [side]: value }, source.width, source.height));
  };
  const setStretch = (side: StretchPointSide, value: number) => {
    onStretchChange(normalizeStretchPoint({ ...safeStretch, [side]: value }, source.width, source.height));
  };

  return (
    <div className="panel inset-editor">
      <div className="panel-title">
        <h2>iOS inset</h2>
        <span>background stretch + text edge</span>
      </div>

      <InsetImage asset={asset} insets={safeInsets} stretch={safeStretch} />

      <div className="panel-title compact-title">
        <h2>background stretch</h2>
        <span>CSS image 2 values</span>
      </div>
      <div className="inset-grid">
        <StretchPointControl label="x" value={safeStretch.x} max={Math.max(0, source.width - 1)} onChange={(value) => setStretch("x", value)} />
        <StretchPointControl label="y" value={safeStretch.y} max={Math.max(0, source.height - 1)} onChange={(value) => setStretch("y", value)} />
      </div>

      <div className="panel-title compact-title">
        <h2>title edgeInsets</h2>
        <span>top right bottom left</span>
      </div>

      <div className="inset-grid">
        {(["top", "right", "bottom", "left"] as InsetSide[]).map((side) => (
          <InsetControl key={side} label={side} value={safeInsets[side]} max={insetMax(source, safeInsets, side)} onChange={(value) => setInset(side, value)} />
        ))}
      </div>

      <IosCssPreview asset={asset} insets={safeInsets} stretch={safeStretch} />
    </div>
  );
}

function IosCssPreview({ asset, insets, stretch }: { asset: BubbleAsset; insets: Insets; stretch: StretchPoint }) {
  const source = getIosSourceCanvas(asset);
  const sourceScale = getIosImageScale(asset);
  const css = getIosCssValues(insets, stretch, source.width, source.height, sourceScale);
  const scaleValues = getIosScaleValues(asset, insets, stretch);
  const imageBaseName = getIosCssImageName(asset);
  return (
    <div className="ios-css-preview">
      <div className="ios-css-row">
        <span>CSS point stretch</span>
        <strong>
          {css.stretchX}px {css.stretchY}px
        </strong>
      </div>
      <div className="ios-css-row">
        <span>title edgeInsets</span>
        <strong>
          {css.edgeTop}px {css.edgeLeft}px {css.edgeBottom}px {css.edgeRight}px
        </strong>
      </div>
      <div className="scale-table" aria-label="iOS scale converted values">
        <div>
          <span>기준</span>
          <strong>{scaleValues.sourceScale}x</strong>
        </div>
        <div>
          <span>@3x stretch</span>
          <strong>
            {scaleValues.stretch3x.x}px {scaleValues.stretch3x.y}px
          </strong>
        </div>
        <div>
          <span>@2x stretch</span>
          <strong>
            {scaleValues.stretch2x.x}px {scaleValues.stretch2x.y}px
          </strong>
        </div>
        <div>
          <span>CSS point</span>
          <strong>
            {scaleValues.stretchPoint.x}px {scaleValues.stretchPoint.y}px
          </strong>
        </div>
        <div className="wide-scale-row">
          <span>@3x edgeInsets</span>
          <strong>
            {formatInsets(scaleValues.insets3x)}
          </strong>
        </div>
        <div className="wide-scale-row">
          <span>@2x edgeInsets</span>
          <strong>
            {formatInsets(scaleValues.insets2x)}
          </strong>
        </div>
        <div className="wide-scale-row">
          <span>CSS edgeInsets</span>
          <strong>
            {formatInsets(scaleValues.insetsPoint)}
          </strong>
        </div>
      </div>
      <pre>{`-ios-background-image: '${imageBaseName}' ${css.stretchX}px ${css.stretchY}px;
-ios-title-edgeinsets: ${css.edgeTop}px ${css.edgeLeft}px ${css.edgeBottom}px ${css.edgeRight}px;`}</pre>
    </div>
  );
}

function InsetImage({ asset, insets, stretch }: { asset: BubbleAsset; insets: Insets; stretch: StretchPoint }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = getIosSourceCanvas(asset);
    const maxWidth = 360;
    const scale = Math.max(1, Math.floor(maxWidth / source.width));
    canvas.width = source.width * scale;
    canvas.height = source.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawChecker(ctx, canvas.width, canvas.height, 12);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    drawInsetOverlay(ctx, insets, stretch, source.width, source.height, scale);
  }, [asset, insets, stretch]);

  return <canvas className="patch-image" ref={canvasRef} aria-label="iOS cap inset preview" />;
}

function InsetControl({ label, value, max, onChange }: { label: InsetSide; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="inset-control">
      <span>
        {label}
        <strong>{value}px</strong>
      </span>
      <input type="range" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <input type="number" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
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
    <label className="inset-control stretch-point-control">
      <span>
        {label}
        <strong>{value}px</strong>
      </span>
      <input type="range" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <input type="number" min={0} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
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
    <div className="marker-control">
      <div className="marker-head">
        <strong>{label}</strong>
        <span>{help}</span>
      </div>
      <div className="range-row">
        <input
          type="range"
          min={1}
          max={usableMax}
          value={range.start}
          onChange={(event) => onChange({ ...range, start: Number(event.currentTarget.value) })}
        />
        <input
          type="range"
          min={1}
          max={usableMax}
          value={range.end}
          onChange={(event) => onChange({ ...range, end: Number(event.currentTarget.value) })}
        />
      </div>
      <div className="number-row">
        <label>
          start
          <input
            type="number"
            min={1}
            max={usableMax}
            value={range.start}
            onChange={(event) => onChange({ ...range, start: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          end
          <input
            type="number"
            min={1}
            max={usableMax}
            value={range.end}
            onChange={(event) => onChange({ ...range, end: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
    </div>
  );
}

function DownloadPanel({ asset, slot }: { asset: BubbleAsset; slot: BubbleSlot }) {
  const [name, setName] = useState(downloadNames[slot]);

  useEffect(() => {
    setName(downloadNames[slot]);
  }, [slot]);

  return (
    <div className="panel download-panel">
      <label>
        다운로드 파일명
        <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
      </label>
      <button className="primary-button" type="button" onClick={() => downloadNinePatch(asset, name)}>
        .9.png 다운로드
      </button>
    </div>
  );
}

function PreviewControls({
  config,
  setConfig,
}: {
  config: PreviewConfig;
  setConfig: React.Dispatch<React.SetStateAction<PreviewConfig>>;
}) {
  const setNumber = (key: PreviewSizeKey, value: number) => {
    setConfig((current) => sanitizePreviewConfig({ ...current, [key]: safePreviewNumber(value, key) }));
  };
  const safeConfig = sanitizePreviewConfig(config);

  return (
    <div className="preview-controls">
      <SizeSlider
        label="최대 너비"
        value={safeConfig.maxBubbleWidth}
        min={previewSizeLimits.maxBubbleWidth.min}
        max={previewSizeLimits.maxBubbleWidth.max}
        onChange={(value) => setNumber("maxBubbleWidth", value)}
      />
      <SizeSlider
        label="최소 너비"
        value={safeConfig.minBubbleWidth}
        min={previewSizeLimits.minBubbleWidth.min}
        max={previewSizeLimits.minBubbleWidth.max}
        onChange={(value) => setNumber("minBubbleWidth", value)}
      />
      <SizeSlider
        label="최소 높이"
        value={safeConfig.minBubbleHeight}
        min={previewSizeLimits.minBubbleHeight.min}
        max={previewSizeLimits.minBubbleHeight.max}
        onChange={(value) => setNumber("minBubbleHeight", value)}
      />
      <label className="wide">
        내 말풍선 문구
        <textarea
          value={config.meMessage}
          onChange={(event) => {
            const meMessage = event.currentTarget.value;
            setConfig((current) => ({ ...current, meMessage }));
          }}
        />
      </label>
      <label className="wide">
        상대 말풍선 문구
        <textarea
          value={config.youMessage}
          onChange={(event) => {
            const youMessage = event.currentTarget.value;
            setConfig((current) => ({ ...current, youMessage }));
          }}
        />
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={config.showContent}
          onChange={(event) => {
            const showContent = event.currentTarget.checked;
            setConfig((current) => ({ ...current, showContent }));
          }}
        />
        content 가이드
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={config.showStretch}
          onChange={(event) => {
            const showStretch = event.currentTarget.checked;
            setConfig((current) => ({ ...current, showStretch }));
          }}
        />
        stretch 가이드
      </label>
    </div>
  );
}

function SizeSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="size-slider">
      <span>
        {label}
        <strong>{value}px</strong>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

function ChatPreview({ me, you, config }: { me: BubbleAsset | null; you: BubbleAsset | null; config: PreviewConfig }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawChatPreview(ctx, { me, you, config });
  }, [me, you, config]);

  return (
    <div className="phone-frame">
      <canvas ref={canvasRef} width={previewCanvasWidth} height={1920} />
    </div>
  );
}

function drawChatPreview(
  ctx: CanvasRenderingContext2D,
  { me, you, config }: { me: BubbleAsset | null; you: BubbleAsset | null; config: PreviewConfig },
) {
  const safeConfig = sanitizePreviewConfig(config);
  const rawMessages = [
    { asset: you, mine: false, text: normalizePreviewText(safeConfig.youMessage, "you message") },
    { asset: me, mine: true, text: normalizePreviewText(safeConfig.meMessage, "my message") },
  ];
  const messages = rawMessages.map((message) => ({
    ...message,
    ...getAutoBubbleSize(ctx, message.asset, safeConfig, message.text),
  }));
  const gap = 72;
  const firstY = 282;
  const contentBottom = messages.reduce((bottom, message, index) => bottom + message.height + (index === messages.length - 1 ? 0 : gap), firstY);
  const footerY = Math.max(1746, contentBottom + 58);
  const canvasHeight = Math.max(1920, footerY + 174);

  if (ctx.canvas.width !== previewCanvasWidth) ctx.canvas.width = previewCanvasWidth;
  if (ctx.canvas.height !== canvasHeight) ctx.canvas.height = canvasHeight;

  ctx.clearRect(0, 0, previewCanvasWidth, canvasHeight);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#d9f8ff");
  gradient.addColorStop(1, "#98e8f4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, previewCanvasWidth, canvasHeight);

  ctx.fillStyle = "rgba(255,255,255,.86)";
  ctx.fillRect(0, 0, previewCanvasWidth, 134);
  ctx.fillStyle = "#14343a";
  ctx.font = "700 38px Segoe UI, sans-serif";
  ctx.fillText("9-Patch Preview", 54, 84);
  ctx.fillStyle = "#6c7b80";
  ctx.font = "24px Segoe UI, sans-serif";
  ctx.fillText("xxhdpi 1080 x 1920", 760, 84);

  drawDatePill(ctx, 174);
  let y = firstY;
  for (const message of messages) {
    const x = message.mine ? previewCanvasWidth - previewHorizontalInset - message.width : previewHorizontalInset;
    drawBubble(ctx, message.asset, x, y, message.width, message.height, message.text, safeConfig, message.mine);
    y += message.height + gap;
  }

  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.fillRect(0, footerY, previewCanvasWidth, 174);
  roundRect(ctx, 54, footerY + 38, 820, 80, 22);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#c8d7db";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#8a9ca2";
  ctx.font = "30px Segoe UI, sans-serif";
  ctx.fillText("message", 86, footerY + 88);
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  asset: BubbleAsset | null,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  config: PreviewConfig,
  mine: boolean,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;
  width = clamp(Math.round(width), 40, previewMaxBubbleRenderWidth);
  height = clamp(Math.round(height), 40, 2600);
  if (asset) {
    if (config.platform === "ios") {
      const source = getIosSourceCanvas(asset);
      const stretch = normalizeStretchPoint(config.iosStretch[asset.slot], source.width, source.height);
      const insets = normalizeInsets(config.iosInsets[asset.slot], source.width, source.height);
      renderCapInset(ctx, asset, stretch, x, y, width, height);
      if (config.showStretch) drawIosStretchGuide(ctx, stretch, x, y, width, height);
      if (config.showContent) drawIosContentGuide(ctx, insets, x, y, width, height);
    } else {
      renderNinePatch(ctx, asset, x, y, width, height);
      if (config.showStretch) drawStretchGuide(ctx, asset, x, y, width, height);
      if (config.showContent) drawContentGuide(ctx, asset, x, y, width, height);
    }
  } else {
    ctx.fillStyle = mine ? "#ffe27a" : "#ffffff";
    ctx.strokeStyle = "#14343a";
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, width, height, 18);
    ctx.fill();
    ctx.stroke();
  }

  const content = asset
    ? config.platform === "ios"
      ? mapIosContentRect(config.iosInsets[asset.slot], getIosSourceCanvas(asset).width, getIosSourceCanvas(asset).height, x, y, width, height)
      : mapContentRect(asset, x, y, width, height)
    : { x: x + 28, y: y + 20, width: width - 56, height: height - 40 };
  drawText(ctx, text, content.x + 12, content.y + 10, Math.max(24, content.width - 24), Math.max(24, content.height - 20));
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxHeight: number) {
  ctx.fillStyle = "#14343a";
  ctx.font = "34px Segoe UI, Noto Sans KR, sans-serif";
  const lineHeight = 42;
  const lines = wrapTextLines(ctx, text, maxWidth);
  const maxLines = Math.max(1, Math.min(lines.length, Math.floor(maxHeight / lineHeight)));
  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, x, y + 34 + index * lineHeight);
  });
}

function getAutoBubbleSize(ctx: CanvasRenderingContext2D, asset: BubbleAsset | null, config: PreviewConfig, text: string) {
  const maxWidth = clamp(config.maxBubbleWidth, previewSizeLimits.maxBubbleWidth.min, previewMaxBubbleRenderWidth);
  const minWidth = clamp(config.minBubbleWidth, previewSizeLimits.minBubbleWidth.min, Math.min(previewSizeLimits.minBubbleWidth.max, maxWidth));
  const minHeight = clamp(config.minBubbleHeight, previewSizeLimits.minBubbleHeight.min, previewSizeLimits.minBubbleHeight.max);
  let width = clamp(Math.round(config.minBubbleWidth), minWidth, maxWidth);
  let height = clamp(Math.round(config.minBubbleHeight), minHeight, 1400);
  ctx.font = "34px Segoe UI, Noto Sans KR, sans-serif";

  for (let index = 0; index < 12; index += 1) {
    const content = getPreviewContentRect(asset, config, 0, 0, width, height);
    const textWidth = Math.max(24, content.width - 24);
    const lines = wrapTextLines(ctx, text, textWidth);
    const requiredContentHeight = lines.length * 42 + 28;
    const longestLine = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
    const widthDeficit = longestLine + 32 - content.width;
    const heightDeficit = requiredContentHeight - content.height;
    if (widthDeficit <= 0 && heightDeficit <= 0) break;
    if (widthDeficit > 0 && width < maxWidth) {
      width = clamp(width + Math.ceil(widthDeficit), minWidth, maxWidth);
    } else if (heightDeficit > 0) {
      height = clamp(height + Math.ceil(heightDeficit), minHeight, 2600);
    } else {
      break;
    }
  }

  return { width, height };
}

function getPreviewContentRect(asset: BubbleAsset | null, config: PreviewConfig, x: number, y: number, width: number, height: number) {
  if (!asset) return { x: x + 28, y: y + 20, width: width - 56, height: height - 40 };
  if (config.platform === "ios") {
    const source = getIosSourceCanvas(asset);
    return mapIosContentRect(config.iosInsets[asset.slot], source.width, source.height, x, y, width, height);
  }
  return mapContentRect(asset, x, y, width, height);
}

function normalizePreviewText(value: string, fallback: string) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return normalized.length > 0 ? normalized : fallback;
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

function renderCapInset(
  ctx: CanvasRenderingContext2D,
  asset: BubbleAsset,
  stretch: StretchPoint,
  x: number,
  y: number,
  width: number,
  height: number,
) {
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

function drawContentGuide(ctx: CanvasRenderingContext2D, asset: BubbleAsset, x: number, y: number, width: number, height: number) {
  const rect = mapContentRect(asset, x, y, width, height);
  if (!isDrawableRect(rect)) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 64, 128, .7)";
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawStretchGuide(ctx: CanvasRenderingContext2D, asset: BubbleAsset, x: number, y: number, width: number, height: number) {
  const rect = mapStretchRect(asset, x, y, width, height);
  if (!isDrawableRect(rect)) return;
  ctx.save();
  ctx.fillStyle = "rgba(0, 150, 180, .18)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "rgba(0, 107, 122, .65)";
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawIosContentGuide(ctx: CanvasRenderingContext2D, insets: Insets, x: number, y: number, width: number, height: number) {
  const rect = {
    x: x + insets.left,
    y: y + insets.top,
    width: Math.max(1, width - insets.left - insets.right),
    height: Math.max(1, height - insets.top - insets.bottom),
  };
  if (!isDrawableRect(rect)) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 64, 128, .7)";
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawIosStretchGuide(ctx: CanvasRenderingContext2D, stretch: StretchPoint, x: number, y: number, width: number, height: number) {
  const rect = {
    x: x + stretch.x,
    y: y + stretch.y,
    width: 1,
    height: 1,
  };
  if (!isDrawableRect(rect)) return;
  ctx.save();
  ctx.fillStyle = "rgba(0, 150, 180, .18)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "rgba(0, 107, 122, .65)";
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawDatePill(ctx: CanvasRenderingContext2D, y: number) {
  roundRect(ctx, 408, y, 264, 48, 24);
  ctx.fillStyle = "rgba(20,52,58,.18)";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "24px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Today", 540, y + 32);
  ctx.textAlign = "left";
}

function drawOverflowNotice(ctx: CanvasRenderingContext2D, y: number) {
  const noticeY = Math.min(y, 1608);
  ctx.save();
  roundRect(ctx, 244, noticeY, 592, 54, 27);
  ctx.fillStyle = "rgba(20, 52, 58, .24)";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "24px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("아래 말풍선은 화면 밖으로 밀려 숨겼습니다", 540, noticeY + 36);
  ctx.textAlign = "left";
  ctx.restore();
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
  ctx.setLineDash([]);
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
  ctx.fillStyle = "#d94b5d";
  for (const pixel of asset.invalidPixels) ctx.fillRect(pixel.x * scale, pixel.y * scale, Math.max(2, scale), Math.max(2, scale));
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
  ctx.fillStyle = "#f4fafb";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e3eef1";
  for (let y = 0; y < height; y += size) {
    for (let x = (y / size) % 2 ? 0 : size; x < width; x += size * 2) {
      ctx.fillRect(x, y, size, size);
    }
  }
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
}

function normalizeRange(range: Range, max: number): Range {
  const start = clamp(Math.round(range.start), 1, max - 2);
  const end = clamp(Math.round(range.end), 2, max - 1);
  if (start >= end) return { start: Math.max(1, end - 1), end };
  return { start, end };
}

function normalizeInsets(insets: Insets | undefined, sourceWidth: number, sourceHeight: number): Insets {
  const fallback = initialConfig.iosInsets.me;
  const current = insets ?? fallback;
  const maxHorizontal = Math.max(0, Math.floor(sourceWidth - 1));
  const maxVertical = Math.max(0, Math.floor(sourceHeight - 1));
  const left = clamp(Math.round(current.left), 0, maxHorizontal);
  const right = clamp(Math.round(current.right), 0, Math.max(0, maxHorizontal - left));
  const top = clamp(Math.round(current.top), 0, maxVertical);
  const bottom = clamp(Math.round(current.bottom), 0, Math.max(0, maxVertical - top));
  return {
    top,
    right,
    bottom,
    left,
  };
}

function normalizeStretchPoint(stretch: StretchPoint | undefined, sourceWidth: number, sourceHeight: number): StretchPoint {
  const fallback = initialConfig.iosStretch.me;
  const current = stretch ?? fallback;
  return {
    x: clamp(Math.round(current.x), 0, Math.max(0, sourceWidth - 1)),
    y: clamp(Math.round(current.y), 0, Math.max(0, sourceHeight - 1)),
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

function getIosScaleValues(asset: BubbleAsset, insets: Insets, stretch: StretchPoint) {
  const source = getIosSourceCanvas(asset);
  const sourceScale = getIosImageScale(asset);
  const safeInsets = normalizeInsets(insets, source.width, source.height);
  const safeStretch = normalizeStretchPoint(stretch, source.width, source.height);
  const stretchPoint = scalePoint(safeStretch, 1 / sourceScale);
  const insetsPoint = scaleInsets(safeInsets, 1 / sourceScale);
  return {
    sourceScale,
    stretchPoint,
    stretch2x: scalePoint(stretchPoint, 2),
    stretch3x: scalePoint(stretchPoint, 3),
    insetsPoint,
    insets2x: scaleInsets(insetsPoint, 2),
    insets3x: scaleInsets(insetsPoint, 3),
  };
}

function getIosImageScale(asset: BubbleAsset) {
  const match = asset.name.match(/@([23])x\.png$/i);
  return match ? Number(match[1]) : 3;
}

function scalePoint(point: StretchPoint, scale: number): StretchPoint {
  return {
    x: Math.round(point.x * scale),
    y: Math.round(point.y * scale),
  };
}

function scaleInsets(insets: Insets, scale: number): Insets {
  return {
    top: Math.round(insets.top * scale),
    right: Math.round(insets.right * scale),
    bottom: Math.round(insets.bottom * scale),
    left: Math.round(insets.left * scale),
  };
}

function formatInsets(insets: Insets) {
  return `${insets.top}px ${insets.left}px ${insets.bottom}px ${insets.right}px`;
}

function getIosCssImageName(asset: BubbleAsset) {
  return asset.name
    .replace(/@(?:2|3)x(?=\.png$)/i, "")
    .replace(/\.9\.png$/i, ".png");
}

function getIosSourceCanvas(asset: BubbleAsset) {
  return asset.name.toLowerCase().endsWith(".9.png") ? asset.innerCanvas : asset.fullCanvas;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isDrawableRect(rect: { x: number; y: number; width: number; height: number }) {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function sanitizePreviewConfig(config: PreviewConfig): PreviewConfig {
  const maxBubbleWidth = safePreviewNumber(config.maxBubbleWidth, "maxBubbleWidth");
  const minBubbleWidth = clamp(
    safePreviewNumber(config.minBubbleWidth, "minBubbleWidth"),
    previewSizeLimits.minBubbleWidth.min,
    Math.min(previewSizeLimits.minBubbleWidth.max, maxBubbleWidth),
  );
  return {
    ...config,
    platform: config.platform === "ios" ? "ios" : "android",
    maxBubbleWidth,
    minBubbleWidth,
    minBubbleHeight: safePreviewNumber(config.minBubbleHeight, "minBubbleHeight"),
    meMessage: config.meMessage ?? "",
    youMessage: config.youMessage ?? "",
    iosInsets: {
      me: normalizeInsets(config.iosInsets?.me, 1000, 1000),
      you: normalizeInsets(config.iosInsets?.you, 1000, 1000),
    },
    iosStretch: {
      me: normalizeStretchPoint(config.iosStretch?.me, 1000, 1000),
      you: normalizeStretchPoint(config.iosStretch?.you, 1000, 1000),
    },
  };
}

function safePreviewNumber(value: number, key: PreviewSizeKey) {
  const fallback = initialConfig[key];
  const finite = Number.isFinite(value) ? value : fallback;
  const limit = previewSizeLimits[key];
  return clamp(Math.round(finite), limit.min, limit.max);
}

function readSavedState(): SavedState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    if (parsed.activeSlot !== "me" && parsed.activeSlot !== "you") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSavedState({
  activeSlot,
  config,
  assets,
}: {
  activeSlot: BubbleSlot;
  config: PreviewConfig;
  assets: Partial<Record<BubbleSlot, BubbleAsset>>;
}) {
  try {
    const savedAssets: Partial<Record<BubbleSlot, SavedAsset>> = {};
    for (const slot of ["me", "you"] as BubbleSlot[]) {
      const asset = assets[slot];
      if (!asset) continue;
      savedAssets[slot] = {
        name: asset.name,
        dataUrl: asset.dataUrl,
        markers: asset.markers,
      };
    }
    const payload: SavedState = {
      activeSlot,
      config,
      assets: savedAssets,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Storage can fail when the image payload is too large. The editor should keep working.
  }
}

export default App;
