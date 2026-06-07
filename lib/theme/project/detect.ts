import type { ThemePlatform, ThemeResourceRole, ThemeScreen } from "@/lib/theme/types";
import type { ThemeProjectAnalysis, ThemeProjectDiagnostic, ThemeProjectFile, ThemeProjectResource } from "@/lib/theme/project/types";

const androidRequired = [
  "src/main/theme/drawable-xxhdpi/theme_chatroom_background_image.png",
  "src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_me_01_image.9.png",
  "src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_you_01_image.9.png",
];

const iosRequired = [
  "KakaoTalkTheme.css",
  "Images/chatroomBgImage@3x.png",
  "Images/chatroomBubbleSend01@3x.png",
  "Images/chatroomBubbleReceive01@3x.png",
];

export function analyzeThemeProject(files: ThemeProjectFile[], rootName = "Selected folder"): ThemeProjectAnalysis {
  const normalizedFiles = files.map((file) => ({ ...file, path: normalizePath(file.path) }));
  const platform = detectPlatform(normalizedFiles);
  const resources = normalizedFiles.map((file) => toResource(file, platform)).filter((resource): resource is ThemeProjectResource => resource !== null);
  const diagnostics = collectDiagnostics(normalizedFiles, platform);
  const screens = Array.from(new Set(resources.map((resource) => resource.screen)));

  return {
    summary: {
      platform,
      rootName,
      screens: screens.length > 0 ? screens : ["chatroom"],
      resourceCount: resources.length,
      diagnosticsCount: diagnostics.length,
    },
    files: normalizedFiles,
    resources,
    diagnostics,
  };
}

function detectPlatform(files: ThemeProjectFile[]): ThemePlatform {
  const paths = files.map((file) => file.path);
  const hasIosCss = paths.some((path) => path.endsWith("KakaoTalkTheme.css"));
  const hasIosImages = paths.some((path) => path.includes("/Images/") || path.startsWith("Images/"));
  const hasAndroidTheme = paths.some((path) => path.includes("/src/main/theme/") || path.startsWith("src/main/theme/"));
  const hasAndroidManifest = paths.some((path) => path.endsWith("AndroidManifest.xml"));

  if (hasIosCss && hasIosImages) return "ios";
  if (hasAndroidTheme || hasAndroidManifest) return "android";
  return "android";
}

function toResource(file: ThemeProjectFile, platform: ThemePlatform): ThemeProjectResource | null {
  if (!isImageLike(file.name) && !file.name.endsWith(".css") && !file.name.endsWith(".xml")) return null;
  const role = detectRole(file.path, file.name, platform);
  if (role === "unknown") return null;
  const screen = roleToScreen(role);
  return {
    id: `${platform}:${role}:${file.path}`,
    platform,
    role,
    screen,
    filePath: file.path,
  };
}

function detectRole(path: string, name: string, platform: ThemePlatform): ThemeResourceRole {
  if (platform === "android") {
    if (name === "theme_chatroom_background_image.png") return "chat_background";
    if (name === "theme_chatroom_bubble_me_01_image.9.png") return "bubble_me_1";
    if (name === "theme_chatroom_bubble_me_02_image.9.png") return "bubble_me_2";
    if (name === "theme_chatroom_bubble_you_01_image.9.png") return "bubble_you_1";
    if (name === "theme_chatroom_bubble_you_02_image.9.png") return "bubble_you_2";
    if (name === "theme_background_image.png") return "main_background";
    if (name === "theme_maintab_cell_image.9.png") return "tab_background";
    if (name === "theme_maintab_ico_friends_image.png") return "tab_icon_friends";
    if (name === "theme_maintab_ico_friends_focused_image.png") return "tab_icon_friends_focused";
    if (name === "theme_maintab_ico_chats_image.png") return "tab_icon_chats";
    if (name === "theme_maintab_ico_chats_focused_image.png") return "tab_icon_chats_focused";
    if (name === "theme_maintab_ico_tab3_image.png") return "tab_icon_now";
    if (name === "theme_maintab_ico_tab3_focused_image.png") return "tab_icon_now_focused";
    if (name === "theme_maintab_ico_tab4_image.png") return "tab_icon_shopping";
    if (name === "theme_maintab_ico_tab4_focused_image.png") return "tab_icon_shopping_focused";
    if (name === "theme_maintab_ico_more_image.png") return "tab_icon_more";
    if (name === "theme_maintab_ico_more_focused_image.png") return "tab_icon_more_focused";
    if (name.startsWith("theme_profile_")) return "profile_image";
    if (name.startsWith("theme_passcode_")) return "passcode";
    if (name === "theme_splash_image.png") return "splash";
    return "unknown";
  }

  if (name.startsWith("chatroomBgImage")) return "chat_background";
  if (name.startsWith("chatroomBubbleSend01")) return "bubble_me_1";
  if (name.startsWith("chatroomBubbleSend02")) return "bubble_me_2";
  if (name.startsWith("chatroomBubbleReceive01")) return "bubble_you_1";
  if (name.startsWith("chatroomBubbleReceive02")) return "bubble_you_2";
  if (name.startsWith("mainBgImage")) return "main_background";
  if (name.startsWith("maintabIcoFriendsFocused")) return "tab_icon_friends_focused";
  if (name.startsWith("maintabIcoFriends")) return "tab_icon_friends";
  if (name.startsWith("maintabIcoChatsFocused")) return "tab_icon_chats_focused";
  if (name.startsWith("maintabIcoChats")) return "tab_icon_chats";
  if (name.startsWith("maintabIcoTab3Focused")) return "tab_icon_now_focused";
  if (name.startsWith("maintabIcoTab3")) return "tab_icon_now";
  if (name.startsWith("maintabIcoTab4Focused")) return "tab_icon_shopping_focused";
  if (name.startsWith("maintabIcoTab4")) return "tab_icon_shopping";
  if (name.startsWith("maintabIcoMoreFocused")) return "tab_icon_more_focused";
  if (name.startsWith("maintabIcoMore")) return "tab_icon_more";
  if (name.startsWith("profileImg")) return "profile_image";
  if (name.startsWith("passcode")) return "passcode";
  if (path.endsWith("KakaoTalkTheme.css")) return "unknown";
  return "unknown";
}

function roleToScreen(role: ThemeResourceRole): ThemeScreen {
  if (role === "chat_background" || role.startsWith("bubble_") || role === "chat_input_background_color" || role === "chat_send_button_color") return "chatroom";
  if (role === "tab_background" || role.startsWith("tab_icon_")) return "tabs";
  if (role === "main_background" || role === "main_header_color" || role === "main_title_color" || role === "main_body_color") return "friends";
  if (role === "profile_image") return "profile";
  return "friends";
}

function collectDiagnostics(files: ThemeProjectFile[], platform: ThemePlatform): ThemeProjectDiagnostic[] {
  const paths = new Set(files.map((file) => file.path));
  const diagnostics: ThemeProjectDiagnostic[] = [];
  const required = platform === "ios" ? iosRequired : androidRequired;

  for (const requiredPath of required) {
    if (!hasPath(paths, requiredPath)) {
      diagnostics.push({
        level: "warning",
        message: `Missing expected ${platform} resource`,
        filePath: requiredPath,
      });
    }
  }

  if (platform === "ios") {
    diagnostics.push(...collectIosScaleDiagnostics(files));
  }

  if (platform === "android") {
    const ninePatchNames = files.filter((file) => file.name.endsWith(".9.png"));
    if (ninePatchNames.length === 0) {
      diagnostics.push({ level: "warning", message: "No Android .9.png resources were found." });
    }
  }

  return diagnostics;
}

function collectIosScaleDiagnostics(files: ThemeProjectFile[]): ThemeProjectDiagnostic[] {
  const imageNames = new Set(files.filter((file) => isImageLike(file.name)).map((file) => file.name));
  const diagnostics: ThemeProjectDiagnostic[] = [];
  for (const name of imageNames) {
    const base = name.replace(/@(?:2|3)x(?=\.png$)/i, "");
    if (name.includes("@3x") && !imageNames.has(base.replace(".png", "@2x.png"))) {
      diagnostics.push({ level: "info", message: "Missing @2x pair for @3x image", filePath: name });
    }
    if (name.includes("@2x") && !imageNames.has(base.replace(".png", "@3x.png"))) {
      diagnostics.push({ level: "info", message: "Missing @3x pair for @2x image", filePath: name });
    }
  }
  return diagnostics;
}

function hasPath(paths: Set<string>, expected: string) {
  const normalizedExpected = normalizePath(expected);
  for (const path of paths) {
    if (path.endsWith(normalizedExpected)) return true;
  }
  return false;
}

function isImageLike(name: string) {
  return /\.(?:png|jpg|jpeg|webp)$/i.test(name);
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}
