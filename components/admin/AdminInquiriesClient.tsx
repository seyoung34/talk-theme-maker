"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminInitialData } from "@/lib/admin/initialData";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import AdminPageHeader, { adminPageClassName, adminPageNarrowClassName } from "@/components/admin/shell/AdminPageHeader";
import { InquiryHeader, InquiryMessageList, formatInquiryDate } from "@/components/inquiry/InquiryThread";
import { inquiryLimits, inquiryStatuses, inquiryStatusLabels, type Inquiry, type InquiryStatus } from "@/lib/inquiries/types";

export default function AdminInquiriesClient({ initialData }: { initialData?: AdminInitialData<Inquiry[]> }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>(initialData?.ok ? initialData.value : []);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [filter, setFilter] = useState<InquiryStatus | "all">("open");
  const [isLoading, setIsLoading] = useState(!initialData);
  const [notice, setNotice] = useState<string | null>(initialData && !initialData.ok ? initialData.error : null);
  const initialFilter = useRef(initialData ? "open" : null);
  const [answer, setAnswer] = useState("");
  const [isSending, setIsSending] = useState(false);
  const router = useRouter();

  /**
   * 사이드바 "답변 대기" 배지를 다시 센다.
   *
   * 배지는 콘솔 layout이 서버에서 세는데, layout은 화면 이동 사이에 유지돼 이 화면의 목록만
   * 새로 받아서는 바뀌지 않는다. 문의 상태가 바뀔 수 있는 동작 뒤에만 서버 컴포넌트를 다시
   * 받는다. 첫 진입은 layout이 이미 같은 시점에 셌으므로 부르지 않는다.
   */
  const refreshShellBadges = useCallback(() => router.refresh(), [router]);

  const load = useCallback(async () => {
    setNotice(null);
    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`/api/admin/inquiries${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { inquiries?: Inquiry[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setInquiries(payload.inquiries ?? []);
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "문의 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (filter === initialFilter.current) return;
    initialFilter.current = null;
    void load();
  }, [filter, load]);

  const summary = useMemo(() => ({ total: inquiries.length }), [inquiries]);

  const open = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, { cache: "no-store" });
      const payload = (await response.json()) as { inquiry?: Inquiry; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setSelected(payload.inquiry ?? null);
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "문의를 불러오지 못했습니다.");
    }
  };

  const reply = async () => {
    if (!selected) return;
    setIsSending(true);
    try {
      const response = await fetch(`/api/admin/inquiries/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: answer }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setAnswer("");
      await open(selected.id);
      await load();
      refreshShellBadges();
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "답변을 저장하지 못했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const changeStatus = async (status: InquiryStatus) => {
    if (!selected) return;
    try {
      const response = await fetch(`/api/admin/inquiries/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      await open(selected.id);
      await load();
      refreshShellBadges();
    } catch (error) {
      setNotice(error instanceof Error && error.message ? error.message : "상태를 변경하지 못했습니다.");
    }
  };

  return (
    <main className={adminPageClassName}>
      <div className={adminPageNarrowClassName}>
        <AdminPageHeader
          eyebrow="Inquiries"
          title="문의 관리"
          info={(
            <InfoTip label="문의 관리 안내">
              답변을 등록해도 사용자에게 알림이 가지 않습니다. 사용자가 서비스에 들어와 확인합니다. 종료로 바꾸면 사용자는 더 이상 답신할 수 없습니다.
            </InfoTip>
          )}
        >
          <div className="flex flex-wrap gap-2">
            {(["open", "answered", "closed", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setFilter(value); setSelected(null); }}
                className={`rounded-full px-3 py-2 text-xs font-bold transition ${filter === value ? "bg-[#2f6bbf] text-white" : "border border-[#dbe8fb] bg-[#f7fbff] text-[#3d7bd6] hover:bg-[#eef5ff]"}`}
              >
                {value === "all" ? "전체" : inquiryStatusLabels[value]}
              </button>
            ))}
            <button type="button" onClick={() => { void load(); refreshShellBadges(); }} className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe8fb] px-3 py-2 text-xs font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff]">
              <RefreshCw size={13} aria-hidden="true" />
              새로고침
            </button>
          </div>
        </AdminPageHeader>

        {notice ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff1f0] px-4 py-3 text-xs font-bold text-[#c0392b]">
            <AlertCircle size={14} aria-hidden="true" />
            {notice}
          </p>
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
              {selected.exportJobId ? (
                <p className="mt-1.5 text-xs font-bold text-[#5b6b82]">내보내기 작업 {selected.exportJobId}</p>
              ) : null}
            </div>
            <div className="mt-5">
              <InquiryMessageList messages={selected.messages ?? []} />
            </div>
            <div className="mt-5 grid gap-2">
              <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={inquiryLimits.bodyMax} rows={5} className="rounded-xl border border-[#dbe8fb] bg-white p-3 text-sm font-semibold leading-6 outline-none focus-visible:border-[#2f6bbf]" placeholder="답변 내용" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void reply()} disabled={isSending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2f6bbf] px-4 text-sm font-extrabold text-white transition hover:bg-[#2a60ac] disabled:opacity-60">
                  {isSending ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                  답변 등록
                </button>
                {inquiryStatuses.filter((status) => status !== selected.status).map((status) => (
                  <button key={status} type="button" onClick={() => void changeStatus(status)} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[#dbe8fb] px-4 text-sm font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff]">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {inquiryStatusLabels[status]}으로
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-6 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
            {isLoading ? (
              <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">불러오는 중입니다.</p>
            ) : inquiries.length < 1 ? (
              <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">해당하는 문의가 없습니다. (전체 {summary.total}건)</p>
            ) : (
              <ul>
                {inquiries.map((inquiry) => (
                  <li key={inquiry.id} className="border-b border-[#e8eff8] last:border-b-0">
                    <button type="button" onClick={() => void open(inquiry.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[#f7fbff] sm:px-7">
                      <span className="min-w-0 flex-1">
                        <InquiryHeader inquiry={inquiry} />
                        <strong className="mt-1.5 block truncate text-sm font-extrabold text-[var(--color-on-surface)]">{inquiry.title}</strong>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-[#8a99ad]">{formatInquiryDate(inquiry.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
