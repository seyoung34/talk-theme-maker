"use client";

import { useEffect, useState } from "react";
import type { EditorMode } from "@/lib/theme/project/draft";

export type EditorTabLockStatus = "pending" | "acquired" | "blocked";

const leaseDurationMs = 8_000;
const heartbeatMs = 2_500;

export function useSingleEditorTab(mode: EditorMode): EditorTabLockStatus {
  const [status, setStatus] = useState<EditorTabLockStatus>(mode === "admin" ? "acquired" : "pending");

  useEffect(() => {
    if (mode === "admin") {
      setStatus("acquired");
      return;
    }

    let active = true;
    let releaseWebLock: (() => void) | undefined;
    let cleanupFallback: (() => void) | undefined;
    const locks = navigator.locks;
    if (locks) {
      void locks
        .request("kakaotalk-theme-maker:editor:user", { ifAvailable: true }, async (lock) => {
          if (!active) return;
          if (!lock) {
            setStatus("blocked");
            return;
          }
          setStatus("acquired");
          await new Promise<void>((resolve) => {
            releaseWebLock = resolve;
          });
        })
        .catch((error) => {
          console.error(error);
          if (active) cleanupFallback = startFallbackLease(setStatus);
        });

      return () => {
        active = false;
        releaseWebLock?.();
        cleanupFallback?.();
      };
    }

    return startFallbackLease(setStatus);
  }, [mode]);

  return status;
}

/**
 * Web Locks를 지원하지 않는 브라우저용 짧은 lease. 탭이 비정상 종료돼도 만료 뒤 다시 편집할 수 있다.
 */
function startFallbackLease(setStatus: (status: EditorTabLockStatus) => void) {
  const key = "kakaotalk-theme-maker:editor-lock:user:v1";
  const owner = crypto.randomUUID();
  const read = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { owner?: unknown; expiresAt?: unknown } | null;
      return parsed && typeof parsed.owner === "string" && typeof parsed.expiresAt === "number"
        ? { owner: parsed.owner, expiresAt: parsed.expiresAt }
        : null;
    } catch {
      return null;
    }
  };
  const claim = () => {
    const current = read();
    if (current && current.owner !== owner && current.expiresAt > Date.now()) {
      setStatus("blocked");
      return false;
    }
    localStorage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + leaseDurationMs }));
    const acquired = read()?.owner === owner;
    setStatus(acquired ? "acquired" : "blocked");
    return acquired;
  };

  claim();
  const interval = window.setInterval(() => {
    if (!claim()) window.clearInterval(interval);
  }, heartbeatMs);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    const current = read();
    if (current && current.owner !== owner && current.expiresAt > Date.now()) {
      window.clearInterval(interval);
      setStatus("blocked");
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    window.clearInterval(interval);
    window.removeEventListener("storage", handleStorage);
    if (read()?.owner === owner) localStorage.removeItem(key);
  };
}
