import type { EditorSystemTemplateMetadata, ThemeDraft } from "@/lib/theme/project/draft";

/**
 * 편집 초안의 내용 서명.
 *
 * "저장하지 않은 변경이 있는가"를 판단하려면 두 시점의 초안을 비교해야 하는데, 초안에는 `File`이
 * 들어 있어 그대로 직렬화할 수 없고 참조 비교도 쓸 수 없다(같은 내용이라도 매 렌더 새 객체가 된다).
 * 그래서 내용만 뽑아 안정적인 문자열로 만든다.
 *
 * 판정을 틀리는 두 방향의 비용이 다르다. 변경이 없는데 있다고 보면 경고가 한 번 더 뜰 뿐이지만,
 * 변경이 있는데 없다고 보면 사용자가 작업을 잃는다. 그래서 키 순서처럼 내용과 무관한 흔들림은
 * 제거하되(오탐 방지), 값 비교 자체는 넓게 잡는다(누락 방지).
 */
export function createThemeDraftSignature(draft: ThemeDraft): string {
  return stableStringify({
    // File 자체는 비교할 수 없다. 업로드 id는 슬롯·시각으로 새로 만들어지므로 추가·삭제·재편집을 모두 반영한다.
    uploads: collectUserAuthoredUploadIds(draft.uploads),
    // 어떤 원격 에셋을 쓰는지는 사용자 선택이다. 사용자가 직접 올리면 해당 슬롯의 ref가 제거된다.
    remoteUploadRefs: mapRecord(draft.remoteUploadRefs, (entries) => entries.map((entry) => entry.id)),
    colors: draft.colors,
    candidateSelections: draft.candidateSelections,
    bubbleGeometry: draft.bubbleGeometry,
    bubbleMarkers: draft.bubbleMarkers,
    bubbleInsets: draft.bubbleInsets,
    bubbleStretch: draft.bubbleStretch,
    bubbleDesigns: draft.bubbleDesigns,
    // 장식 원본은 id가 없어 파일 메타로 대신한다.
    bubbleDecorationSources: mapRecord(draft.bubbleDecorationSources, (file) => `${file.name}:${file.size}:${file.lastModified}`),
  });
}

/**
 * 사용자가 만든 업로드만 남긴다.
 *
 * 시스템 템플릿을 열면 미리보기에 필요한 몇 개만 먼저 받고 나머지 원격 에셋은 배경에서 채운다.
 * 그 결과로 늘어난 항목까지 변경으로 세면, 사용자가 아무것도 건드리지 않았는데 이탈 경고가 뜨고
 * 자동 저장이 돈다. 원격에서 내려받은 항목(`source: "template"`)은 편집이 아니라 로딩이다.
 *
 * 원격 에셋을 쓸지 말지는 `remoteUploadRefs`가 따로 반영하므로 사용자의 선택은 여전히 잡힌다.
 */
function collectUserAuthoredUploadIds(uploads: ThemeDraft["uploads"]) {
  const next: Record<string, string[]> = {};
  for (const [slotId, entries] of Object.entries(uploads)) {
    const ids = (entries ?? []).filter((entry) => entry.source !== "template").map((entry) => entry.id);
    if (ids.length) next[slotId] = ids;
  }
  return next;
}

/**
 * 관리자 메타데이터는 초안 바깥의 폼 상태라 별도로 서명한다.
 * 일반 사용자 화면에서는 편집할 수 없으므로 `null`을 넘겨 서명에서 제외한다.
 */
export function createSystemTemplateMetadataSignature(metadata: EditorSystemTemplateMetadata | null): string {
  return metadata ? stableStringify(metadata) : "";
}

/** 이탈 경고와 자동 저장이 같은 기준으로 판단하도록 초안과 메타데이터 서명을 한 값으로 합친다. */
export function createEditorSignature(draft: ThemeDraft, metadata: EditorSystemTemplateMetadata | null): string {
  return `${createThemeDraftSignature(draft)}|${createSystemTemplateMetadataSignature(metadata)}`;
}

function mapRecord<Value, Mapped>(
  record: Record<string, Value | undefined> | Partial<Record<string, Value>>,
  map: (value: Value) => Mapped,
): Record<string, Mapped> {
  const next: Record<string, Mapped> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    next[key] = map(value as Value);
  }
  return next;
}

/**
 * 키 순서에 의존하지 않는 직렬화.
 * 초안은 `{ ...current, [id]: value }`와 `delete`로 갱신되므로 같은 내용이라도 키 순서가 달라질 수 있다.
 * `JSON.stringify`를 그대로 쓰면 그 순서 차이가 "변경됨"으로 잡힌다.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}
