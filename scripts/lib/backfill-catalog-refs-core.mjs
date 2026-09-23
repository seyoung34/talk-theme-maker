/**
 * `backfill-system-template-catalog-refs.mjs`의 순수 판정부.
 *
 * 스크립트 본체는 top-level await와 네트워크 호출을 섞고 있어 import만으로 실행된다.
 * 되돌리기 가능 여부와 참조 유효성 판정은 틀리면 데이터를 잃는 자리라, 테스트할 수 있게
 * 여기로 분리한다.
 */

/** 키 순서에 흔들리지 않는 직렬화. 대조용이다. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** 이 스크립트가 덮어쓰는 필드. 아래 레거시 대조에서만 쓴다. */
const backfillWrittenFields = ["catalog", "catalogMetadata", "fileName", "mimeType", "size"];

/**
 * 이 스크립트가 쓰는 필드를 제외한 "어떤 항목이 있었는가" 지문.
 *
 * **이 대조는 불완전하다.** 제외한 다섯 필드에서 일어난 후속 편집을 구별하지 못한다 —
 * backfill이 바꾼 것인지 그 뒤에 누가 저장한 것인지 알 수 없기 때문이다. `appliedRefs`가 없는
 * 옛 백업에만 쓰고, 그때도 불완전하다고 알린다.
 */
export function refsIdentity(refs) {
  const out = {};
  for (const [slotId, entries] of Object.entries(refs ?? {})) {
    out[slotId] = (Array.isArray(entries) ? entries : []).map((entry) => {
      const rest = { ...entry };
      for (const field of backfillWrittenFields) delete rest[field];
      return rest;
    });
  }
  return stableStringify(out);
}

/**
 * 이 variant를 백업으로 되돌려도 되는가.
 *
 * 복원은 백업을 통째로 덮어쓰므로, 백업을 뜬 뒤에 그 variant가 편집됐다면 그 편집이 사라진다.
 * 그래서 **적용 직후의 기대 상태(`appliedRefs`)를 백업에 함께 저장하고 현재 상태와 통째로
 * 대조한다.** 같으면 backfill 이후 아무 변경이 없었다는 뜻이라 되돌려도 안전하다.
 *
 * 필드를 제외하는 방식은 쓰지 않는다. 제외한 필드에서 일어난 편집을 놓치기 때문이다 —
 * 예를 들어 백업 뒤에 그 슬롯을 다시 저장해 새 `catalog` 참조가 생겼다면, 지문 대조는 같다고
 * 판단하고 legacy 상태로 되돌려 그 참조를 잃는다. `appliedRefs`가 없는 옛 백업에서만
 * 그 대조로 떨어지고, 그 사실을 호출부에 알린다.
 */
export function planRestore({ backupRow, liveRefs, hasLiveRow = true, force = false }) {
  if (!hasLiveRow) return { action: "skip", reason: "현재 DB에 없는 variant" };

  if (backupRow.appliedRefs !== undefined) {
    const matches = stableStringify(liveRefs ?? {}) === stableStringify(backupRow.appliedRefs ?? {});
    if (matches) return { action: "restore", check: "exact" };
    if (force) return { action: "restore", check: "exact", forced: true };
    return { action: "skip", reason: "backfill 적용 이후 이 variant가 변경됐다", check: "exact" };
  }

  // appliedRefs가 없는 옛 백업.
  const matches = refsIdentity(liveRefs) === refsIdentity(backupRow.upload_refs);
  if (!matches && !force) {
    return { action: "skip", reason: "백업 이후 다른 편집이 있다", check: "legacy" };
  }
  return { action: "restore", check: "legacy", forced: !matches, incomplete: true };
}

/**
 * 기록된 catalog 참조가 지금도 active revision을 가리키는지 확인한다.
 *
 * 참조를 쓰는 동안 같은 자산이 재게시되면, 방금 쓴 참조가 retire된 revision을 가리킬 수 있다.
 * 멱등 재실행은 이것을 고치지 못한다 — 이미 catalog인 항목은 건너뛰기 때문이다. 어긋난 참조는
 * 내보내기가 `catalog_asset_revision_mismatch`로 실패한다.
 */
export function collectStaleRefs(rows, activeKeys) {
  const stale = [];
  let checked = 0;
  for (const row of rows) {
    for (const [slotId, entries] of Object.entries(row.upload_refs ?? {})) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry?.catalog) continue;
        checked += 1;
        const key = catalogRefKey(entry.catalog);
        if (!activeKeys.has(key)) stale.push({ variantId: row.id, slotId, key });
      }
    }
  }
  return { checked, stale };
}

export function catalogRefKey({ assetId, variantKey, revision }) {
  return `${assetId}|${variantKey}|${revision}`;
}

export function activeRefKeys(records) {
  return new Set(
    records
      .filter((record) => record.status === "active")
      .map((record) => `${record.logical_asset_id}|${record.variant_key}|${record.revision}`),
  );
}
