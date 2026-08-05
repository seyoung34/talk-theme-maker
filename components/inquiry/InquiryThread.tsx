"use client";

import { inquiryCategoryLabels, inquiryStatusLabels, toInquiryParagraphs, type Inquiry, type InquiryMessage } from "@/lib/inquiries/types";

/** 문의 헤더 — 분류·상태·접수 시각. 사용자·관리자 화면이 공유한다. */
export function InquiryHeader({ inquiry }: { inquiry: Inquiry }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
      <span className={`rounded-full px-2.5 py-1 ${statusToneClass(inquiry.status)}`}>{inquiryStatusLabels[inquiry.status]}</span>
      <span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-2.5 py-1 text-[#3d7bd6]">{inquiryCategoryLabels[inquiry.category]}</span>
      <span className="text-[#5b6b82]">{formatInquiryDate(inquiry.createdAt)}</span>
    </div>
  );
}

/**
 * 대화 스레드.
 *
 * 본문은 공지와 같은 규칙으로 문단만 나눈다. 마크다운을 파싱하지 않으므로 관리자·사용자가 쓴
 * 글이 마크업으로 해석될 여지가 없다.
 */
export function InquiryMessageList({ messages }: { messages: readonly InquiryMessage[] }) {
  return (
    <ol className="grid gap-3">
      {messages.map((message) => (
        <li
          key={message.id}
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            message.author === "admin"
              ? "justify-self-start border border-[#dbe8fb] bg-[#f7fbff]"
              : "justify-self-end border border-[#e8eff8] bg-white"
          }`}
        >
          <p className="text-[11px] font-black text-[#3d7bd6]">{message.author === "admin" ? "고객지원" : "내 문의"}</p>
          <div className="mt-1.5 grid gap-2">
            {toInquiryParagraphs(message.body).map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line text-sm font-semibold leading-6 text-[var(--color-on-surface)]">{paragraph}</p>
            ))}
          </div>
          <p className="mt-2 text-[10px] font-bold text-[#8a99ad]">{formatInquiryDateTime(message.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

export function statusToneClass(status: Inquiry["status"]) {
  if (status === "answered") return "bg-[#e6f7ec] text-[#1f7a43]";
  if (status === "closed") return "bg-[#eef2f7] text-[#5b6b82]";
  return "bg-[#fff2bd] text-[#665300]";
}

export function formatInquiryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}. ${String(date.getDate()).padStart(2, "0")}`;
}

export function formatInquiryDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatInquiryDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
