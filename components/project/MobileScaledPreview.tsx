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
  isResizing = false,
  children,
}: {
  section: string;
  placement?: MobileScaledPreviewPlacement;
  isResizing?: boolean;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  // 섹션 전환은 즉시 반영해야 하므로, section이 바뀐 커밋에서는 transition을 끈다.
  const [prevSection, setPrevSection] = useState(section);
  const [sectionSwitching, setSectionSwitching] = useState(false);
  if (section !== prevSection) {
    setPrevSection(section);
    setSectionSwitching(true);
  }
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

  // 섹션 전환에 따른 크기/스케일 보정이 끝난 뒤 transition을 다시 켠다(더블 rAF로 한 프레임 확보).
  useEffect(() => {
    if (!sectionSwitching) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSectionSwitching(false));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [sectionSwitching]);

  const noTransition = isResizing || sectionSwitching;

  return (
    <div ref={containerRef} className={`flex h-full w-full justify-center overflow-hidden ${placement === "raised" ? "items-start" : "items-center"}`}>
      <div
        className="relative shrink-0"
        style={{
          width: scaledSize.width,
          height: scaledSize.height,
          transition: noTransition ? "none" : "width 360ms cubic-bezier(0.22,1,0.36,1), height 360ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div
          className="absolute left-1/2 top-0"
          style={{
            width: reference.width,
            height: reference.height,
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: "top center",
            transition: noTransition ? "none" : "transform 360ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
