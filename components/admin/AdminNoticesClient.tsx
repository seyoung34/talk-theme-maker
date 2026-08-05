"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, LoaderCircle, Megaphone, Pencil, Pin, Plus, RefreshCw, Trash2, X } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import { noticeCategories, noticeCategoryLabels, type Notice, type NoticeCategory } from "@/lib/notices/types";

type FormState = {
  id: string | null;
  title: string;
  body: string;
  category: NoticeCategory;
  pinned: boolean;
  /** `datetime-local` 값. 빈 문자열이면 초안으로 저장한다. */
  publishedAt: string;
};

const emptyForm: FormState = { id: null, title: "", body: "", category: "update", pinned: false, publishedAt: "" };

export default function AdminNoticesClient() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/notices", { cache: "no-store" });
      const payload = (await response.json()) as { notices?: Notice[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setNotices(payload.notices ?? []);
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : "공지 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadNotices(); }, [loadNotices]);

  const summary = useMemo(() => ({
    total: notices.length,
    published: notices.filter((notice) => isLive(notice)).length,
    draft: notices.filter((notice) => !notice.publishedAt).length,
  }), [notices]);

  const submit = async () => {
    setFormError(null);
    setIsSaving(true);
    try {
      const target = form.id ? `/api/admin/notices/${form.id}` : "/api/admin/notices";
      const response = await fetch(target, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          category: form.category,
          pinned: form.pinned,
          // datetime-local은 타임존이 없다. 브라우저 로컬 시각으로 읽어 ISO로 넘긴다.
          publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setForm(emptyForm);
      await loadNotices();
    } catch (error) {
      setFormError(error instanceof Error && error.message ? error.message : "공지를 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/admin/notices/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      if (form.id === id) setForm(emptyForm);
      await loadNotices();
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : "공지를 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e8f1ff_0%,#f7fbff_24%,#ffffff_58%,#edf5ff_100%)]">
      <SiteHeader currentPath="/admin/notices" />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white px-3.5 py-2 text-xs font-black text-[#2f6bbf] transition hover:bg-[#f4f9ff]">
          <ArrowLeft size={15} aria-hidden="true" />
          관리자 홈
        </Link>

        <header className="mt-5 rounded-[28px] border border-[#dbe8fb] bg-white/92 px-6 py-7 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#fff2bd] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#665300]">
            <Megaphone size={14} aria-hidden="true" />
            Notices
          </span>
          <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)]">공지사항 관리</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">
            발행 시각을 비우면 초안으로 저장됩니다. 미래 시각을 넣으면 그때까지 노출되지 않습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#5b6b82]">
            <span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-3 py-2">전체 {summary.total}</span>
            <span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-3 py-2">노출 중 {summary.published}</span>
            <span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-3 py-2">초안 {summary.draft}</span>
          </div>
        </header>

        <section className="mt-6 rounded-[28px] border border-[#dbe8fb] bg-white/92 px-6 py-7 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[var(--color-on-surface)]">{form.id ? "공지 수정" : "새 공지"}</h2>
            {form.id ? (
              <button type="button" onClick={() => setForm(emptyForm)} className="inline-flex items-center gap-1 rounded-full border border-[#dbe8fb] px-3 py-1.5 text-xs font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff]">
                <X size={13} aria-hidden="true" />
                새로 작성
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-black text-[#3d7bd6]">제목</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                maxLength={200}
                className="h-11 rounded-xl border border-[#dbe8fb] bg-white px-3 text-sm font-semibold outline-none focus-visible:border-[#2f6bbf]"
                placeholder="공지 제목"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-black text-[#3d7bd6]">내용</span>
              <textarea
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                maxLength={20000}
                rows={8}
                className="rounded-xl border border-[#dbe8fb] bg-white p-3 text-sm font-semibold leading-6 outline-none focus-visible:border-[#2f6bbf]"
                placeholder={"빈 줄로 문단을 나눕니다.\n\n서식 문법은 지원하지 않습니다."}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-black text-[#3d7bd6]">분류</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as NoticeCategory }))}
                  className="h-11 rounded-xl border border-[#dbe8fb] bg-white px-3 text-sm font-semibold outline-none focus-visible:border-[#2f6bbf]"
                >
                  {noticeCategories.map((category) => <option key={category} value={category}>{noticeCategoryLabels[category]}</option>)}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-black text-[#3d7bd6]">발행 시각 (비우면 초안)</span>
                <input
                  type="datetime-local"
                  value={form.publishedAt}
                  onChange={(event) => setForm((current) => ({ ...current, publishedAt: event.target.value }))}
                  className="h-11 rounded-xl border border-[#dbe8fb] bg-white px-3 text-sm font-semibold outline-none focus-visible:border-[#2f6bbf]"
                />
              </label>

              <label className="flex items-end gap-2 pb-2 text-sm font-bold text-[#5b6b82]">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(event) => setForm((current) => ({ ...current, pinned: event.target.checked }))}
                  className="size-4"
                />
                목록 상단 고정
              </label>
            </div>

            {formError ? (
              <p className="flex items-center gap-2 rounded-xl bg-[#fff1f0] px-3 py-2.5 text-xs font-bold text-[#c0392b]">
                <AlertCircle size={14} aria-hidden="true" />
                {formError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={isSaving}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2f6bbf] px-4 text-sm font-extrabold text-white transition hover:bg-[#2a60ac] disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                {form.id ? "수정 저장" : "공지 등록"}
              </button>
              <button
                type="button"
                onClick={() => void loadNotices()}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dbe8fb] px-4 text-sm font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff]"
              >
                <RefreshCw size={15} aria-hidden="true" />
                새로고침
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          {loadError ? (
            <p className="flex items-center gap-2 border-b border-[#e8eff8] bg-[#fff1f0] px-5 py-3 text-xs font-bold text-[#c0392b]">
              <AlertCircle size={14} aria-hidden="true" />
              {loadError}
            </p>
          ) : null}

          {isLoading ? (
            <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">불러오는 중입니다.</p>
          ) : notices.length < 1 ? (
            <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">등록된 공지가 없습니다.</p>
          ) : (
            <ul>
              {notices.map((notice) => (
                <li key={notice.id} className="flex flex-wrap items-center gap-3 border-b border-[#e8eff8] px-5 py-4 last:border-b-0 sm:px-7">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className={`rounded-full px-2 py-0.5 ${isLive(notice) ? "bg-[#e6f7ec] text-[#1f7a43]" : notice.publishedAt ? "bg-[#fff2bd] text-[#665300]" : "bg-[#eef2f7] text-[#5b6b82]"}`}>
                        {isLive(notice) ? "노출 중" : notice.publishedAt ? "예약" : "초안"}
                      </span>
                      <span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-2 py-0.5 text-[#3d7bd6]">{noticeCategoryLabels[notice.category]}</span>
                      {notice.pinned ? <Pin size={12} aria-hidden="true" className="text-[#665300]" /> : null}
                    </span>
                    <strong className="mt-1.5 block truncate text-sm font-extrabold text-[var(--color-on-surface)]">{notice.title}</strong>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(toFormState(notice))}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dbe8fb] px-3 text-xs font-bold text-[#2f6bbf] transition hover:bg-[#f4f9ff]"
                    >
                      <Pencil size={13} aria-hidden="true" />
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(notice.id)}
                      disabled={deletingId === notice.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#f3d3d0] px-3 text-xs font-bold text-[#c0392b] transition hover:bg-[#fff1f0] disabled:opacity-60"
                    >
                      {deletingId === notice.id ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
                      삭제
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function isLive(notice: Notice) {
  return Boolean(notice.publishedAt) && new Date(notice.publishedAt!).getTime() <= Date.now();
}

/** ISO 문자열을 `datetime-local`이 받는 로컬 시각 문자열로 되돌린다. */
function toFormState(notice: Notice): FormState {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    category: notice.category,
    pinned: notice.pinned,
    publishedAt: notice.publishedAt ? toLocalInputValue(notice.publishedAt) : "",
  };
}

function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
