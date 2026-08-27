import { getOpaqueContentBox } from "@/lib/theme/bubbleBuilder/alphaBounds";
import { crossesBubbleStretch, getAndroidBubbleMarkers, getBubbleDecorationContentRect, getBubbleDecorationLayers, getBubbleDecorationSize, getBubbleVariantGeometry, getIosBubbleGeometry, rectsOverlap } from "@/lib/theme/bubbleBuilder/geometry";
import type { BubbleBuilderVariant, BubbleDecorationContentBox, BubbleDecorationLayer, BubbleFamilyDesignSpec, BubbleRect, GeneratedBubbleAsset, GeneratedBubbleDesign, GeneratedBubbleFamily } from "@/lib/theme/bubbleBuilder/types";
import type { BubbleGeometry, Markers, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

type GenerateBubbleFamilyOptions = {
  spec: BubbleFamilyDesignSpec;
  platform: ThemePlatform;
  decorationFiles?: Partial<Record<string, File>>;
};

type GenerateBubbleAssetOptions = GenerateBubbleFamilyOptions & { variant: BubbleBuilderVariant };

type DecorationBitmap = { layer: BubbleDecorationLayer; bitmap: ImageBitmap; content: BubbleDecorationContentBox };

async function loadDecorationBitmaps(spec: BubbleFamilyDesignSpec, decorationFiles?: Partial<Record<string, File>>): Promise<DecorationBitmap[]> {
  if (!decorationFiles) return [];
  const layers = getBubbleDecorationLayers(spec);
  const loaded = await Promise.all(
    layers.map(async (layer) => {
      const file = decorationFiles[layer.id];
      if (!file) return null;
      const bitmap = await createImageBitmap(file);
      // 경고 판정이 미리보기와 같아야 한다. 여백을 빼고 실제 그림이 어디 있는지 여기서도 잰다.
      return { layer, bitmap, content: getOpaqueContentBox(bitmap, bitmap.width, bitmap.height) };
    }),
  );
  return loaded.filter((item): item is DecorationBitmap => item !== null);
}

function closeDecorationBitmaps(decorations: DecorationBitmap[]) {
  for (const item of decorations) item.bitmap.close();
}

export async function generateBubbleAsset({ spec, platform, variant, decorationFiles }: GenerateBubbleAssetOptions): Promise<GeneratedBubbleDesign> {
  const decorations = await loadDecorationBitmaps(spec, decorationFiles);
  try {
    const { asset, warnings } = await renderBubbleAsset(spec, platform, variant, decorations);
    return { spec, asset, warnings };
  } finally {
    closeDecorationBitmaps(decorations);
  }
}

export async function generateBubbleFamily({ spec, platform, decorationFiles }: GenerateBubbleFamilyOptions): Promise<GeneratedBubbleFamily> {
  const decorations = await loadDecorationBitmaps(spec, decorationFiles);
  const warnings: GeneratedBubbleFamily["warnings"] = [];
  try {
    const assets = await Promise.all(
      (["first", "group"] as const).map(async (variant) => {
        const rendered = await renderBubbleAsset(spec, platform, variant, variant === "first" ? decorations : []);
        warnings.push(...rendered.warnings);
        return rendered.asset;
      }),
    );
    return { spec, assets, warnings: dedupeWarnings(warnings) };
  } finally {
    closeDecorationBitmaps(decorations);
  }
}

async function renderBubbleAsset(spec: BubbleFamilyDesignSpec, platform: ThemePlatform, variant: BubbleBuilderVariant, decorations: DecorationBitmap[] = []) {
  const geometry = getBubbleVariantGeometry(spec.design, variant);
  const artwork = document.createElement("canvas");
  artwork.width = geometry.canvas.width;
  artwork.height = geometry.canvas.height;
  const context = getCanvasContext(artwork);
  const warnings: GeneratedBubbleDesign["warnings"] = [];
  context.clearRect(0, 0, artwork.width, artwork.height);
  drawBubbleBody(context, geometry.body, geometry.radius, spec.design);

  for (const { layer, bitmap, content } of decorations) {
    drawDecoration(context, bitmap, artwork.width, artwork.height, layer);
    /*
      판정은 **보이는 그림**의 사각형으로 한다.

      이 경고는 적용 직후 알림 문구로도 나간다(`ProjectImporterClient`). 원본 파일 전체를 세면
      투명 여백이 글자 영역에 걸치기만 해도 `글자 영역과 겹쳐요`가 떠서, 실제로는 아무것도
      가리지 않았는데 사용자가 그림을 옮기게 만든다.
    */
    const visible = getBubbleDecorationContentRect(layer, geometry.canvas, bitmap, content);
    if (rectsOverlap(visible, geometry.content)) warnings.push({ code: "decoration-overlap", message: "꾸미기 이미지가 글자 영역과 겹쳐요." });
    if (crossesBubbleStretch(visible, geometry.stretch)) warnings.push({ code: "decoration-stretch", message: "꾸미기 이미지가 늘어나는 선을 지나가요." });
  }
  if (geometry.content.width < 24 || geometry.content.height < 24) warnings.push({ code: "content-too-small", message: "글자가 들어갈 영역이 너무 작아요." });

  const asset = platform === "android"
    ? await renderAndroidAsset(artwork, geometry, spec.design.side, variant)
    : await renderIosAsset(artwork, geometry, spec.design.side, variant);
  return { asset, warnings };
}

function drawBubbleBody(
  context: CanvasRenderingContext2D,
  body: BubbleRect,
  radius: number,
  design: BubbleFamilyDesignSpec["design"],
) {
  context.save();
  roundedRectPath(context, body, radius);
  context.fillStyle = design.fill;
  context.fill();
  context.restore();

  if (design.borderWidth > 0) {
    context.save();
    roundedRectPath(context, body, radius);
    context.strokeStyle = design.borderColor;
    context.lineWidth = design.borderWidth;
    context.stroke();
    context.restore();
  }
}

function drawDecoration(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  decoration: BubbleDecorationLayer,
) {
  // 미리보기와 같은 계산을 쓴다. 두 곳이 갈라지면 화면에서 맞춘 자리가 결과물에서 어긋난다.
  const { width, height } = getBubbleDecorationSize(decoration, bitmap);
  const centerX = canvasWidth / 2 + decoration.offsetX;
  const centerY = canvasHeight / 2 + decoration.offsetY;

  context.save();
  context.translate(centerX, centerY);
  if (decoration.rotation) context.rotate((decoration.rotation * Math.PI) / 180);
  if (decoration.flipX) context.scale(-1, 1);
  context.drawImage(bitmap, -width / 2, -height / 2, width, height);
  context.restore();
}

async function renderAndroidAsset(
  artwork: HTMLCanvasElement,
  geometry: ReturnType<typeof getBubbleVariantGeometry>,
  side: BubbleFamilyDesignSpec["side"],
  variant: BubbleBuilderVariant,
): Promise<GeneratedBubbleAsset> {
  const markers = getAndroidBubbleMarkers(geometry);
  const bubbleGeometry: BubbleGeometry = {
    stretch: geometry.stretch,
    contentInsets: {
      top: geometry.content.y,
      right: geometry.canvas.width - geometry.content.x - geometry.content.width,
      bottom: geometry.canvas.height - geometry.content.y - geometry.content.height,
      left: geometry.content.x,
    },
  };
  const canvas = document.createElement("canvas");
  canvas.width = artwork.width + 2;
  canvas.height = artwork.height + 2;
  const context = getCanvasContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(artwork, 1, 1);
  drawNinePatchMarkers(context, markers, canvas.width, canvas.height);
  const role = roleFor(side, variant);
  return {
    platform: "android",
    role,
    variant,
    file: new File([await canvasToPngBlob(canvas)], androidFileName(side, variant), { type: "image/png" }),
    geometry: bubbleGeometry,
    markers,
  };
}

async function renderIosAsset(
  artwork: HTMLCanvasElement,
  geometry: ReturnType<typeof getBubbleVariantGeometry>,
  side: BubbleFamilyDesignSpec["side"],
  variant: BubbleBuilderVariant,
): Promise<GeneratedBubbleAsset> {
  const { insets, stretch } = getIosBubbleGeometry(geometry);
  return {
    platform: "ios",
    role: roleFor(side, variant),
    variant,
    file: new File([await canvasToPngBlob(artwork)], iosFileName(side, variant), { type: "image/png" }),
    geometry: {
      stretch,
      contentInsets: insets,
    },
    insets,
    stretch,
  };
}

function drawNinePatchMarkers(context: CanvasRenderingContext2D, markers: Markers, width: number, height: number) {
  context.fillStyle = "#000000";
  context.fillRect(markers.top.start, 0, markers.top.end - markers.top.start, 1);
  context.fillRect(0, markers.left.start, 1, markers.left.end - markers.left.start);
  context.fillRect(width - 1, markers.right.start, 1, markers.right.end - markers.right.start);
  context.fillRect(markers.bottom.start, height - 1, markers.bottom.end - markers.bottom.start, 1);
}

function roundedRectPath(context: CanvasRenderingContext2D, rect: BubbleRect, radius: number) {
  const safeRadius = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  context.beginPath();
  context.moveTo(rect.x + safeRadius, rect.y);
  context.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, safeRadius);
  context.arcTo(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, safeRadius);
  context.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, safeRadius);
  context.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, safeRadius);
  context.closePath();
}

function roleFor(side: BubbleFamilyDesignSpec["side"], variant: BubbleBuilderVariant): ThemeResourceRole {
  if (side === "me") return variant === "first" ? "bubble_me_1" : "bubble_me_2";
  return variant === "first" ? "bubble_you_1" : "bubble_you_2";
}

function androidFileName(side: BubbleFamilyDesignSpec["side"], variant: BubbleBuilderVariant) {
  return `theme_chatroom_bubble_${side === "me" ? "me" : "you"}_${variant === "first" ? "01" : "02"}_image.9.png`;
}

function iosFileName(side: BubbleFamilyDesignSpec["side"], variant: BubbleBuilderVariant) {
  const direction = side === "me" ? "Send" : "Receive";
  return `chatroomBubble${direction}${variant === "first" ? "01" : "02"}@3x.png`;
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("말풍선 캔버스를 준비하지 못했습니다.");
  return context;
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("말풍선 PNG를 만들지 못했습니다."))), "image/png");
  });
}

function dedupeWarnings(warnings: GeneratedBubbleFamily["warnings"]) {
  return warnings.filter((warning, index) => warnings.findIndex((candidate) => candidate.code === warning.code) === index);
}
