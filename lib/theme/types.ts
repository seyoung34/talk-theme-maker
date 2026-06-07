export type BubbleSlot = "me" | "you";
export type PlatformMode = "android" | "ios";
export type ThemePlatform = "android" | "ios";
export type ThemeScreen = "chatroom" | "friends" | "tabs" | "profile";
export type ThemeSection = "main" | "tabs" | "chatroom";
export type ThemeSlotGroup = "background" | "header" | "list" | "bar" | "icons" | "bubbles" | "input";
export type ThemeSlotKind = "image" | "ninepatch" | "color";

export type ThemeResourceRole =
  | "chat_background"
  | "chat_background_color"
  | "bubble_me_1"
  | "bubble_me_2"
  | "bubble_you_1"
  | "bubble_you_2"
  | "main_background"
  | "main_header_color"
  | "main_title_color"
  | "main_body_color"
  | "tab_background"
  | "tab_icon_friends"
  | "tab_icon_friends_focused"
  | "tab_icon_chats"
  | "tab_icon_chats_focused"
  | "tab_icon_now"
  | "tab_icon_now_focused"
  | "tab_icon_shopping"
  | "tab_icon_shopping_focused"
  | "tab_icon_more"
  | "tab_icon_more_focused"
  | "chat_input_background_color"
  | "chat_send_button_color"
  | "profile_image"
  | "passcode"
  | "splash"
  | "unknown";

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

export type ThemeProjectSummary = {
  platform: ThemePlatform;
  rootName: string;
  screens: ThemeScreen[];
  resourceCount: number;
  diagnosticsCount: number;
};
