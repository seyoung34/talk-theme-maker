import { getAndroidBubbleMarkers, getBubbleVariantGeometry, getIosBubbleGeometry, rectsOverlap } from "@/lib/theme/bubbleBuilder/geometry";
import type { BubbleBuilderVariant, BubbleFamilyDesignSpec, BubbleRect, GeneratedBubbleAsset, GeneratedBubbleFamily } from "@/lib/theme/bubbleBuilder/types";
import type { Markers, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

type GenerateBubbleFamilyOptions = {
  spec: BubbleFamilyDesignSpec;
  platform: ThemePlatform;
  decorationFile?: File;
};

export async function generateBubbleFamily({ spec, platform, decorationFile }: GenerateBubbleFamilyOptions): Promise<GeneratedBubbleFamily> {
  const decoration = decorationFile ? await createImageBitmap(decorationFile) : undefined;
  const warnings: GeneratedBubbleFamily["warnings"] = [];
  try {
    const assets = await Promise.all(
      (["first", "group"] as const).map(async (variant) => {
        const geometry = getBubbleVariantGeometry(spec.design, variant);
        const artwork = document.createElement("canvas");
        artwork.width = geometry.canvas.width;
        artwork.height = geometry.canvas.height;
        const context = getCanvasContext(artwork);
        context.clearRect(0, 0, artwork.width, artwork.height);
        drawBubbleBody(context, geometry.body, geometry.radius, spec.design);

        if (decoration && spec.design.decoration && variant === "first") {
          const decorationRect = drawDecoration(context, decoration, artwork.width, artwork.height, spec.design.decoration);
          if (rectsOverlap(decorationRect, geometry.content)) {
            warnings.push({ code: "decoration-overlap", message: "꾸미기 이미지가 글자 영역과 겹쳐요." });
          }
        }

        if (geometry.content.width < 24 || geometry.content.height < 24) {
          warnings.push({ code: "content-too-small", message: "글자가 들어갈 영역이 너무 작아요." });
        }

        return platform === "android"
          ? renderAndroidAsset(artwork, geometry, spec.design.side, variant)
          : renderIosAsset(artwork, geometry, spec.design.side, variant);
      }),
    );
    return { spec, assets, warnings: dedupeWarnings(warnings) };
  } finally {
    decoration?.close();
  }
}

function drawBubbleBody(
  context: CanvasRenderingContext2D,
  body: BubbleRect,
  radius: number,
  design: BubbleFamilyDesignSpec["design"],
) {
  context.save();
  if (design.shadow === "soft") {
    context.shadowColor = "rgba(15, 23, 42, 0.18)";
    context.shadowBlur = 6;
    context.shadowOffsetY = 3;
  }
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
  decoration: NonNullable<BubbleFamilyDesignSpec["design"]["decoration"]>,
): BubbleRect {
  const baseScale = Math.min(1, 90 / Math.max(bitmap.width, bitmap.height));
  const scale = baseScale * Math.max(0.1, Math.min(2, decoration.scale));
  const width = Math.max(1, bitmap.width * scale);
  const height = Math.max(1, bitmap.height * scale);
  const x = canvasWidth / 2 + decoration.offsetX - width / 2;
  const y = canvasHeight / 2 + decoration.offsetY - height / 2;

  context.save();
  if (decoration.flipX) {
    context.translate(x + width, y);
    context.scale(-1, 1);
    context.drawImage(bitmap, 0, 0, width, height);
  } else {
    context.drawImage(bitmap, x, y, width, height);
  }
  context.restore();
  return { x, y, width, height };
}

async function renderAndroidAsset(
  artwork: HTMLCanvasElement,
  geometry: ReturnType<typeof getBubbleVariantGeometry>,
  side: BubbleFamilyDesignSpec["side"],
  variant: BubbleBuilderVariant,
): Promise<GeneratedBubbleAsset> {
  const markers = getAndroidBubbleMarkers(geometry);
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
