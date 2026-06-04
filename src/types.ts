export type BubbleSlot = "me" | "you";
export type PlatformMode = "android" | "ios";

export type Range = {
  start: number;
  end: number;
};

export type Markers = {
  top: Range;
  left: Range;
  right: Range;
  bottom: Range;
};

export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type StretchPoint = {
  x: number;
  y: number;
};

export type InvalidPixel = {
  x: number;
  y: number;
  rgba: [number, number, number, number];
};

export type BubbleAsset = {
  slot: BubbleSlot;
  name: string;
  dataUrl: string;
  source: HTMLImageElement;
  fullCanvas: HTMLCanvasElement;
  innerCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  markers: Markers;
  invalidPixels: InvalidPixel[];
};

export type PreviewConfig = {
  platform: PlatformMode;
  maxBubbleWidth: number;
  minBubbleWidth: number;
  minBubbleHeight: number;
  meMessage: string;
  youMessage: string;
  showContent: boolean;
  showStretch: boolean;
  iosInsets: Record<BubbleSlot, Insets>;
  iosStretch: Record<BubbleSlot, StretchPoint>;
};
