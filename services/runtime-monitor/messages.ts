import bundled from "./messages.ko.json" with { type: "json" };
import { sources, type Source } from "./sources.js";

/**
 * 텔레그램 문구 카탈로그.
 *
 * 원본은 `messages.ko.json`이다. 운영 중에는 상태 버킷의 `monitor/messages-v1.json`을 tick마다 읽어
 * 이미지를 다시 굽지 않고 문구를 바꾼다. 그 파일이 없거나 이 검증을 통과하지 못하면 이미지에 들어 있는
 * 원본으로 돌아간다 — 문구 실수가 알림 자체를 막으면 안 된다.
 *
 * 템플릿은 고정된 치환자만 쓸 수 있다. 상태 값이나 설정, 토큰에 임의로 접근하는 경로는 없다.
 */

export const layoutNames = ["opened", "repeat", "update", "recovered", "closed"] as const;
export type LayoutName = typeof layoutNames[number];

const sourceFields = ["target", "subject", "icon", "failureTitle", "recoveryTitle", "impact", "action", "recovered"] as const;
export type SourceCopy = Record<typeof sourceFields[number], string>;

/** http.ts·collect.ts가 실제로 만드는 실패 코드. 카탈로그는 이 코드 전부에 문장을 가져야 한다. */
export const failureCodes = [
  "request_timeout", "network_failed", "http_failed", "invalid_response", "response_too_large",
  "database_unavailable", "probe_failed", "collection_failed", "unclassified_outcome", "runtime_failure_candidates",
] as const;

/** 레이아웃 줄에서 쓸 수 있는 치환자. 값이 없는 치환자가 들어 있는 줄은 통째로 빠진다. */
export const layoutPlaceholders = [
  "header", "phase", "icon", "title", "failureTitle", "recoveryTitle", "failure", "impact", "action", "recovered",
  "target", "detectedAt", "checkedAt", "elapsed", "range", "httpStatus", "cfRay",
  "requests", "runtimeFailures", "window", "source", "code", "id",
] as const;
export type LayoutValues = Partial<Record<typeof layoutPlaceholders[number], string>>;
const failurePlaceholders = ["target", "subject"] as const;

export type LayoutLine = string | { when: typeof layoutPlaceholders[number]; lines: string[] };
export type MessageCatalog = {
  version: 1;
  header: string;
  phases: Record<LayoutName, string>;
  sources: Record<Source, SourceCopy>;
  failures: Record<string, string>;
  unknownFailure: string;
  layouts: Record<LayoutName, LayoutLine[]>;
};

/** 텔레그램 메시지 한 건의 최대 길이. */
export const telegramTextLimit = 4096;
/** 운영 템플릿 파일 크기 상한. */
export const catalogByteLimit = 65536;
const textLimit = 600;

const placeholderPattern = /\{([^{}]*)\}/g;

function fail(path: string): never {
  throw new Error(`messages_invalid: ${path}`);
}

function record(value: unknown, path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, allowed: readonly string[], { empty = false } = {}) {
  if (typeof value !== "string" || value.length > textLimit || (!empty && !value.trim())) fail(path);
  // 열고 닫는 중괄호 수가 다르면 오타다. 그대로 두면 "{target" 같은 문자열이 사람에게 나간다.
  if ((value.match(/\{/g) ?? []).length !== (value.match(/\}/g) ?? []).length) fail(`${path} (중괄호 짝)`);
  for (const [, name] of value.matchAll(placeholderPattern)) {
    if (!allowed.includes(name)) fail(`${path} (알 수 없는 치환자 {${name}})`);
  }
  return value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key} (알 수 없는 항목)`);
}

/** 카탈로그 전체를 검증한다. 실패하면 어느 항목이 틀렸는지 담은 `messages_invalid: <경로>` 오류를 던진다. */
export function parseMessageCatalog(value: unknown): MessageCatalog {
  const root = record(value, "$");
  exactKeys(root, ["version", "header", "phases", "sources", "failures", "unknownFailure", "layouts"], "$");
  if (root.version !== 1) fail("version");

  const phases = record(root.phases, "phases");
  exactKeys(phases, layoutNames, "phases");
  for (const name of layoutNames) text(phases[name], `phases.${name}`, []);

  const sourceMap = record(root.sources, "sources");
  exactKeys(sourceMap, sources, "sources");
  for (const source of sources) {
    const copy = record(sourceMap[source], `sources.${source}`);
    exactKeys(copy, sourceFields, `sources.${source}`);
    for (const field of sourceFields) text(copy[field], `sources.${source}.${field}`, []);
  }

  const failures = record(root.failures, "failures");
  for (const [code, sentence] of Object.entries(failures)) {
    if (!/^[a-z_]{1,64}$/.test(code)) fail(`failures.${code}`);
    text(sentence, `failures.${code}`, failurePlaceholders);
  }
  for (const code of failureCodes) if (!(code in failures)) fail(`failures.${code} (없음)`);
  text(root.unknownFailure, "unknownFailure", failurePlaceholders);

  const layouts = record(root.layouts, "layouts");
  exactKeys(layouts, layoutNames, "layouts");
  for (const name of layoutNames) {
    const lines = layouts[name];
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 40) fail(`layouts.${name}`);
    lines.forEach((line, index) => {
      const path = `layouts.${name}[${index}]`;
      if (typeof line === "string") { text(line, path, layoutPlaceholders, { empty: true }); return; }
      const group = record(line, path);
      exactKeys(group, ["when", "lines"], path);
      if (!layoutPlaceholders.includes(group.when as typeof layoutPlaceholders[number])) fail(`${path}.when`);
      if (!Array.isArray(group.lines) || group.lines.length === 0 || group.lines.length > 20) fail(`${path}.lines`);
      group.lines.forEach((inner, innerIndex) => text(inner, `${path}.lines[${innerIndex}]`, layoutPlaceholders, { empty: true }));
    });
  }
  return value as MessageCatalog;
}

/** 이미지에 함께 들어가는 원본 카탈로그. 운영 템플릿을 못 읽을 때 쓰는 대체값이다. */
export const defaultCatalog: MessageCatalog = parseMessageCatalog(bundled);

function fill(template: string, values: Record<string, string | undefined>) {
  let missing = false;
  const result = template.replace(placeholderPattern, (_, name: string) => {
    const value = values[name];
    if (value === undefined) missing = true;
    return value ?? "";
  });
  return missing ? undefined : result;
}

export function renderFailure(catalog: MessageCatalog, source: Source, code: string) {
  const copy = catalog.sources[source];
  return fill(catalog.failures[code] ?? catalog.unknownFailure, { target: copy.target, subject: copy.subject })!;
}

/**
 * 레이아웃을 그린다. 값이 없는 치환자가 있는 줄과 `when` 값이 없는 묶음은 빠지고,
 * 연달아 생긴 빈 줄은 하나로 줄인다.
 */
export function renderLayout(lines: LayoutLine[], values: LayoutValues) {
  const output: string[] = [];
  for (const line of lines) {
    const group = typeof line === "string" ? [line] : values[line.when] === undefined ? [] : line.lines;
    for (const template of group) {
      const rendered = fill(template, values);
      if (rendered === undefined) continue;
      if (rendered === "" && (output.length === 0 || output.at(-1) === "")) continue;
      output.push(rendered);
    }
  }
  while (output.at(-1) === "") output.pop();
  const result = output.join("\n");
  return result.length > telegramTextLimit ? `${result.slice(0, telegramTextLimit - 1)}…` : result;
}
