import { describe, expect, it } from "vitest";
import { activeRefKeys, collectStaleRefs, planRestore, stableStringify } from "./backfill-catalog-refs-core.mjs";

const legacyEntry = (id) => ({
  id,
  fileName: `${id}.png`,
  mimeType: "image/png",
  size: 100,
  storagePath: `system-templates/x/${id}.png`,
});

const catalogEntry = (id, revision = 1) => ({
  ...legacyEntry(id),
  fileName: `${id}-published.png`,
  size: 120,
  catalog: { kind: "catalog", assetId: `tpl:${id}`, revision, variantKey: "canonical" },
  catalogMetadata: { fileName: `${id}-published.png`, mimeType: "image/png", size: 120 },
});

const backupRow = (overrides = {}) => ({
  id: "v1",
  platform: "android",
  upload_refs: { "slot-a": [legacyEntry("u1")] },
  appliedRefs: { "slot-a": [catalogEntry("u1")] },
  ...overrides,
});

describe("stableStringify", () => {
  it("키 순서가 달라도 같은 문자열을 만든다", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("배열 순서는 구분한다", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});

/**
 * 복원은 백업을 통째로 덮어쓴다. 판정이 틀리면 backfill 이후의 편집이 사라진다.
 * 그래서 네 경우를 고정한다 — 정상 복원, 이후 편집, 옛 백업, 강제.
 */
describe("planRestore", () => {
  it("backfill 이후 변경이 없으면 복원한다", () => {
    const row = backupRow();

    expect(planRestore({ backupRow: row, liveRefs: row.appliedRefs })).toMatchObject({ action: "restore", check: "exact" });
  });

  /**
   * 1차 리뷰가 잡은 결함이다. 제외 필드 방식은 backfill이 바꾼 값과 그 뒤의 편집을 구별하지
   * 못해서, 이 경우를 "변경 없음"으로 보고 legacy 상태로 되돌려 새 참조를 잃었다.
   */
  it("catalog 필드만 바뀐 후속 편집도 감지한다", () => {
    const row = backupRow();
    const editedAfterBackfill = { "slot-a": [catalogEntry("u1", 7)] };

    expect(planRestore({ backupRow: row, liveRefs: editedAfterBackfill })).toMatchObject({ action: "skip" });
  });

  it("항목이 추가·삭제되면 감지한다", () => {
    const row = backupRow();

    expect(planRestore({ backupRow: row, liveRefs: { "slot-a": [] } })).toMatchObject({ action: "skip" });
    expect(planRestore({ backupRow: row, liveRefs: { "slot-a": [catalogEntry("u1"), catalogEntry("u2")] } })).toMatchObject({ action: "skip" });
  });

  it("--force면 이후 변경을 알고도 덮어쓴다", () => {
    const row = backupRow();

    expect(planRestore({ backupRow: row, liveRefs: { "slot-a": [] }, force: true })).toMatchObject({ action: "restore", forced: true });
  });

  it("DB에 없는 variant는 건너뛴다", () => {
    expect(planRestore({ backupRow: backupRow(), liveRefs: undefined, hasLiveRow: false })).toMatchObject({ action: "skip" });
  });

  describe("appliedRefs가 없는 옛 백업", () => {
    const oldBackup = () => backupRow({ appliedRefs: undefined });

    it("불완전한 대조임을 알린다", () => {
      const row = oldBackup();

      expect(planRestore({ backupRow: row, liveRefs: { "slot-a": [catalogEntry("u1")] } }))
        .toMatchObject({ action: "restore", check: "legacy", incomplete: true });
    });

    it("항목 구성이 달라지면 여전히 건너뛴다", () => {
      expect(planRestore({ backupRow: oldBackup(), liveRefs: { "slot-a": [] } })).toMatchObject({ action: "skip", check: "legacy" });
    });
  });
});

describe("collectStaleRefs", () => {
  const rows = [{ id: "v1", upload_refs: { "slot-a": [catalogEntry("u1", 3)], "slot-b": [legacyEntry("u2")] } }];

  it("active revision을 가리키면 어긋남이 없다", () => {
    const active = activeRefKeys([
      { logical_asset_id: "tpl:u1", variant_key: "canonical", revision: 3, status: "active" },
    ]);

    expect(collectStaleRefs(rows, active)).toMatchObject({ checked: 1, stale: [] });
  });

  it("retire된 revision을 가리키면 잡아낸다", () => {
    const active = activeRefKeys([
      { logical_asset_id: "tpl:u1", variant_key: "canonical", revision: 4, status: "active" },
      { logical_asset_id: "tpl:u1", variant_key: "canonical", revision: 3, status: "retired" },
    ]);
    const result = collectStaleRefs(rows, active);

    expect(result.checked).toBe(1);
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]).toMatchObject({ variantId: "v1", slotId: "slot-a" });
  });

  it("catalog 참조가 없는 항목은 세지 않는다", () => {
    expect(collectStaleRefs([{ id: "v2", upload_refs: { "slot-b": [legacyEntry("u2")] } }], new Set())).toMatchObject({ checked: 0, stale: [] });
  });
});
