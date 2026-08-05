"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, LoaderCircle, Plus, Send, X } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import { InfoTip } from "@/components/common/InfoTip";
import { InquiryHeader, InquiryMessageList, formatInquiryDate } from "@/components/inquiry/InquiryThread";
import {
  canReplyToInquiry,
  hasUnreadAnswer,
  inquiryCategories,
  inquiryCategoryLabels,
  inquiryLimits,
  type Inquiry,
  type InquiryCategory,
} from "@/lib/inquiries/types";

export default function InquiriesClient() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState<InquiryCategory>("etc");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/inquiries", { cache: "no-store" });
      const payload = (await response.json()) as { inquiries?: Inquiry[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setInquiries(payload.inquiries ?? []);
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "문의 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = async (id: string) => {
    setNotice(null);
    try {
      const response = await fetch(`/api/inquiries/${id}`, { cache: "no-store" });
      const payload = (await response.json()) as { inquiry?: Inquiry; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setSelected(payload.inquiry ?? null);
      // 상세를 열면 서버가 읽음 시각을 기록하므로 목록의 미확인 표시도 갱신한다.
      void load();
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "문의를 불러오지 못했습니다.");
    }
  };

  const submit = async () => {
    setNotice(null);
    setIsSending(true);
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, body }),
      });
      const payload = (await response.json()) as { inquiry?: Inquiry; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setComposing(false);
      setTitle("");
      setBody("");
      await load();
      if (payload.inquiry) await open(payload.inquiry.id);
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "문의를 접수하지 못했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const sendReply = async () => {
    if (!selected) return;
    setNotice(null);
    setIsSending(true);
    try {
      const response = await fetch(`/api/inquiries/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setReply("");
      await open(selected.id);
      await load();
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "메시지를 보내지 못했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e8f1ff_0%,#f7fbff_24%,#ffffff_58%,#edf5ff_100%)]">
      <SiteHeader currentPath="/account/inquiries" />
      <div className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8 md:py-12">
        <Link href="/account" className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white px-3.5 py-2 text-xs font-black text-[#2f6bbf] transition hover:bg-[#f4f9ff]">
          <ArrowLeft size={15} aria-hidden="true" />
          마이페이지
        </Link>

        <header className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-1.5 text-[26px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)]">
            문의 내역
            <InfoTip label="문의 안내">
              답변은 이메일로 보내지 않습니다. 이 화면에서 확인해 주세요. 종료된 문의에는 답신할 수 없으며, 새로 접수하시면 됩니다.
            </InfoTip>
          </h1>
          {!composing && !selected ? (
            <button
              type="button"
              onClick={() => { setComposing(true); setNotice(null); }}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2f6bbf] px-4 text-sm font-extrabold text-white transition hover:bg-[#2a60ac]"
            >
              <Plus size={15} aria-hidden="true" />
              문의하기
            </button>
          ) : null}
        </header>

        {notice ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff1f0] px-4 py-3 text-xs font-bold text-[#c0392b]">
            <AlertCircle size={14} aria-hidden="true" />
            {notice}
          </p>
        ) : null}

        {composing ? (
          <section className="mt-6 rounded-[28px] border border-[#dbe8fb] bg-white/92 px-6 py-7 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-[var(--color-on-surface)]">새 문의</h2>
              <button type="button" onClick={() => setComposing(false)} className="inline-flex items-center gap-1 rounded-full border border-[#dbe8fb] px-3 py-1.5 text-xs font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff]">
                <X size={13} aria-hidden="true" />
                취소
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-black text-[#3d7bd6]">분류</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as InquiryCategory)} className="h-11 rounded-xl border border-[#dbe8fb] bg-white px-3 text-sm font-semibold outline-none focus-visible:border-[#2f6bbf]">
                  {inquiryCategories.map((value) => <option key={value} value={value}>{inquiryCategoryLabels[value]}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-black text-[#3d7bd6]">제목</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={inquiryLimits.titleMax} className="h-11 rounded-xl border border-[#dbe8fb] bg-white px-3 text-sm font-semibold outline-none focus-visible:border-[#2f6bbf]" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-black text-[#3d7bd6]">내용</span>
                <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={inquiryLimits.bodyMax} rows={7} className="rounded-xl border border-[#dbe8fb] bg-white p-3 text-sm font-semibold leading-6 outline-none focus-visible:border-[#2f6bbf]" placeholder={"내보내기 오류라면 마이페이지의 내보내기 번호를 함께 적어 주세요."} />
              </label>
              <button type="button" onClick={() => void submit()} disabled={isSending} className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-[#2f6bbf] px-4 text-sm font-extrabold text-white transition hover:bg-[#2a60ac] disabled:opacity-60">
                {isSending ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                접수하기
              </button>
            </div>
          </section>
        ) : null}

        {selected ? (
          <section className="mt-6 rounded-[28px] border border-[#dbe8fb] bg-white/92 px-6 py-7 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
            <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-1 rounded-full border border-[#dbe8fb] px-3 py-1.5 text-xs font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff]">
              <ArrowLeft size={13} aria-hidden="true" />
              목록으로
            </button>
            <div className="mt-4">
              <InquiryHeader inquiry={selected} />
              <h2 className="mt-2 text-xl font-extrabold text-[var(--color-on-surface)]">{selected.title}</h2>
            </div>
            <div className="mt-5">
              <InquiryMessageList messages={selected.messages ?? []} />
            </div>
            {canReplyToInquiry(selected.status) ? (
              <div className="mt-5 grid gap-2">
                <textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={inquiryLimits.bodyMax} rows={4} className="rounded-xl border border-[#dbe8fb] bg-white p-3 text-sm font-semibold leading-6 outline-none focus-visible:border-[#2f6bbf]" placeholder="추가로 남길 내용" />
                <button type="button" onClick={() => void sendReply()} disabled={isSending} className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-[#2f6bbf] px-4 text-sm font-extrabold text-white transition hover:bg-[#2a60ac] disabled:opacity-60">
                  {isSending ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                  보내기
                </button>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-[#f7fbff] px-4 py-3 text-xs font-bold text-[#5b6b82]">
                종료된 문의입니다. 이어서 물어보실 내용이 있으면 새 문의를 접수해 주세요.
              </p>
            )}
          </section>
        ) : null}

        {!selected && !composing ? (
          <section className="mt-6 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
            {isLoading ? (
              <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">불러오는 중입니다.</p>
            ) : inquiries.length < 1 ? (
              <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">접수한 문의가 없습니다.</p>
            ) : (
              <ul>
                {inquiries.map((inquiry) => (
                  <li key={inquiry.id} className="border-b border-[#e8eff8] last:border-b-0">
                    <button type="button" onClick={() => void open(inquiry.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[#f7fbff] sm:px-7">
                      <span className="min-w-0 flex-1">
                        <InquiryHeader inquiry={inquiry} />
                        <strong className="mt-1.5 block truncate text-sm font-extrabold text-[var(--color-on-surface)]">
                          {inquiry.title}
                          {hasUnreadAnswer(inquiry) ? <span className="ml-2 rounded-full bg-[#ff6b37] px-1.5 py-0.5 text-[10px] font-bold text-white">새 답변</span> : null}
                        </strong>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-[#8a99ad]">{formatInquiryDate(inquiry.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
