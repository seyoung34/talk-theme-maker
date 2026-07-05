"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// PasscodePreview는 chatroom/common과 달리 디바이스 프레임 바깥에 모드 전환 툴바와
// 카드 패딩, 대비 경고 문구(warnings)가 함께 있다. 디바이스 크기만 기준 삼으면 실제
// 콘텐츠보다 박스가 작아져 (모바일에서) 하단에 빈 공간이 생기거나, 반대로 경고 문구가
// 나타날 때는 그만큼 더 필요한 높이를 반영하지 못해 잘리므로, 경고 문구가 항상 떠 있다고
// 가정한 최대 높이를 기준으로 삼는다(경고가 없을 때는 여유 공간으로만 보인다).
const passcodeDeviceWidth = 268;
const passcodeChrome = { sectionPadding: 24, toolbarHeight: 40, rowGaps: 24, devicePadding: 32, warningsHeight: 32 };

const referenceSizeBySection: Record<string, { width: number; height: number }> = {
  chatroom: { width: 310, height: Math.round((310 * 2123) / 1080) },
  passcode: {
    width: passcodeDeviceWidth + passcodeChrome.sectionPadding,
    height:
      Math.round((passcodeDeviceWidth * 2340) / 1080) +
      passcodeChrome.toolbarHeight +
      passcodeChrome.rowGaps +
      passcodeChrome.devicePadding +
      passcodeChrome.sectionPadding +
      passcodeChrome.warningsHeight,
  },
  // ProjectPreviewPanel은 섹션 전환 깜빡임을 막으려고 채팅방 프리뷰를 항상 invisible로
  // 함께 렌더한다. 그 세로로 긴 채팅방 폰이 공유 grid 행 높이를 chatroom 높이(~610)로
  // 밀어올려, common 섹션의 실제 렌더 높이도 항상 그만큼이 된다. 따라서 common 기준 높이는
  // 자체 콘텐츠가 아니라 chatroom 높이에 맞춰야 잘리지 않는다(콘텐츠는 그 안에서 중앙 정렬).
  common: { width: 360, height: Math.round((310 * 2123) / 1080) },
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
