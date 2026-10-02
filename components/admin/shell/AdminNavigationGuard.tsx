"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

/**
 * 셸 메뉴 이동 직전에 화면이 끼어드는 자리.
 *
 * 화면 자체 링크는 각자 이탈 보호를 하지만, 셸 사이드바 링크는 화면 바깥에 있어 그 보호를 우회한다.
 * 화면이 판정 함수를 등록하면 셸 링크가 클릭 시 먼저 묻는다. 함수가 true를 돌려주면 셸은 이동하지
 * 않는다 — 화면이 이동을 막았거나, 확인 뒤 직접 이동하겠다는 뜻이다.
 */
export type AdminNavigationGuard = (href: string) => boolean;

type GuardContextValue = {
  register: (guard: AdminNavigationGuard) => () => void;
  shouldBlock: (href: string) => boolean;
};

const GuardContext = createContext<GuardContextValue | null>(null);

export function AdminNavigationGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<AdminNavigationGuard | null>(null);

  const register = useCallback((guard: AdminNavigationGuard) => {
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, []);

  const shouldBlock = useCallback((href: string) => guardRef.current?.(href) ?? false, []);

  const value = useMemo(() => ({ register, shouldBlock }), [register, shouldBlock]);
  return <GuardContext.Provider value={value}>{children}</GuardContext.Provider>;
}

/**
 * 화면이 셸 이동 판정 함수를 등록한다. 셸 밖(예: 테스트)에서는 아무 일도 하지 않는다.
 *
 * 등록은 최신 함수를 ref로 읽으므로 매 렌더 새 함수를 넘겨도 재등록이 일어나지 않는다.
 */
export function useAdminNavigationGuard(guard: AdminNavigationGuard) {
  const context = useContext(GuardContext);
  const latest = useRef(guard);
  latest.current = guard;

  useEffect(() => {
    if (!context) return;
    return context.register((href) => latest.current(href));
  }, [context]);
}

export function useAdminNavigationGuardCheck() {
  const context = useContext(GuardContext);
  return context?.shouldBlock ?? noBlock;
}

function noBlock() {
  return false;
}
