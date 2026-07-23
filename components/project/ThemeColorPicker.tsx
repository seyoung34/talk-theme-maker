"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import * as Popover from "@radix-ui/react-popover";
import { HexColorPicker } from "react-colorful";
import { setThemeColorRgb, themeColorRgbHex } from "@/lib/theme/color";

type ThemeColorPickerProps = {
  value: string;
  label: string;
  onChange: (value: string) => void;
  children: ReactElement;
};

function useRafColorChange(onChange: ThemeColorPickerProps["onChange"]) {
  const onChangeRef = useRef(onChange);
  const pendingValueRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);

  onChangeRef.current = onChange;

  const flush = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pendingValue = pendingValueRef.current;
    pendingValueRef.current = null;
    if (pendingValue !== null) onChangeRef.current(pendingValue);
  }, []);

  const schedule = useCallback((value: string) => {
    pendingValueRef.current = value;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pendingValue = pendingValueRef.current;
      pendingValueRef.current = null;
      if (pendingValue !== null) onChangeRef.current(pendingValue);
    });
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return { flush, schedule };
}

function PickerCanvas({ value, onChange }: Pick<ThemeColorPickerProps, "value" | "onChange">) {
  const rgbValue = themeColorRgbHex(value);

  return (
    <div className="p-3">
      <div className="theme-color-picker">
        <HexColorPicker color={rgbValue} onChange={(nextRgb) => onChange(setThemeColorRgb(value, nextRgb))} />
      </div>
    </div>
  );
}

export function ThemeColorPicker({ value, label, onChange, children }: ThemeColorPickerProps) {
  const [open, setOpen] = useState(false);
  const { flush, schedule } = useRafColorChange(onChange);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) flush();
    setOpen(nextOpen);
  };
  const titleId = useId();
  const descriptionId = useId();
  const title = `${label} 색상 선택`;
  const description = "색상 평면과 Hue 슬라이더로 색상을 선택합니다. 변경한 색상은 즉시 미리보기에 반영됩니다.";

  // 데스크톱/모바일 모두 팝오버로 통일한다. 모달+배경 블러는 적용 색상을 가려 확인이 어렵다.
  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="radix-popover-content z-[111] w-[min(248px,calc(100vw-32px))] rounded-2xl border border-[var(--color-outline-variant)] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.22)] outline-none"
        >
          <span className="sr-only" id={titleId}>{title}</span>
          <span className="sr-only" id={descriptionId}>{description}</span>
          <div role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId}>
            <PickerCanvas value={value} onChange={schedule} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
