"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AutosaveStatus } from "@/components/project/autosaveStatus";
import {
  AutosaveQuotaExceededError,
  clearAutosaveDraft,
  writeAutosaveDraft,
  type EditorAutosaveInput,
} from "@/lib/theme/project/autosaveDraft";
import type { EditorMode } from "@/lib/theme/project/draft";

/** 편집을 멈춘 뒤 이 시간이 지나면 저장한다. 타이핑·드래그 중에 매번 쓰지 않기 위한 값이다. */
export const autosaveDebounceMs = 2500;

/**
 * 부트스트랩이 "이 초안으로 시작한다"를 확정하기 전에는 저장하지 않는다.
 * 확정 전에 쓰면 사용자가 이어할지 답하기도 전에 기존 레코드를 덮어쓴다.
 */
export type AutosaveArm =
  | { state: "pending" }
  /** `expectedUpdatedAt`은 이 탭이 이어받은 레코드의 시각. 새로 시작했으면 null. */
  | { state: "armed"; expectedUpdatedAt: number | null };

type UseEditorAutosaveOptions = {
  arm: AutosaveArm;
  mode: EditorMode;
  draftSignature: string;
  /** 저장 직전에 현재 편집 상태를 읽는다. 저장 시점의 값이어야 하므로 콜백으로 받는다. */
  getSnapshot: () => EditorAutosaveInput;
  /** 저장 성공 뒤 현재 편집 출처를 세션 기준으로 확정한다. replace 의도가 다음 진입까지 남지 않게 한다. */
  onSaved?: () => void;
};

export function useEditorAutosave({ arm, mode, draftSignature, getSnapshot, onSaved }: UseEditorAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;
  const draftSignatureRef = useRef(draftSignature);
  draftSignatureRef.current = draftSignature;

  const savedSignatureRef = useRef<string | null>(null);
  const expectedUpdatedAtRef = useRef<number | null>(null);
  // 다른 탭이 같은 레코드를 쓰고 있으면 이 탭의 저장을 멈춘다. 되살리려면 새로고침해야 한다.
  const stoppedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // 저장과 정리가 겹치면 정리 뒤에 저장이 끝나면서 레코드가 되살아난다. 순서를 강제한다.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback(<T,>(task: () => Promise<T>) => {
    const next = queueRef.current.then(task, task);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const armState = arm.state;
  const armExpectedUpdatedAt = arm.state === "armed" ? arm.expectedUpdatedAt : null;

  // 무장 시점의 초안이 기준선이다. 방금 확정한 내용을 곧바로 다시 쓰지 않기 위해서다.
  useEffect(() => {
    if (armState !== "armed") {
      savedSignatureRef.current = null;
      return;
    }
    if (savedSignatureRef.current !== null) return;
    savedSignatureRef.current = draftSignatureRef.current;
    expectedUpdatedAtRef.current = armExpectedUpdatedAt;
    if (armExpectedUpdatedAt !== null) {
      setLastSavedAt(armExpectedUpdatedAt);
      setStatus("saved");
    }
  }, [armState, armExpectedUpdatedAt]);

  const save = useCallback(
    (signature: string) =>
      enqueue(async () => {
        if (stoppedRef.current) return;
        setStatus("saving");
        // 이전 실패 문구를 지워 둔다. 남겨 두면 재시도가 성공해도 오류 안내가 다시 떠오른다.
        setMessage(null);
        try {
          const result = await writeAutosaveDraft(getSnapshotRef.current(), expectedUpdatedAtRef.current);
          if (result.status === "stale") {
            stoppedRef.current = true;
            setStatus("conflict");
            setMessage("다른 탭에서 같은 편집기를 열어 자동 저장을 멈췄습니다. 이 탭의 변경은 저장되지 않습니다.");
            return;
          }
          savedSignatureRef.current = signature;
          expectedUpdatedAtRef.current = result.record.updatedAt;
          setLastSavedAt(result.record.updatedAt);
          setStatus("saved");
          setMessage(null);
          onSaved?.();
        } catch (error) {
          console.error(error);
          // 기준선을 갱신하지 않으므로 다음 편집에서 다시 시도한다.
          setStatus("error");
          setMessage(
            error instanceof AutosaveQuotaExceededError
              ? "브라우저 저장 공간이 부족해 자동 저장하지 못했습니다. 큰 이미지를 줄이거나 지금 내보내 주세요."
              : "자동 저장에 실패했습니다. 브라우저 저장소 권한을 확인해 주세요.",
          );
        }
      }),
    [enqueue, onSaved],
  );

  useEffect(() => {
    if (armState !== "armed" || stoppedRef.current) return;
    if (savedSignatureRef.current === null || savedSignatureRef.current === draftSignature) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void save(draftSignature);
    }, autosaveDebounceMs);

    return () => {
      if (timerRef.current === null) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [armState, draftSignature, save]);

  /**
   * 저장한 내용이 다른 곳에 안전하게 남은 시점(내 템플릿 저장·내보내기 성공)이나 새 작업을 시작할 때
   * 레코드를 지우고 기준선을 현재 초안으로 다시 잡는다.
   */
  const resetAutosave = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stoppedRef.current = false;
    savedSignatureRef.current = draftSignatureRef.current;
    expectedUpdatedAtRef.current = null;
    setStatus("idle");
    setLastSavedAt(null);
    setMessage(null);
    void enqueue(() => clearAutosaveDraft(mode)).catch((error) => console.error(error));
  }, [enqueue, mode]);

  return { status, lastSavedAt, message, resetAutosave };
}
