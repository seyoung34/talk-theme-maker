"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { History, Images, Palette, MessageSquare } from "lucide-react";
import { formatRelativeSavedAt } from "@/components/project/autosaveStatus";
import { describeAutosaveDraft, type EditorAutosaveDraft } from "@/lib/theme/project/autosaveDraft";

/**
 * 자동 저장된 초안을 이어할지 묻는다.
 *
 * 자동으로 덮어쓰지 않는 것이 이 화면의 목적이다. 사용자가 새 템플릿을 고르고 들어왔는데 이전 작업이
 * 조용히 복원되면 그것대로 혼란스럽고, 반대로 조용히 버리면 작업을 잃는다. 그래서 무엇이 들어 있는지
 * 보여주고 명시적으로 고르게 한다. 답하기 전에는 닫을 수 없다.
 */
export function AutosaveResumeDialog({
  record,
  onResume,
  onDiscard,
}: {
  record: EditorAutosaveDraft;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const summary = describeAutosaveDraft(record);
  const items = [
    { icon: Images, label: "이미지", count: summary.uploadCount },
    { icon: Palette, label: "색상", count: summary.colorCount },
    { icon: MessageSquare, label: "말풍선 편집", count: summary.bubbleEditCount },
  ].filter((item) => item.count > 0);

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[121] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-[#dbe3ed] bg-white p-6 shadow-[0_24px_72px_rgba(15,23,42,0.24)] outline-none"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
            <History size={20} aria-hidden="true" />
          </span>
          <Dialog.Title className="text-xl font-black text-[#0f172a]">이어서 편집할까요?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">
            저장하지 않고 나간 편집 내용이 남아 있어요.
          </Dialog.Description>

          <div className="mt-4 rounded-[18px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="truncate text-sm font-black text-[#0f172a]">{record.source.templateName}</p>
            <p className="mt-1 text-xs font-bold text-[#64748b]">
              {record.source.platform === "android" ? "Android" : "iOS"} · 마지막 편집 {formatRelativeSavedAt(record.updatedAt)}
            </p>
            {items.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {items.map((item) => (
                  <li
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe3ed] bg-white px-2.5 py-1 text-[11px] font-black text-[#475569]"
                  >
                    <item.icon size={13} aria-hidden="true" />
                    {item.label} {item.count}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs font-semibold text-[#94a3b8]">색상과 후보 선택만 바뀐 상태입니다.</p>
            )}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="min-h-11 rounded-xl border border-[#d1d5db] bg-white px-3 text-sm font-black text-[#475569] transition hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              onClick={onDiscard}
            >
              새로 시작
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl bg-[#0f172a] px-3 text-sm font-black text-white transition hover:bg-[#1e293b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              onClick={onResume}
              autoFocus
            >
              이어서 편집
            </button>
          </div>
          <p className="mt-3 text-[11px] font-semibold leading-5 text-[#94a3b8]">
            새로 시작하면 위 내용은 삭제됩니다. 저장해 둔 내 템플릿은 그대로 남습니다.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
