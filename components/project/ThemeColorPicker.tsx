"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { HexColorPicker } from "react-colorful";
import { setThemeColorRgb, themeColorRgbHex } from "@/lib/theme/color";

type ThemeColorPickerProps = {
  value: string;
  label: string;
  onChange: (value: string) => void;
  children: ReactElement;
};

function useDesktopPicker() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

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
    <div className="p-4 sm:p-5">
      <div className="[&_.react-colorful]:h-[min(56vw,280px)] [&_.react-colorful]:min-h-52 [&_.react-colorful]:w-full [&_.react-colorful__saturation]:rounded-2xl [&_.react-colorful__hue]:mt-4 [&_.react-colorful__hue]:h-5 [&_.react-colorful__hue]:rounded-full [&_.react-colorful__pointer]:size-6 [&_.react-colorful__pointer]:border-2 [&_.react-colorful__pointer]:border-white [&_.react-colorful__pointer]:shadow-md">
        <HexColorPicker color={rgbValue} onChange={(nextRgb) => onChange(setThemeColorRgb(value, nextRgb))} />
      </div>
    </div>
  );
}

export function ThemeColorPicker({ value, label, onChange, children }: ThemeColorPickerProps) {
  const isDesktop = useDesktopPicker();
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

  if (isDesktop) {
    return (
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger asChild>{children}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="right" align="start" sideOffset={12} collisionPadding={16} className="z-[111] w-[min(440px,calc(100vw-32px))] rounded-[24px] border border-white/70 bg-[#f8fafc] shadow-[0_24px_72px_rgba(15,23,42,0.28)] outline-none">
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

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-[#0f172a]/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[111] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-32px)] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] border border-white/70 bg-[#f8fafc] shadow-[0_24px_72px_rgba(15,23,42,0.3)] outline-none">
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{description}</Dialog.Description>
          <PickerCanvas value={value} onChange={schedule} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
