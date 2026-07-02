"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const referenceSizeBySection: Record<string, { width: number; height: number }> = {
  chatroom: { width: 310, height: Math.round((310 * 2123) / 1080) },
  passcode: { width: 268, height: Math.round((268 * 2340) / 1080) },
  common: { width: 340, height: 460 },
};
const defaultReferenceSize = { width: 310, height: Math.round((310 * 2340) / 1080) };

export function MobileScaledPreview({ section, children }: { section: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const reference = referenceSizeBySection[section] ?? defaultReferenceSize;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      const nextScale = Math.min(clientWidth / reference.width, clientHeight / reference.height, 1);
      setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [reference.width, reference.height]);

  return (
    <div ref={containerRef} className="grid h-full w-full place-items-center overflow-hidden">
      <div style={{ width: reference.width, height: reference.height, transform: `scale(${scale})`, transformOrigin: "center center" }}>
        {children}
      </div>
    </div>
  );
}
