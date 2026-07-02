"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type MobileSheetSnap = "half" | "expanded" | "full";

const snapRatio: Record<MobileSheetSnap, number> = {
  half: 0.54,
  expanded: 0.68,
  full: 0.88,
};

const snapOrder: MobileSheetSnap[] = ["half", "expanded", "full"];
const tapThreshold = 8;

export function MobileEditSheet({
  snap,
  onSnapChange,
  ariaLabel,
  children,
}: {
  snap: MobileSheetSnap;
  onSnapChange: (snap: MobileSheetSnap) => void;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && snap !== "half") {
        event.preventDefault();
        onSnapChange("half");
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
    dragState.current = { startY: event.clientY, startHeight: rect.height, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state) return;
    const delta = state.startY - event.clientY;
    if (Math.abs(delta) > tapThreshold) state.moved = true;
    const viewport = window.innerHeight || 1;
    const min = snapRatio.half * viewport;
    const max = snapRatio.full * viewport;
    setLiveHeight(Math.min(max, Math.max(min, state.startHeight + delta)));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    dragState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!state) return;

    if (!state.moved) {
      onSnapChange(snap === "half" ? "expanded" : "half");
      setLiveHeight(null);
      return;
    }

    if (liveHeight != null) onSnapChange(nearestSnap(liveHeight));
    setLiveHeight(null);
  };

  const heightStyle = liveHeight != null ? `${Math.round(liveHeight)}px` : `${Math.round(snapRatio[snap] * 100)}dvh`;

  return (
    <div
      ref={sheetRef}
      role="region"
      aria-label={ariaLabel ?? "편집 패널"}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-[24px] border-t border-[#dbe3ed] bg-white shadow-[0_-16px_48px_rgba(15,23,42,0.18)]"
      style={{ height: heightStyle, transition: liveHeight != null ? "none" : "height 220ms cubic-bezier(0.22,1,0.36,1)" }}
    >
      <button
        type="button"
        className="grid touch-none place-items-center gap-1 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
        aria-label={snap === "half" ? "편집 패널 넓히기" : "편집 패널 줄이기"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="h-1.5 w-11 rounded-full bg-[#cbd5e1]" aria-hidden="true" />
      </button>

      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 px-3 pb-3">
        {children}
      </div>
    </div>
  );
}
