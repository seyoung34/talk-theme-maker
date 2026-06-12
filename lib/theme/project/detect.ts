import type { ThemePlatform, ThemeResourceRole, ThemeScreen } from "@/lib/theme/types";
import type { ThemeProjectAnalysis, ThemeProjectDiagnostic, ThemeProjectFile, ThemeProjectResource } from "@/lib/theme/project/types";

const androidRequired = [
  "src/main/theme/drawable-xxhdpi/theme_chatroom_background_image.png",
  "src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_me_01_image.9.png",
  "src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_you_01_image.9.png",
  "src/main/theme/drawable-xxhdpi/icon.png",
  "src/main/theme/drawable-xxhdpi/theme_profile_01_image.png",
  "src/main/theme/drawable-nodpi/theme_profile_01_image_full.png",
];

const iosRequired = [
  "Kakao Talk Theme.css",
  "Images/chatroomBgImage.png",
  "Images/chatroomBubbleSend01.png",
  "Images/chatroomBubbleReceive01.png",
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
  const hasIosCss = paths.some((path) => path.endsWith("KakaoTalkTheme.css") || path.endsWith("Kakao Talk Theme.css"));
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
    if (name === "icon.png") return "theme_icon";
    if (name === "theme_chatroom_background_image.png") return "chat_background";
    if (name === "theme_chatroom_bubble_me_01_image.9.png") return "bubble_me_1";
    if (name === "theme_chatroom_bubble_me_02_image.9.png") return "bubble_me_2";
    if (name === "theme_chatroom_bubble_you_01_image.9.png") return "bubble_you_1";
    if (name === "theme_chatroom_bubble_you_02_image.9.png") return "bubble_you_2";
    if (name === "theme_background_image.png") return "main_background";
    if (name === "theme_maintab_cell_image.9.png") return "tab_background_image";
    if (name === "theme_maintab_ico_friends_image.png") return "tab_icon_friends";
    if (name === "theme_maintab_ico_friends_focused_image.png") return "tab_icon_friends_focused";
    if (name === "theme_maintab_ico_chats_image.png") return "tab_icon_chats";
    if (name === "theme_maintab_ico_chats_focused_image.png") return "tab_icon_chats_focused";
    if (name === "theme_maintab_ico_tab3_image.png" || name === "theme_maintab_ico_now_image.png") return "tab_icon_now";
    if (name === "theme_maintab_ico_tab3_focused_image.png" || name === "theme_maintab_ico_now_focused_image.png") return "tab_icon_now_focused";
    if (name === "theme_maintab_ico_tab4_image.png" || name === "theme_maintab_ico_shopping_image.png") return "tab_icon_shopping";
    if (name === "theme_maintab_ico_tab4_focused_image.png" || name === "theme_maintab_ico_shopping_focused_image.png") return "tab_icon_shopping_focused";
    if (name === "theme_maintab_ico_more_image.png") return "tab_icon_more";
    if (name === "theme_maintab_ico_more_focused_image.png") return "tab_icon_more_focused";
    if (name === "ic_launcher.png") return "launcher_icon";
    if (name === "ic_launcher_round.png") return "launcher_round";
    if (name === "ic_launcher_background.png") return "launcher_background";
    if (name === "ic_launcher_foreground.png") return "launcher_foreground";
    if (name === "theme_profile_01_image.png") return "profile_image_1";
    if (name === "theme_profile_02_image.png") return "profile_image_2";
    if (name === "theme_profile_03_image.png") return "profile_image_3";
    if (name === "theme_profile_01_image_full.png") return "profile_image_full_1";
    if (name === "theme_profile_02_image_full.png") return "profile_image_full_2";
    if (name === "theme_profile_03_image_full.png") return "profile_image_full_3";
    if (name.startsWith("theme_profile_")) return "profile_image";
    if (name === "theme_passcode_background_image.png") return "passcode_background";
    if (name.startsWith("theme_passcode_")) return "passcode";
    if (name === "theme_splash_image.png") return "splash";
    return "unknown";
  }

  if (name.startsWith("commonIcoTheme")) return "theme_icon";
  if (name.startsWith("profileImg01")) return "profile_image_1";
  if (name.startsWith("findBtnAddFriend")) return "find_add_friend";
  if (name.startsWith("chatroomBgImage")) return "chat_background";
  if (name.startsWith("chatroomBubbleSend01")) return "bubble_me_1";
  if (name.startsWith("chatroomBubbleSend02")) return "bubble_me_2";
  if (name.startsWith("chatroomBubbleReceive01")) return "bubble_you_1";
  if (name.startsWith("chatroomBubbleReceive02")) return "bubble_you_2";
  if (name.startsWith("mainBgImage")) return "main_background";
  if (name.startsWith("maintabBgImage")) return "tab_background_image";
  if (name.startsWith("maintabIcoFriendsSelected") || name.startsWith("maintabIcoFriendsFocused")) return "tab_icon_friends_focused";
  if (name.startsWith("maintabIcoFriends")) return "tab_icon_friends";
  if (name.startsWith("maintabIcoChatsSelected") || name.startsWith("maintabIcoChatsFocused")) return "tab_icon_chats_focused";
  if (name.startsWith("maintabIcoChats")) return "tab_icon_chats";
  if (name.startsWith("maintabIcoNowSelected") || name.startsWith("maintabIcoTab3Focused")) return "tab_icon_now_focused";
  if (name.startsWith("maintabIcoNow") || name.startsWith("maintabIcoTab3")) return "tab_icon_now";
  if (name.startsWith("maintabIcoShoppingSelected") || name.startsWith("maintabIcoTab4Focused")) return "tab_icon_shopping_focused";
  if (name.startsWith("maintabIcoShopping") || name.startsWith("maintabIcoTab4")) return "tab_icon_shopping";
  if (name.startsWith("maintabIcoMoreSelected") || name.startsWith("maintabIcoMoreFocused")) return "tab_icon_more_focused";
  if (name.startsWith("maintabIcoMore")) return "tab_icon_more";
  if (name.startsWith("profileImg")) return "profile_image";
  if (name.startsWith("passcode")) return "passcode";
  if (path.endsWith("KakaoTalkTheme.css") || path.endsWith("Kakao Talk Theme.css")) return "unknown";
  return "unknown";
}

function roleToScreen(role: ThemeResourceRole): ThemeScreen {
  if (
    role === "chat_background" ||
    role.startsWith("bubble_") ||
    role === "chat_input_background_color" ||
    role === "chat_send_button_color" ||
    role === "chat_input_text_color" ||
    role === "chat_send_icon_color"
  )
    return "chatroom";
  if (role === "tab_background" || role === "tab_background_image" || role.startsWith("tab_icon_")) return "tabs";
  if (role === "main_background" || role === "main_header_color" || role === "main_title_color" || role === "main_body_color") return "friends";
  if (role === "passcode" || role.startsWith("passcode_")) return "passcode";
  if (role === "theme_icon" || role.startsWith("launcher_") || role === "profile_image" || role.startsWith("profile_image_")) return "profile";
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
        code: "missing-required-resource",
        message: `Missing expected ${platform} resource`,
        filePath: requiredPath,
        fixHint: "필수 파일이 있는지 확인하고 올바른 경로로 다시 넣으세요.",
      });
    }
  }

  if (platform === "ios") {
    diagnostics.push(...collectIosScaleDiagnostics(files));
  }

  if (platform === "android") {
    const ninePatchNames = files.filter((file) => file.name.endsWith(".9.png"));
    if (ninePatchNames.length === 0) {
      diagnostics.push({ level: "warning", code: "missing-ninepatch", message: "No Android .9.png resources were found.", fixHint: "Android 말풍선이나 바 영역용 .9.png 파일을 추가하세요." });
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
      diagnostics.push({ level: "info", code: "missing-2x-pair", message: "Missing @2x pair for @3x image", filePath: name, fixHint: "@3x에 대응하는 @2x 파일을 같이 준비하세요." });
    }
    if (name.includes("@2x") && !imageNames.has(base.replace(".png", "@3x.png"))) {
      diagnostics.push({ level: "info", code: "missing-3x-pair", message: "Missing @3x pair for @2x image", filePath: name, fixHint: "@2x에 대응하는 @3x 파일을 같이 준비하세요." });
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
