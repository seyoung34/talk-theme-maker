"use client";

import { useCallback, useEffect, useState } from "react";
import { readAutosaveDraft, writeAutosaveDraft } from "@/lib/theme/project/autosaveDraft";
import { listUserTemplateRecords } from "@/lib/theme/userTemplates";

/**
 * 개발 전용 저장소 baseline 측정.
 *
 * `docs/plans/in-progress/editor-asset-storage-mobile-ux-plan.md` Phase 0의 착수 조건을 재는 화면이다.
 * 계획 Phase 2는 "색상 하나만 바꿔도 큰 이미지 묶음이 다시 저장된다"는 가설 위에 서 있는데, 브라우저
 * IndexedDB는 Blob을 레코드 밖에 두고 참조로 다루므로 그 가설이 틀렸을 수 있다. 틀렸다면 content hash
 * asset store, dual-read, 유예 GC가 전부 불필요해진다. 재기 전에는 착수하지 않는다(§1.1).
 *
 * 실데이터 측정은 읽고 같은 내용을 다시 쓰기만 한다(편집기가 몇 초마다 하는 일과 같다). 값을 바꾸지
 * 않으므로 작업물이 변형되지 않는다. fixture 측정은 별도 임시 DB에서 돌리고 끝나면 지운다.
 */

type Row = { label: string; value: string };
type Section = { title: string; note?: string; rows: Row[] };

const fixtureDbName = "kakaotalk-theme-maker-storage-baseline-fixture";
const fixtureStoreName = "records";
const autosaveWriteSamples = 20;

const fixtureScenarios = [
  { label: "소형 이미지 1개 템플릿", templateCount: 1, imagesPerTemplate: 12, imageBytes: 80 * 1024 },
  { label: "소형 이미지 10개 템플릿", templateCount: 10, imagesPerTemplate: 12, imageBytes: 80 * 1024 },
  { label: "소형 이미지 30개 템플릿", templateCount: 30, imagesPerTemplate: 12, imageBytes: 80 * 1024 },
  { label: "대형 이미지 1개 템플릿", templateCount: 1, imagesPerTemplate: 12, imageBytes: 3 * 1024 * 1024 },
  { label: "대형 이미지 10개 템플릿", templateCount: 10, imagesPerTemplate: 12, imageBytes: 3 * 1024 * 1024 },
];

function formatMs(value: number) {
  return `${value.toFixed(1)}ms`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1024) return `${sign}${abs}B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)}KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)}MB`;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

async function estimateUsage() {
  if (!navigator.storage?.estimate) return Number.NaN;
  const { usage } = await navigator.storage.estimate();
  return usage ?? Number.NaN;
}

/** `navigator.storage.estimate()`는 비동기 회계라 쓰기 직후 바로 반영되지 않는다. 두 번 재고 안정될 때까지 기다린다. */
async function settledUsage() {
  let previous = await estimateUsage();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const next = await estimateUsage();
    if (Number.isNaN(next) || next === previous) return next;
    previous = next;
  }
  return previous;
}

function openFixtureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(fixtureDbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(fixtureStoreName)) {
        request.result.createObjectStore(fixtureStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteFixtureDb(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(fixtureDbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, setResult: (value: T) => void) => void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(fixtureStoreName, mode);
    let result: T | undefined;
    work(transaction.objectStore(fixtureStoreName), (value) => {
      result = value;
    });
    // commit 이후에만 resolve한다. request 성공 시점은 아직 디스크에 반영되기 전이다.
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function makeFixtureRecord(id: string, imagesPerTemplate: number, imageBytes: number) {
  const uploads = Array.from({ length: imagesPerTemplate }, (_, index) => ({
    slotId: `slot-${index}`,
    file: new File([new Uint8Array(imageBytes)], `asset-${index}.png`, { type: "image/png" }),
  }));
  return { id, updatedAt: Date.now(), colors: { "chat.background": "#ffffff" }, uploads };
}

export default function StorageBaselineClient() {
  const [environment, setEnvironment] = useState<Section | null>(null);
  const [realData, setRealData] = useState<Section | null>(null);
  const [fixture, setFixture] = useState<Section[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEnvironment = useCallback(async () => {
    const usage = await estimateUsage();
    const quota = navigator.storage?.estimate ? (await navigator.storage.estimate()).quota ?? Number.NaN : Number.NaN;
    const records = await listUserTemplateRecords();
    const uploadCount = records.reduce(
      (total, record) => total + Object.values(record.uploads).reduce((sum, entries) => sum + (entries?.length ?? 0), 0),
      0,
    );
    const autosave = await readAutosaveDraft("user");
    setEnvironment({
      title: "현재 브라우저 상태",
      rows: [
        { label: "origin 사용량", value: formatBytes(usage) },
        { label: "origin 할당량", value: formatBytes(quota) },
        { label: "로컬 템플릿 수", value: `${records.length}개` },
        { label: "로컬 템플릿 업로드 수", value: `${uploadCount}개` },
        { label: "자동 저장 초안", value: autosave ? `있음 (updatedAt ${new Date(autosave.updatedAt).toLocaleString()})` : "없음" },
      ],
    });
  }, []);

  useEffect(() => {
    void loadEnvironment().catch((cause) => setError(String(cause)));
  }, [loadEnvironment]);

  const measureRealData = useCallback(async () => {
    setBusy("실데이터");
    setError(null);
    try {
      const listStart = performance.now();
      const records = await listUserTemplateRecords();
      const listDuration = performance.now() - listStart;

      const autosave = await readAutosaveDraft("user");
      if (!autosave) {
        setRealData({
          title: "실데이터 측정",
          note: "자동 저장 초안이 없다. `/edit`에서 아무 색이나 바꿔 초안을 만든 뒤 다시 측정한다.",
          rows: [{ label: "listUserTemplateRecords()", value: `${formatMs(listDuration)} (${records.length}개)` }],
        });
        return;
      }

      const uploadCount = Object.values(autosave.draft.uploads).reduce((total, entries) => total + (entries?.length ?? 0), 0);
      const uploadBytes = Object.values(autosave.draft.uploads)
        .flatMap((entries) => entries ?? [])
        .reduce((total, entry) => total + ((entry as { file?: File }).file?.size ?? 0), 0);

      const before = await settledUsage();
      const durations: number[] = [];
      let expectedUpdatedAt: number | null = autosave.updatedAt;
      // 내용을 바꾸지 않고 같은 초안을 다시 쓴다. 색상만 바꾼 저장과 쓰는 바이트가 같고 작업물은 그대로 남는다.
      for (let sample = 0; sample < autosaveWriteSamples; sample += 1) {
        const start = performance.now();
        const outcome = await writeAutosaveDraft(
          { mode: autosave.mode, source: autosave.source, editor: autosave.editor, draft: autosave.draft },
          expectedUpdatedAt,
        );
        durations.push(performance.now() - start);
        if (outcome.status === "stale") throw new Error("다른 탭이 초안을 저장했다. `/edit` 탭을 닫고 다시 측정한다.");
        expectedUpdatedAt = outcome.record.updatedAt;
      }
      const after = await settledUsage();

      setRealData({
        title: "실데이터 측정",
        note: "초안을 같은 내용으로 다시 저장한다. 사용량이 업로드 크기만큼 늘면 Blob이 복제되는 것이고, 거의 그대로면 참조만 다시 쓰는 것이다.",
        rows: [
          { label: "listUserTemplateRecords()", value: `${formatMs(listDuration)} (${records.length}개)` },
          { label: "초안 업로드", value: `${uploadCount}개 / ${formatBytes(uploadBytes)}` },
          { label: `writeAutosaveDraft p50 (${autosaveWriteSamples}회)`, value: formatMs(percentile(durations, 0.5)) },
          { label: "writeAutosaveDraft p95", value: formatMs(percentile(durations, 0.95)) },
          { label: "writeAutosaveDraft 최대", value: formatMs(Math.max(...durations)) },
          { label: `재저장 ${autosaveWriteSamples}회 사용량 증가`, value: formatBytes(after - before) },
          { label: "회당 사용량 증가", value: formatBytes((after - before) / autosaveWriteSamples) },
        ],
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
      void loadEnvironment();
    }
  }, [loadEnvironment]);

  const measureFixtures = useCallback(async () => {
    setBusy("fixture");
    setError(null);
    setFixture([]);
    try {
      for (const scenario of fixtureScenarios) {
        await deleteFixtureDb();
        const db = await openFixtureDb();
        try {
          const records = Array.from({ length: scenario.templateCount }, (_, index) =>
            makeFixtureRecord(`fixture-${index}`, scenario.imagesPerTemplate, scenario.imageBytes),
          );
          const totalBytes = scenario.templateCount * scenario.imagesPerTemplate * scenario.imageBytes;

          const seedBefore = await settledUsage();
          const seedStart = performance.now();
          await runTransaction(db, "readwrite", (store) => {
            for (const record of records) store.put(record);
          });
          const seedDuration = performance.now() - seedStart;
          const seedAfter = await settledUsage();

          const readStart = performance.now();
          const read = await runTransaction<unknown[]>(db, "readonly", (store, setResult) => {
            const request = store.getAll();
            request.onsuccess = () => setResult(request.result as unknown[]);
          });
          const readDuration = performance.now() - readStart;

          // 핵심 측정. IDB에서 읽어온 File을 그대로 들고 스칼라 하나만 바꿔 다시 쓴다.
          const rewriteTarget = (read?.[0] ?? records[0]) as { id: string; updatedAt: number };
          const rewriteBefore = await settledUsage();
          const rewriteDurations: number[] = [];
          for (let sample = 0; sample < 10; sample += 1) {
            const next = { ...rewriteTarget, updatedAt: Date.now() + sample };
            const start = performance.now();
            await runTransaction(db, "readwrite", (store) => void store.put(next));
            rewriteDurations.push(performance.now() - start);
          }
          const rewriteAfter = await settledUsage();
          const oneRecordBytes = scenario.imagesPerTemplate * scenario.imageBytes;

          setFixture((current) => [
            ...current,
            {
              title: scenario.label,
              note: `템플릿 ${scenario.templateCount}개 × 이미지 ${scenario.imagesPerTemplate}개 × ${formatBytes(scenario.imageBytes)} = ${formatBytes(totalBytes)}`,
              rows: [
                { label: "전체 저장", value: formatMs(seedDuration) },
                { label: "저장 후 사용량 증가", value: formatBytes(seedAfter - seedBefore) },
                { label: "getAll()", value: `${formatMs(readDuration)} (${read?.length ?? 0}개)` },
                { label: "레코드 1개 재저장 p50 (10회)", value: formatMs(percentile(rewriteDurations, 0.5)) },
                { label: "레코드 1개 재저장 p95", value: formatMs(percentile(rewriteDurations, 0.95)) },
                { label: "재저장 10회 사용량 증가", value: formatBytes(rewriteAfter - rewriteBefore) },
                { label: "복제됐다면 예상 증가", value: formatBytes(oneRecordBytes * 10) },
              ],
            },
          ]);
        } finally {
          db.close();
          await deleteFixtureDb();
        }
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
      void loadEnvironment();
    }
  }, [loadEnvironment]);

  const sections = [environment, realData, ...fixture].filter(Boolean) as Section[];

  const copyMarkdown = useCallback(async () => {
    const markdown = sections
      .map((section) => {
        const lines = [`### ${section.title}`, section.note ? `\n${section.note}\n` : "", "| 항목 | 값 |", "|---|---:|"];
        for (const row of section.rows) lines.push(`| ${row.label} | ${row.value} |`);
        return lines.filter(Boolean).join("\n");
      })
      .join("\n\n");
    await navigator.clipboard.writeText(`${markdown}\n\n측정: ${new Date().toISOString()} / ${navigator.userAgent}\n`);
  }, [sections]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">저장소 baseline 측정</h1>
        <p className="text-sm text-[#475569]">
          Phase 2~5 착수 조건. 색상만 바꾼 저장이 이미지 바이트를 다시 쓰는지 확인한다. 재저장 사용량 증가가
          업로드 크기에 비례하면 가설이 맞고, 거의 0이면 IndexedDB가 Blob을 참조로만 다시 쓰는 것이라
          Phase 2는 폐기 대상이다.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void measureRealData()}
          disabled={busy !== null}
          className="min-h-11 rounded-xl bg-[#2563eb] px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy === "실데이터" ? "측정 중…" : "실데이터 측정"}
        </button>
        <button
          type="button"
          onClick={() => void measureFixtures()}
          disabled={busy !== null}
          className="min-h-11 rounded-xl border border-[#cbd5e1] px-4 text-sm font-medium disabled:opacity-60"
        >
          {busy === "fixture" ? "측정 중…" : "fixture 측정 (임시 DB)"}
        </button>
        <button
          type="button"
          onClick={() => void copyMarkdown()}
          disabled={busy !== null || !sections.length}
          className="min-h-11 rounded-xl border border-[#cbd5e1] px-4 text-sm font-medium disabled:opacity-60"
        >
          결과를 markdown으로 복사
        </button>
      </div>

      {error ? <p className="rounded-xl bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">{error}</p> : null}

      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2 rounded-2xl border border-[#e2e8f0] p-4">
          <h2 className="text-base font-semibold">{section.title}</h2>
          {section.note ? <p className="text-xs text-[#64748b]">{section.note}</p> : null}
          <dl className="flex flex-col gap-1 text-sm">
            {section.rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-[#e2e8f0] py-1 last:border-b-0">
                <dt className="text-[#475569]">{row.label}</dt>
                <dd className="font-mono">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  );
}
