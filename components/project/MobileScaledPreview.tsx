"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const referenceSizeBySection: Record<string, { width: number; height: number }> = {
  chatroom: { width: 310, height: Math.round((310 * 2123) / 1080) },
  passcode: { width: 268, height: Math.round((268 * 2340) / 1080) },
  common: { width: 340, height: 460 },
};
const defaultReferenceSize = { width: 310, height: Math.round((310 * 2340) / 1080) };

type MobileScaledPreviewPlacement = "center" | "raised";

export function MobileScaledPreview({
  section,
  placement = "center",
  children,
}: {
  section: string;
  placement?: MobileScaledPreviewPlacement;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const reference = referenceSizeBySection[section] ?? defaultReferenceSize;
  const scaledSize = useMemo(
    () => ({
      width: reference.width * scale,
      height: reference.height * scale,
    }),
    [reference.height, reference.width, scale],
  );

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
    <div ref={containerRef} className={`flex h-full w-full justify-center overflow-hidden ${placement === "raised" ? "items-start" : "items-center"}`}>
      <div className="relative shrink-0" style={{ width: scaledSize.width, height: scaledSize.height }}>
        <div
          className="absolute left-1/2 top-0"
          style={{ width: reference.width, height: reference.height, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
