"use client";

import { useEffect, useRef, useState } from "react";
import type { SlotUploads } from "@/components/project/projectModel";

type PreviewUrlEntry = {
  /**
   * 이 URL이 어디서 나왔는지. `undefined`면 catalog 참조라 File이 없다.
   *
   * 재사용 판정에 쓴다. File 없는 항목끼리는 `undefined === undefined`가 참이라 File만 비교하면
   * catalog preview URL이 바뀌어도 옛 URL을 계속 쓴다.
   */
  source: File | string | undefined;
  url: string;
  /**
   * 우리가 만든 blob URL인가.
   *
   * catalog preview는 원격 URL이라 우리 소유가 아니다. revoke 대상에 섞이면 안 된다 —
   * 지금은 no-op이지만 "정리해야 할 자원"과 "빌려 쓰는 주소"를 구분해 두지 않으면
   * 나중에 캐시를 붙일 때 남의 주소를 무효화한다.
   */
  owned: boolean;
};

function hasSameUrls(left: Record<string, string>, right: Record<string, string>) {
  const leftIds = Object.keys(left);
  return leftIds.length === Object.keys(right).length && leftIds.every((id) => left[id] === right[id]);
}

export function useUploadPreviewUrls(uploads: SlotUploads) {
  const entriesRef = useRef<Record<string, PreviewUrlEntry>>({});
  const retiredUrlsRef = useRef<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextEntries: Record<string, PreviewUrlEntry> = {};
    for (const entry of Object.values(uploads).flatMap((items) => items ?? [])) {
      // File이 있으면 그것이 정본이다. hydrate된 항목은 원격 preview 대신 실제 바이트를 그린다.
      const source = entry.file ?? entry.catalog?.previewUrl;
      // 그릴 것이 없는 항목은 URL을 만들지 않는다. 화면은 후보/템플릿 기본값으로 떨어진다.
      if (!source) continue;

      const current = entriesRef.current[entry.id];
      if (current && current.source === source) {
        nextEntries[entry.id] = current;
        continue;
      }
      if (current?.owned) retiredUrlsRef.current.push(current.url);
      nextEntries[entry.id] = typeof source === "string"
        ? { source, url: source, owned: false }
        : { source, url: URL.createObjectURL(source), owned: true };
    }

    for (const [id, entry] of Object.entries(entriesRef.current)) {
      if (!nextEntries[id] && entry.owned) retiredUrlsRef.current.push(entry.url);
    }

    entriesRef.current = nextEntries;
    const nextUrls = Object.fromEntries(Object.entries(nextEntries).map(([id, entry]) => [id, entry.url]));
    setPreviewUrls((current) => (hasSameUrls(current, nextUrls) ? current : nextUrls));
  }, [uploads]);

  useEffect(() => {
    const retiredUrls = retiredUrlsRef.current.splice(0);
    retiredUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  useEffect(() => () => {
    const urls = new Set([
      ...Object.values(entriesRef.current).filter((entry) => entry.owned).map((entry) => entry.url),
      ...retiredUrlsRef.current,
    ]);
    urls.forEach((url) => URL.revokeObjectURL(url));
    entriesRef.current = {};
    retiredUrlsRef.current = [];
  }, []);

  return previewUrls;
}
