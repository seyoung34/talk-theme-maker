"use client";

import { useState } from "react";
import type { SystemTemplatePricingType, SystemTemplateStatus, SystemTemplateVisibility } from "@/lib/theme/systemTemplates";

const systemTemplateStatusLabels: Record<SystemTemplateStatus, string> = { draft: "초안", published: "게시됨", archived: "보관됨" };
const systemTemplateVisibilityLabels: Record<SystemTemplateVisibility, string> = { private: "비공개", public: "전체 공개" };
const systemTemplatePricingLabels: Record<SystemTemplatePricingType, string> = { free: "무료", paid: "유료 결제", credit: "크레딧" };

export function SystemTemplateSaveDialog({
  isSaving, title, description, tags, status, visibility, pricingType, priceAmount, creditCost, onClose,
  onTitleChange, onDescriptionChange, onTagsChange, onStatusChange, onVisibilityChange, onPricingTypeChange,
  onPriceAmountChange, onCreditCostChange, onSubmit,
}: {
  isSaving: boolean; title: string; description: string; tags: string; status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility; pricingType: SystemTemplatePricingType; priceAmount: string; creditCost: string;
  onClose: () => void; onTitleChange: (value: string) => void; onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string) => void; onStatusChange: (value: SystemTemplateStatus) => void;
  onVisibilityChange: (value: SystemTemplateVisibility) => void; onPricingTypeChange: (value: SystemTemplatePricingType) => void;
  onPriceAmountChange: (value: string) => void; onCreditCostChange: (value: string) => void; onSubmit: () => void;
}) {
  const canSubmit = title.trim().length > 0;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="시스템 템플릿 저장">
      <section className="grid w-full max-w-[560px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4"><div className="grid gap-1"><h2 className="text-lg font-semibold text-[#0f172a]">시스템 템플릿으로 저장</h2><p className="text-sm text-[#64748b]">현재 편집 상태를 basic 기반 overrides로 저장합니다.</p></div><button type="button" className="rounded-full border border-[#e5e7eb] px-3 py-1 text-sm font-semibold text-[#475569]" onClick={onClose} disabled={isSaving}>닫기</button></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 md:col-span-2"><span className="text-sm font-semibold text-[#0f172a]">Title</span><input type="text" value={title} onChange={(event) => onTitleChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" /></label>
          <label className="grid gap-2 md:col-span-2"><span className="text-sm font-semibold text-[#0f172a]">Description</span><textarea value={description} onChange={(event) => onDescriptionChange(event.currentTarget.value)} disabled={isSaving} className="min-h-20 rounded-xl border border-[#d1d5db] bg-white px-3 py-2 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" /></label>
          <label className="grid gap-2 md:col-span-2"><span className="text-sm font-semibold text-[#0f172a]">Tags</span><input type="text" value={tags} onChange={(event) => onTagsChange(event.currentTarget.value)} disabled={isSaving} placeholder="쉼표로 구분" className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" /></label>
          <div className="grid gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 md:col-span-2">
            <button type="button" className="flex items-center justify-between gap-3 text-left text-sm font-semibold text-[#0f172a]" onClick={() => setAdvancedOpen((current) => !current)} disabled={isSaving}><span>고급 설정</span><span className="text-xs text-[#64748b]">{advancedOpen ? "접기" : "열기"}</span></button>
            {advancedOpen ? <div className="grid gap-3 md:grid-cols-2">
              <SelectField label="상태" value={status} options={["draft", "published", "archived"]} optionLabels={systemTemplateStatusLabels} disabled={isSaving} onChange={(value) => onStatusChange(value as SystemTemplateStatus)} />
              <SelectField label="공개 범위" value={visibility} options={["private", "public"]} optionLabels={systemTemplateVisibilityLabels} disabled={isSaving} onChange={(value) => onVisibilityChange(value as SystemTemplateVisibility)} />
              <SelectField label="가격 정책" value={pricingType} options={["free", "paid", "credit"]} optionLabels={systemTemplatePricingLabels} disabled={isSaving} onChange={(value) => onPricingTypeChange(value as SystemTemplatePricingType)} />
              {pricingType === "paid" ? <label className="grid gap-2"><span className="text-sm font-semibold text-[#0f172a]">판매 가격</span><input type="number" min="0" value={priceAmount} onChange={(event) => onPriceAmountChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" /></label> : null}
              {pricingType === "credit" ? <label className="grid gap-2"><span className="text-sm font-semibold text-[#0f172a]">필요 크레딧</span><input type="number" min="0" value={creditCost} onChange={(event) => onCreditCostChange(event.currentTarget.value)} disabled={isSaving} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]" /></label> : null}
            </div> : null}
          </div>
        </div>
        <div className="flex justify-end gap-2"><button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isSaving}>취소</button><button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={onSubmit} disabled={!canSubmit || isSaving}>{isSaving ? "저장 중.." : "저장"}</button></div>
      </section>
    </div>
  );
}

function SelectField({ label, value, options, optionLabels, disabled, onChange }: { label: string; value: string; options: string[]; optionLabels?: Record<string, string>; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-[#0f172a]">{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb]">{options.map((option) => <option key={option} value={option}>{optionLabels?.[option] ?? option}</option>)}</select></label>;
}
