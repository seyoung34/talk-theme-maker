"use client";

import BubbleCanvasPreview from "@/components/preview/BubbleCanvasPreview";
import type { BubbleEditState } from "@/lib/theme/project/state";
import type { BubbleSlot, ThemePlatform } from "@/lib/theme/types";

export default function AdminBubbleTextPreview({
  sourceFile,
  platform,
  slot,
  edit,
  text,
  onTextChange,
}: {
  sourceFile: File | null;
  platform: ThemePlatform;
  slot: BubbleSlot;
  edit?: BubbleEditState;
  text: string;
  onTextChange: (text: string) => void;
}) {
  return (
    <section className="grid gap-3 rounded-[24px] border border-[#d8e2ef] bg-white p-3 shadow-[0_12px_28px_rgba(37,99,235,0.06)]" aria-labelledby="admin-bubble-text-preview-heading">
      <header className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <h3 id="admin-bubble-text-preview-heading" className="text-[15px] font-black tracking-[-0.02em] text-[#0f172a]">텍스트 적용 미리보기</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#64748b]">입력한 문장이 현재 stretch와 글자 여백 안에서 어떻게 배치되는지 확인합니다.</p>
        </div>
        <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[10px] font-black text-[#1d4ed8]">말풍선 1개</span>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
        <div className="grid min-h-40 place-items-center overflow-auto rounded-[20px] border border-[#e2e8f0] bg-[#f8fafc] p-5" style={{ backgroundImage: "conic-gradient(#e6ebf1 25%, transparent 0 50%, #e6ebf1 0 75%, transparent 0)", backgroundSize: "16px 16px" }}>
          {sourceFile ? (
            <BubbleCanvasPreview
              sourceFile={sourceFile}
              sourceName={sourceFile.name}
              platform={platform}
              slot={slot}
              edit={edit}
              text={text}
              textColor="#172033"
              fillColor="#fff2a8"
              scale={0.62}
              className="max-w-full"
            />
          ) : (
            <p className="text-center text-xs font-bold leading-5 text-[#64748b]">말풍선 원본을 선택하면 미리보기가 표시됩니다.</p>
          )}
        </div>

        <label className="grid content-start gap-2 rounded-[20px] border border-[#e2e8f0] bg-[#f8fafc] p-3">
          <span className="text-xs font-black text-[#334155]">미리 볼 메시지</span>
          <textarea
            value={text}
            onChange={(event) => onTextChange(event.currentTarget.value)}
            maxLength={200}
            rows={5}
            placeholder="말풍선 안에 들어갈 내용을 입력하세요."
            className="min-h-28 resize-y rounded-xl border border-[#dbe3ed] bg-white px-3 py-2.5 text-sm font-semibold leading-6 text-[#172033] outline-none transition placeholder:text-[#94a3b8] focus:border-[#60a5fa] focus:ring-3 focus:ring-[#dbeafe]"
            aria-label="말풍선 미리보기 메시지"
          />
          <span className="text-right text-[11px] font-bold text-[#94a3b8]">{text.length}/200</span>
        </label>
      </div>
    </section>
  );
}
