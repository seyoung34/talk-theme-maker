"use client";

import { useEffect, useRef, useState } from "react";
import type { SlotUploads } from "@/components/project/projectModel";

type PreviewUrlEntry = {
  file: File;
  url: string;
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
      const current = entriesRef.current[entry.id];
      if (current?.file === entry.file) {
        nextEntries[entry.id] = current;
        continue;
      }
      if (current) retiredUrlsRef.current.push(current.url);
      nextEntries[entry.id] = { file: entry.file, url: URL.createObjectURL(entry.file) };
    }

    for (const [id, entry] of Object.entries(entriesRef.current)) {
      if (!nextEntries[id]) retiredUrlsRef.current.push(entry.url);
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
      ...Object.values(entriesRef.current).map((entry) => entry.url),
      ...retiredUrlsRef.current,
    ]);
    urls.forEach((url) => URL.revokeObjectURL(url));
    entriesRef.current = {};
    retiredUrlsRef.current = [];
  }, []);

  return previewUrls;
}
