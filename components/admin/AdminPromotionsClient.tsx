"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, ArrowLeft, Check, Clipboard, Gift, LoaderCircle, Plus, RefreshCw, X } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import SignupBonusControl from "@/components/admin/SignupBonusControl";

type GrantCode = {
  id: string;
  code_preview: string;
  name: string;
  credits: number;
  status: "active" | "inactive";
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  created_at: string;
  updated_at: string;
};

type GenerationMode = "manual" | "automatic";

export default function AdminPromotionsClient() {
  const [codes, setCodes] = useState<GrantCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<GenerationMode>("automatic");
  const [name, setName] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [credits, setCredits] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const loadCodes = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/credit-codes", { cache: "no-store" });
      const payload = (await response.json()) as { codes?: GrantCode[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setCodes(payload.codes ?? []);
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : "지급 코드 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadCodes(); }, [loadCodes]);

  const summary = useMemo(() => ({
    total: codes.length,
    active: codes.filter((code) => getOperationalStatus(code).key === "active").length,
    redemptions: codes.reduce((sum, code) => sum + code.redemption_count, 0),
  }), [codes]);

  const createCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) return;
    setFormError(null);
    const parsedCredits = Number(credits);
    const parsedMax = maxRedemptions ? Number(maxRedemptions) : null;
    if (!name.trim()) { setFormError("캠페인 이름을 입력해 주세요."); return; }
    if (!Number.isInteger(parsedCredits) || parsedCredits < 1 || parsedCredits > 100) { setFormError("지급 크레딧은 1~100 사이의 정수로 입력해 주세요."); return; }
    if (mode === "manual" && !/^[A-Z0-9-]{4,32}$/.test(manualCode.trim().toUpperCase())) { setFormError("직접 입력 코드는 영문, 숫자, 하이픈을 사용해 4~32자로 입력해 주세요."); return; }
    if (parsedMax != null && (!Number.isInteger(parsedMax) || parsedMax < 1)) { setFormError("전체 사용 한도는 1 이상의 정수로 입력해 주세요."); return; }
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) { setFormError("종료 일시는 시작 일시보다 이후여야 합니다."); return; }

    setIsCreating(true);
    try {
      const response = await fetch("/api/admin/credit-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, code: mode === "manual" ? manualCode.trim().toUpperCase() : undefined, name: name.trim(), credits: parsedCredits, startsAt: startsAt ? new Date(startsAt).toISOString() : null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, maxRedemptions: parsedMax }),
      });
      const payload = (await response.json()) as { code?: string; item?: GrantCode; error?: string };
      if (!response.ok || !payload.code || !payload.item) throw new Error(payload.error ?? "지급 코드를 생성하지 못했습니다.");
      setCodes((current) => [payload.item!, ...current]);
      setCreatedCode(payload.code);
      setCopyState("idle");
      setName(""); setManualCode(""); setCredits("1"); setStartsAt(""); setExpiresAt(""); setMaxRedemptions("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "지급 코드를 생성하지 못했습니다.");
    } finally {
      setIsCreating(false);
    }
  };

  const updateStatus = async (item: GrantCode) => {
    if (updatingId) return;
    setUpdatingId(item.id);
    const nextStatus = item.status === "active" ? "inactive" : "active";
    try {
      const response = await fetch(`/api/admin/credit-codes/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setCodes((current) => current.map((code) => code.id === item.id ? { ...code, status: nextStatus, updated_at: new Date().toISOString() } : code));
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : "코드 상태를 변경하지 못했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  const copyCreatedCode = async () => {
    if (!createdCode) return;
    try { await navigator.clipboard.writeText(createdCode); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/admin/promotions" />
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8 md:px-8">
        <header>
          <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--color-on-surface-variant)]"><ArrowLeft size={17} aria-hidden="true" />관리자 페이지</Link>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-secondary)]">Promotions</p>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold">크레딧 지급 코드</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">캠페인 코드를 생성하고 사용량과 운영 상태를 관리합니다.</p>
        </header>

        <SignupBonusControl />

        <section className="grid gap-3 sm:grid-cols-3" aria-label="지급 코드 요약">
          <Summary label="전체 코드" value={summary.total} /><Summary label="현재 사용 가능" value={summary.active} /><Summary label="누적 사용" value={summary.redemptions} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
          <section className="rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 xl:sticky xl:top-24" aria-labelledby="create-code-title">
            <div className="flex items-center gap-2"><Plus size={19} className="text-[var(--color-secondary)]" aria-hidden="true" /><h2 id="create-code-title" className="text-lg font-extrabold">새 코드 생성</h2></div>
            <form className="mt-5 grid gap-4" onSubmit={createCode} noValidate>
              <fieldset><legend className="mb-2 text-sm font-extrabold">생성 방식</legend><div className="grid grid-cols-2 rounded-xl bg-[var(--color-surface-low)] p-1">{(["automatic", "manual"] as const).map((value) => <button key={value} type="button" className={`rounded-[9px] px-3 py-2.5 text-sm font-extrabold ${mode === value ? "bg-white shadow-sm" : "text-[var(--color-on-surface-variant)]"}`} onClick={() => { setMode(value); setFormError(null); }}>{value === "automatic" ? "자동 생성" : "직접 입력"}</button>)}</div></fieldset>
              {mode === "manual" ? <Field label="코드"><input className={inputClass} value={manualCode} onChange={(event) => setManualCode(event.currentTarget.value.toUpperCase())} placeholder="WELCOME-2026" maxLength={32} autoComplete="off" /></Field> : <p className="rounded-xl bg-[var(--color-surface-low)] px-3 py-2.5 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">추측하기 어려운 `XXXX-XXXX-XXXX` 형식으로 생성됩니다.</p>}
              <Field label="캠페인 이름"><input className={inputClass} value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="신규 사용자 이벤트" maxLength={80} /></Field>
              <Field label="지급 크레딧"><input className={inputClass} type="number" min={1} max={100} step={1} value={credits} onChange={(event) => setCredits(event.currentTarget.value)} /></Field>
              <Field label="전체 사용 한도 (선택)"><input className={inputClass} type="number" min={1} step={1} value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.currentTarget.value)} placeholder="제한 없음" /></Field>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Field label="시작 일시 (선택)"><input className={inputClass} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.currentTarget.value)} /></Field><Field label="종료 일시 (선택)"><input className={inputClass} type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.currentTarget.value)} /></Field></div>
              {formError ? <p className="flex gap-1.5 text-xs font-bold leading-5 text-[var(--color-error)]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />{formError}</p> : null}
              <button type="submit" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-inverse-surface)] px-4 py-3 text-sm font-extrabold text-[var(--color-inverse-on-surface)] disabled:opacity-55" disabled={isCreating}>{isCreating ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <Gift size={17} aria-hidden="true" />}코드 생성</button>
            </form>
          </section>

          <section className="rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 sm:p-6" aria-labelledby="code-list-title">
            <div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="code-list-title" className="text-lg font-extrabold">발급 코드</h2><p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">원문 코드는 생성 직후에만 확인할 수 있습니다.</p></div><button type="button" className="grid size-10 place-items-center rounded-xl border border-[var(--color-outline-variant)]" onClick={() => void loadCodes()} aria-label="목록 새로고침"><RefreshCw size={17} aria-hidden="true" /></button></div>
            {loadError ? <p className="mb-4 rounded-xl bg-[var(--color-error-container)] px-3 py-2.5 text-sm font-bold text-[var(--color-on-error-container)]" role="alert">{loadError}</p> : null}
            {isLoading ? <div className="h-32 animate-pulse rounded-xl bg-[var(--color-surface-low)]" /> : codes.length === 0 ? <div className="rounded-xl bg-[var(--color-surface-low)] px-4 py-10 text-center text-sm font-semibold text-[var(--color-on-surface-variant)]">아직 생성된 코드가 없습니다.</div> : <div className="divide-y divide-[var(--color-outline-variant)] border-y border-[var(--color-outline-variant)]">{codes.map((item) => <CodeRow key={item.id} item={item} updating={updatingId === item.id} onToggle={() => void updateStatus(item)} />)}</div>}
          </section>
        </div>
      </div>

      <Dialog.Root open={Boolean(createdCode)} onOpenChange={(open) => { if (!open) { setCreatedCode(null); setCopyState("idle"); } }}>
        <Dialog.Portal><Dialog.Overlay className="radix-dialog-overlay fixed inset-0 z-[60] bg-black/45" /><Dialog.Content className="radix-dialog-content fixed left-1/2 top-1/2 z-[61] w-[calc(100%-40px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_24px_72px_rgba(15,23,42,0.24)] outline-none"><Dialog.Title className="text-xl font-extrabold">지급 코드가 생성되었습니다</Dialog.Title><Dialog.Description className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">보안을 위해 전체 코드는 지금 한 번만 표시됩니다. 닫기 전에 복사해 보관하세요.</Dialog.Description><div className="mt-5 flex items-center gap-2 rounded-xl bg-[var(--color-surface-low)] p-3"><code className="min-w-0 flex-1 break-all text-center text-base font-black tracking-[0.1em]">{createdCode}</code><button type="button" className="grid size-10 shrink-0 place-items-center rounded-lg bg-white" onClick={() => void copyCreatedCode()} aria-label="코드 복사">{copyState === "copied" ? <Check size={18} className="text-[#155d45]" aria-hidden="true" /> : <Clipboard size={18} aria-hidden="true" />}</button></div>{copyState === "failed" ? <p className="mt-2 text-xs font-bold text-[var(--color-error)]">자동 복사에 실패했습니다. 코드를 직접 선택해 복사해 주세요.</p> : null}<Dialog.Close asChild><button type="button" className="mt-5 min-h-11 w-full rounded-xl bg-[var(--color-inverse-surface)] px-4 py-2.5 text-sm font-extrabold text-[var(--color-inverse-on-surface)]">확인</button></Dialog.Close><Dialog.Close asChild><button type="button" className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg hover:bg-[var(--color-surface-low)]" aria-label="닫기"><X size={18} aria-hidden="true" /></button></Dialog.Close></Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-[var(--color-outline-variant)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)]";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-extrabold">{label}{children}</label>; }
function Summary({ label, value }: { label: string; value: number }) { return <div className="rounded-[18px] border border-[var(--color-outline-variant)] bg-white px-5 py-4"><span className="text-xs font-bold text-[var(--color-on-surface-variant)]">{label}</span><strong className="mt-1 block text-2xl font-extrabold">{value.toLocaleString("ko-KR")}</strong></div>; }

function CodeRow({ item, updating, onToggle }: { item: GrantCode; updating: boolean; onToggle: () => void }) {
  const operational = getOperationalStatus(item);
  return <article className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${operational.className}`}>{operational.label}</span><strong className="truncate text-sm font-extrabold">{item.name}</strong></div><p className="mt-1 font-mono text-xs font-bold tracking-[0.08em] text-[var(--color-on-surface-variant)]">{item.code_preview}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--color-on-surface-variant)]"><span>{item.credits}크레딧</span><span>{item.redemption_count.toLocaleString("ko-KR")} / {item.max_redemptions?.toLocaleString("ko-KR") ?? "∞"}회 사용</span><span>{formatPeriod(item)}</span></div></div><button type="button" className="min-h-10 rounded-xl border border-[var(--color-outline-variant)] px-3 py-2 text-xs font-extrabold disabled:opacity-55" onClick={onToggle} disabled={updating}>{updating ? "변경 중" : item.status === "active" ? "중지" : "재활성화"}</button></article>;
}

function getOperationalStatus(item: GrantCode) {
  const now = Date.now();
  if (item.status === "inactive") return { key: "inactive", label: "중지", className: "bg-[var(--color-surface-high)] text-[var(--color-on-surface-variant)]" };
  if (item.starts_at && new Date(item.starts_at).getTime() > now) return { key: "scheduled", label: "예정", className: "bg-[#e8eefc] text-[#294b8f]" };
  if (item.expires_at && new Date(item.expires_at).getTime() <= now) return { key: "expired", label: "종료", className: "bg-[var(--color-error-container)] text-[var(--color-on-error-container)]" };
  if (item.max_redemptions != null && item.redemption_count >= item.max_redemptions) return { key: "exhausted", label: "소진", className: "bg-[#fff2bd] text-[#665300]" };
  return { key: "active", label: "사용 가능", className: "bg-[#e4f6ee] text-[#155d45]" };
}

function formatPeriod(item: GrantCode) {
  const formatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  if (!item.starts_at && !item.expires_at) return "기간 제한 없음";
  return `${item.starts_at ? formatter.format(new Date(item.starts_at)) : "즉시"} ~ ${item.expires_at ? formatter.format(new Date(item.expires_at)) : "제한 없음"}`;
}
