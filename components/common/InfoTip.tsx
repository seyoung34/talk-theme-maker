"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * 제목 옆에 붙는 설명 버튼.
 *
 * 항상 보여야 할 만큼 중요하지 않지만 필요할 때는 찾을 수 있어야 하는 안내를 담는다. 문구를
 * 본문에 늘어놓으면 화면의 첫인상이 안내문이 되어 정작 목록·버튼이 밀린다.
 *
 * 편집기(`MobileGroupSlotList`)가 쓰던 툴팁과 같은 표면을 쓰되, 바깥 클릭과 Esc로 닫히는
 * 동작을 더했다. 그쪽은 목록 항목 안이라 다른 항목을 누르면 자연히 닫혔지만, 제목 옆에
 * 단독으로 놓이면 닫을 방법이 없다.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-flex align-middle">
      <button
        type="button"
        className={`grid size-6 place-items-center rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bbf] ${open ? "text-[#2f6bbf]" : "text-[#b6c4d8] hover:text-[#5b6b82]"}`}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-[calc(100%+4px)] z-20 w-[min(280px,70vw)] rounded-xl border border-[#dbe8fb] bg-white px-3 py-2 text-[11px] font-medium leading-relaxed text-[#475569] shadow-lg ring-1 ring-black/5"
        >
          <span className="absolute -top-1 left-3 size-2 rotate-45 border-l border-t border-[#dbe8fb] bg-white" aria-hidden="true" />
          {children}
        </span>
      ) : null}
    </span>
  );
}
