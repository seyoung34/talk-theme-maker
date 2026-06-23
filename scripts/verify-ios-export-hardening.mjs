import { applyServerThemeIdentifier, normalizeIosPath, validateExportName, validateIosPackage, validateVersionName } from "../lib/theme/ios/packageValidation.ts";
import { createStoredZipBytes } from "../lib/theme/project/zip.ts";

const encoder = new TextEncoder();
const css = encoder.encode("ManifestStyle { -kakaotalk-theme-name: 'Test'; -kakaotalk-theme-version: '1.0.0'; -kakaotalk-theme-id: 'com.kakao.talk.theme.test'; } Tab { -ios-image: 'icon.png'; }");
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const validEntries = [
  { path: "KakaoTalkTheme.css", bytes: css },
  { path: "Images/icon@3x.png", bytes: pngSignature },
];

validateIosPackage(validEntries);
const issuedIdentifier = "com.kakao.talk.theme.u0123456789abcdef.i000001";
const identifiedEntries = applyServerThemeIdentifier(validEntries, issuedIdentifier);
const identifiedCss = new TextDecoder().decode(identifiedEntries.find((entry) => entry.path === "KakaoTalkTheme.css")?.bytes);
if (!identifiedCss.includes(`-kakaotalk-theme-id: '${issuedIdentifier}'`)) throw new Error("Server theme identifier was not applied.");
expectCode(() => applyServerThemeIdentifier(validEntries, "com.kakao.talk.theme.user-input"), "invalid_server_theme_identifier");
expectCode(() => validateIosPackage([{ path: "Images/icon.png", bytes: pngSignature }]), "missing_theme_css");
expectCode(() => validateIosPackage([{ path: "KakaoTalkTheme.css", bytes: css }, { path: "Images/icon.png", bytes: new Uint8Array([1]) }]), "invalid_png_file");
expectCode(() => validateIosPackage([{ path: "KakaoTalkTheme.css", bytes: css }]), "missing_referenced_image");
expectCode(() => normalizeIosPath("Images/nested/icon.png"), "forbidden_export_path");
expectCode(() => validateExportName("x".repeat(81)), "invalid_export_name");
expectCode(() => validateVersionName("bad version"), "invalid_version_name");

const zip = createStoredZipBytes(validEntries);
const start = new DataView(zip.buffer, zip.byteOffset, 4).getUint32(0, true);
const end = new DataView(zip.buffer, zip.byteOffset + zip.length - 22, 22);
if (start !== 0x04034b50 || end.getUint32(0, true) !== 0x06054b50 || end.getUint16(8, true) !== validEntries.length) {
  throw new Error("Stored ZIP structure validation failed.");
}

console.log(JSON.stringify({ validPackage: true, serverIdentifierApplied: true, rejectedInvalidCases: 7, zipEntries: validEntries.length, zipBytes: zip.length }));

function expectCode(callback, expectedCode) {
  try {
    callback();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === expectedCode) return;
    throw error;
  }
  throw new Error(`Expected ${expectedCode}.`);
}
