"use client";

import { useEffect, useState } from "react";
import type { EditorMode } from "@/lib/theme/project/draft";

export type EditorTabLockStatus = "pending" | "acquired" | "blocked";

const editorLockName = "kakaotalk-theme-maker:editor:user";
const leaseDurationMs = 8_000;
const heartbeatMs = 2_500;
/** 이 시간 안에 잠금을 잡으면 안내를 띄우지 않는다. 단일 탭에서는 보통 수 ms 안에 잡힌다. */
const blockedNoticeDelayMs = 500;

export function useSingleEditorTab(mode: EditorMode): EditorTabLockStatus {
  const [status, setStatus] = useState<EditorTabLockStatus>(mode === "admin" ? "acquired" : "pending");

  useEffect(() => {
    if (mode === "admin") {
      setStatus("acquired");
      return;
    }

    const locks = navigator.locks;
    if (!locks) return startFallbackLease(setStatus);

    let active = true;
    let release: (() => void) | undefined;
    const controller = new AbortController();

    // 잠금을 **기다린다**. `ifAvailable`로 한 번만 물어보면 자기 자신의 직전 요청에 막혀
    // 단일 탭에서도 차단으로 굳는다. 리마운트(StrictMode의 이중 호출, 클라이언트 전환) 때
    // 아직 콜백이 실행되지 않은 요청은 해제 함수가 없어 cleanup이 놓아 줄 수 없기 때문이다.
    // 대기 요청은 `signal`로 확실히 취소되고, 진짜 다른 탭이 쥐고 있으면 그 탭이 닫힐 때 넘어온다.
    void locks
      .request(editorLockName, { signal: controller.signal }, async () => {
        if (!active) return;
        setStatus("acquired");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch((error) => {
        // abort는 언마운트 정리 경로다. 오류가 아니다.
        if (controller.signal.aborted) return;
        console.error(error);
        // 잠금 장치를 쓸 수 없다고 편집을 막지는 않는다. 두 탭이 열리는 쪽이 덜 나쁘다.
        if (active) setStatus("acquired");
      });

    // 곧바로 잡히지 않으면 다른 탭이 쓰고 있다고 보고 안내한다. 그 탭이 닫히면 위에서 acquired로 바뀐다.
    const blockedNotice = window.setTimeout(() => {
      if (active) setStatus((current) => (current === "pending" ? "blocked" : current));
    }, blockedNoticeDelayMs);

    return () => {
      active = false;
      window.clearTimeout(blockedNotice);
      release?.();
      controller.abort();
    };
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
