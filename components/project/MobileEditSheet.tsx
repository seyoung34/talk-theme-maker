"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

export type MobileSheetSnap = "collapsed" | "half" | "full";

const snapRatio: Record<MobileSheetSnap, number> = {
  collapsed: 0.12,
  half: 0.5,
  full: 0.88,
};

const collapsedHeightPx = 96;

export const mobileSheetHeight: Record<MobileSheetSnap, string> = {
  collapsed: `${collapsedHeightPx}px`,
  half: "50dvh",
  full: "88dvh",
};

const snapOrder: MobileSheetSnap[] = ["collapsed", "half", "full"];
const tapThreshold = 8;

function getTappedSnap(snap: MobileSheetSnap): MobileSheetSnap {
  return snap === "collapsed" ? "half" : "collapsed";
}

function getEscapedSnap(snap: MobileSheetSnap): MobileSheetSnap {
  if (snap === "full") return "half";
  return "collapsed";
}

function getHandleLabel(snap: MobileSheetSnap): string {
  return snap === "collapsed" ? "편집 패널 펼치기" : "편집 패널 접기";
}

export function MobileEditSheet({
  snap,
  onSnapChange,
  onLiveHeightChange,
  ariaLabel,
  children,
}: {
  snap: MobileSheetSnap;
  onSnapChange: (snap: MobileSheetSnap) => void;
  onLiveHeightChange?: (height: number | null) => void;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startY: number; startHeight: number; currentHeight: number; moved: boolean } | null>(null);
  const contentId = useId();
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && snap !== "collapsed") {
        event.preventDefault();
        onSnapChange(getEscapedSnap(snap));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [snap, onSnapChange]);

  const nearestSnap = (heightPx: number): MobileSheetSnap => {
    const viewport = window.innerHeight || 1;
    const ratio = heightPx / viewport;
    return snapOrder.reduce((closest, candidate) =>
      Math.abs(snapRatio[candidate] - ratio) < Math.abs(snapRatio[closest] - ratio) ? candidate : closest,
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsInteracting(true);
    dragState.current = { startY: event.clientY, startHeight: rect.height, currentHeight: rect.height, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state) return;
    const delta = state.startY - event.clientY;
    if (Math.abs(delta) > tapThreshold) state.moved = true;
    const viewport = window.innerHeight || 1;
    const min = Math.max(collapsedHeightPx, snapRatio.collapsed * viewport);
    const max = snapRatio.full * viewport;
    const nextHeight = Math.min(max, Math.max(min, state.startHeight + delta));
    state.currentHeight = nextHeight;
    setLiveHeight(nextHeight);
    onLiveHeightChange?.(nextHeight);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    dragState.current = null;
    setIsInteracting(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!state) return;

    // 탭과 드래그를 같은 pointer 시퀀스에서 가른다. click을 따로 듣지 않으므로 드래그 뒤에
    // 뒤늦게 도착하는 click을 눌러 둘 필요가 없다.
    onSnapChange(state.moved ? nearestSnap(state.currentHeight) : getTappedSnap(snap));
    setLiveHeight(null);
    onLiveHeightChange?.(null);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragState.current = null;
    setIsInteracting(false);
    setLiveHeight(null);
    onLiveHeightChange?.(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // 키보드 조작에는 pointer 이벤트가 없다. Space의 기본 스크롤도 함께 막는다.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSnapChange(getTappedSnap(snap));
  };

  const heightStyle = liveHeight != null ? `${Math.round(liveHeight)}px` : mobileSheetHeight[snap];

  return (
    <div
      ref={sheetRef}
      role="region"
      aria-label={ariaLabel ?? "편집 패널"}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-[24px] border-t border-[#dbe3ed] bg-white shadow-[0_-16px_48px_rgba(15,23,42,0.18)]"
      style={{ height: heightStyle, transition: liveHeight != null ? "none" : "height 200ms cubic-bezier(0.22,1,0.36,1)" }}
    >
      <button
        type="button"
        className={`grid min-h-8 touch-none place-items-center gap-1 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${isInteracting ? "bg-[#eff6ff]" : "bg-transparent"}`}
        aria-label={getHandleLabel(snap)}
        aria-controls={contentId}
        aria-expanded={snap !== "collapsed"}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <span className={`h-1.5 rounded-full transition-all ${isInteracting ? "w-14 bg-[#2563eb] shadow-[0_0_0_4px_rgba(37,99,235,0.14)]" : "w-11 bg-[#cbd5e1]"}`} aria-hidden="true" />
      </button>

      <div id={contentId} className="flex min-h-0 w-full min-w-0 flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
