import { templateNameMaxLength, validateTemplateName } from "@/lib/theme/templateName";
import { persistenceNotice } from "@/lib/theme/project/persistenceNotice";

type ActiveUserTemplate = { id: string; name: string; createdAt: number };

export function SaveTemplateDialog({ activeUserTemplate, isSaving, mode, name, onClose, onModeChange, onNameChange, onSubmit }: {
  activeUserTemplate: ActiveUserTemplate | null;
  isSaving: boolean;
  mode: "overwrite" | "saveAs";
  name: string;
  onClose: () => void;
  onModeChange: (mode: "overwrite" | "saveAs") => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canOverwrite = Boolean(activeUserTemplate);
  const nameValidation = validateTemplateName(name);
  const canSubmit = mode === "overwrite" ? canOverwrite : !nameValidation.error;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="내 템플릿 저장">
      <section className="grid w-full max-w-[420px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1"><h2 className="text-lg font-semibold text-[#0f172a]">내 템플릿 저장</h2><p className="text-sm leading-6 text-[#64748b]">{persistenceNotice.browserDetailed} {persistenceNotice.exportTemporary}</p></div>
          <button type="button" className="shrink-0 rounded-full border border-[#e5e7eb] px-3 py-2 text-sm font-semibold text-[#475569]" onClick={onClose} disabled={isSaving}>닫기</button>
        </div>
        <div className="grid gap-3">
          {canOverwrite ? <label className={`grid gap-2 rounded-2xl border px-4 py-3 ${mode === "overwrite" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}><div className="flex items-center gap-3"><input type="radio" name="save-mode" checked={mode === "overwrite"} onChange={() => onModeChange("overwrite")} /><div className="grid gap-0.5"><span className="text-sm font-semibold text-[#0f172a]">기존 템플릿에 저장</span><span className="text-xs text-[#64748b]">{activeUserTemplate?.name}</span></div></div></label> : null}
          <label className={`grid gap-3 rounded-2xl border px-4 py-3 ${mode === "saveAs" ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e7eb] bg-white"}`}><div className="flex items-center gap-3"><input type="radio" name="save-mode" checked={mode === "saveAs"} onChange={() => onModeChange("saveAs")} /><span className="text-sm font-semibold text-[#0f172a]">다른 이름으로 저장</span></div><input type="text" value={name} onChange={(event) => onNameChange(event.currentTarget.value)} disabled={mode !== "saveAs" || isSaving} placeholder="템플릿 이름" maxLength={templateNameMaxLength * 2} aria-invalid={mode === "saveAs" && Boolean(nameValidation.error)} className="h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition focus:border-[#2563eb] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]" /><div className="flex items-start justify-between gap-3 text-xs"><span className={mode === "saveAs" && nameValidation.error ? "font-semibold text-[#dc2626]" : "text-[#64748b]"}>{mode === "saveAs" ? nameValidation.error ?? "" : ""}</span><span className="shrink-0 text-[#64748b]">{Array.from(name.trim()).length}/{templateNameMaxLength}</span></div></label>
        </div>
        <div className="flex justify-end gap-2"><button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isSaving}>취소</button><button type="button" className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={onSubmit} disabled={!canSubmit || isSaving}>{isSaving ? "저장 중.." : "저장"}</button></div>
      </section>
    </div>
  );
}
