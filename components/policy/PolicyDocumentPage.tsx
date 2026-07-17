import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CircleAlert, FileCheck2 } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import type { PolicyDocument } from "@/lib/policies/documents";
import type { PublicBusinessInfo } from "@/lib/policies/publicConfig";

export default function PolicyDocumentPage({ document, businessInfo }: { document: PolicyDocument; businessInfo: PublicBusinessInfo }) {
  const missingBusinessInfo = !businessInfo.operatorName || !businessInfo.representativeName || !businessInfo.businessRegistrationNumber || !businessInfo.businessAddress || !businessInfo.supportEmail;
  const privacyEmail = businessInfo.privacyContactEmail || businessInfo.supportEmail;
  const privacyPhone = businessInfo.privacyContactPhone || businessInfo.supportPhone;
  const missingPrivacyContact = !businessInfo.privacyContactName || !privacyEmail;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e8f1ff_0%,#f7fbff_24%,#ffffff_58%,#edf5ff_100%)] text-[var(--color-on-background)]">
      <SiteHeader currentPath={`/${document.slug}`} />
      <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white px-3.5 py-2 text-xs font-black text-[#2f6bbf] transition hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bbf]"><ArrowLeft size={15} aria-hidden="true" />서비스로 돌아가기</Link>

        <header className="relative mt-5 overflow-hidden rounded-[32px] border border-[#dbe8fb] bg-white/90 px-6 py-8 shadow-[0_24px_70px_rgba(47,107,191,0.1)] sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(91,155,255,0.2),transparent_68%)]" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#fff2bd] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#665300]"><FileCheck2 size={14} aria-hidden="true" />{document.eyebrow}</span>
            <h1 className="mt-5 font-[var(--font-display)] text-[38px] font-semibold tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[54px]">{document.title}</h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:text-base">{document.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-[#5b6b82]"><span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-3 py-2">시행일 {document.effectiveDate}</span><span className="rounded-full border border-[#dbe8fb] bg-[#f7fbff] px-3 py-2">서비스 {businessInfo.serviceName}</span></div>
          </div>
        </header>

        {document.slug === "support" ? <BusinessInfoPanel businessInfo={businessInfo} missing={missingBusinessInfo} /> : null}
        {document.slug === "privacy" ? <PrivacyContactPanel businessInfo={businessInfo} email={privacyEmail} phone={privacyPhone} missing={missingPrivacyContact} /> : null}

        <div className="mt-7 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          <nav className="hidden rounded-[24px] border border-[#dbe8fb] bg-white/84 p-4 shadow-[0_16px_42px_rgba(47,107,191,0.07)] lg:sticky lg:top-24 lg:block" aria-label={`${document.title} 목차`}>
            <p className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#3d7bd6]">Contents</p>
            <ol className="mt-3 grid gap-1">{document.sections.map((section, index) => <li key={section.title}><a href={`#policy-section-${index + 1}`} className="block rounded-xl px-2 py-2 text-xs font-bold leading-5 text-[#5b6b82] transition hover:bg-[#f4f9ff] hover:text-[#2f6bbf]">{section.title}</a></li>)}</ol>
          </nav>

          <article className="overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
            {document.sections.map((section, index) => (
              <section id={`policy-section-${index + 1}`} key={section.title} className="scroll-mt-24 border-b border-[#e8eff8] px-5 py-6 last:border-b-0 sm:px-8 sm:py-8">
                <div className="grid gap-4 sm:grid-cols-[48px_minmax(0,1fr)]">
                  <span className="grid size-10 place-items-center rounded-2xl bg-[#eaf2ff] font-[var(--font-display)] text-lg font-semibold text-[#2f6bbf]">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold tracking-[-0.02em] text-[var(--color-on-surface)] sm:text-xl">{section.title}</h2>
                    {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-3 text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)]">{paragraph}</p>)}
                    {section.items ? <ul className="mt-3 grid gap-2.5">{section.items.map((item) => <li key={item} className="grid grid-cols-[8px_minmax(0,1fr)] gap-3 text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)]"><span className="mt-[10px] size-2 rounded-full bg-[#fee500] ring-2 ring-[#fff2a8]" aria-hidden="true" /><span>{item}</span></li>)}</ul> : null}
                    {section.table ? <PolicyTable headers={section.table.headers} rows={section.table.rows} /> : null}
                  </div>
                </div>
              </section>
            ))}
          </article>
        </div>

        <aside className="mt-7 flex flex-col gap-4 rounded-[28px] border border-[#cfe0ff] bg-[#edf5ff] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><p className="text-sm font-extrabold text-[var(--color-on-surface)]">정책이나 처리 방식이 궁금한가요?</p><p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">고객지원 페이지에서 문의 유형과 필요한 정보를 확인할 수 있습니다.</p></div>
          <Link href="/support" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#2f6bbf] px-5 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(47,107,191,0.2)]">고객지원 확인<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </aside>
      </div>
    </main>
  );
}

function BusinessInfoPanel({ businessInfo, missing }: { businessInfo: PublicBusinessInfo; missing: boolean }) {
  const entries = [
    ["운영자/상호", businessInfo.operatorName], ["대표자", businessInfo.representativeName], ["사업자등록번호", businessInfo.businessRegistrationNumber],
    ["통신판매업 신고번호", businessInfo.ecommerceRegistrationNumber], ["사업장 주소", businessInfo.businessAddress], ["고객지원 이메일", businessInfo.supportEmail], ["고객지원 전화", businessInfo.supportPhone], ["운영 시간", businessInfo.supportHours],
  ];
  return (
    <section className="mt-7 rounded-[28px] border border-[#dbe8fb] bg-white/90 p-5 shadow-[0_18px_48px_rgba(47,107,191,0.08)] sm:p-7" aria-labelledby="business-info-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#3d7bd6]">Operator</p><h2 id="business-info-title" className="mt-1 text-xl font-extrabold">사업자·연락처</h2></div>{missing ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff2bd] px-3 py-1.5 text-[11px] font-black text-[#665300]"><CircleAlert size={14} aria-hidden="true" />출시 전 확인 필요</span> : null}</div>
      <dl className="mt-5 grid gap-px overflow-hidden rounded-[20px] border border-[#e3ecf7] bg-[#e3ecf7] sm:grid-cols-2">{entries.map(([label, value]) => <div key={label} className="bg-[#fafdff] p-4"><dt className="text-[11px] font-black uppercase tracking-[0.12em] text-[#5b6b82]">{label}</dt><dd className={`mt-1 text-sm font-extrabold ${value ? "text-[#1f2a44]" : "text-[#9a6b00]"}`}>{value || "운영 정보 확정 후 공개"}</dd></div>)}</dl>
    </section>
  );
}

function PrivacyContactPanel({ businessInfo, email, phone, missing }: { businessInfo: PublicBusinessInfo; email?: string; phone?: string; missing: boolean }) {
  const entries = [
    ["개인정보 보호책임자 또는 담당부서", businessInfo.privacyContactName],
    ["개인정보 문의 이메일", email],
    ["개인정보 문의 전화", phone],
  ];

  return (
    <section className="mt-7 rounded-[28px] border border-[#dbe8fb] bg-white/90 p-5 shadow-[0_18px_48px_rgba(47,107,191,0.08)] sm:p-7" aria-labelledby="privacy-contact-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#3d7bd6]">Privacy contact</p><h2 id="privacy-contact-title" className="mt-1 text-xl font-extrabold">개인정보 문의처</h2></div>{missing ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff2bd] px-3 py-1.5 text-[11px] font-black text-[#665300]"><CircleAlert size={14} aria-hidden="true" />출시 전 입력 필요</span> : null}</div>
      <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">개인정보 열람·정정·삭제, 처리정지, 동의 철회와 불만 처리를 아래 연락처로 요청할 수 있습니다.</p>
      <dl className="mt-5 grid gap-px overflow-hidden rounded-[20px] border border-[#e3ecf7] bg-[#e3ecf7] sm:grid-cols-3">{entries.map(([label, value]) => <div key={label} className="bg-[#fafdff] p-4"><dt className="text-[11px] font-black uppercase tracking-[0.12em] text-[#5b6b82]">{label}</dt><dd className={`mt-1 break-words text-sm font-extrabold ${value ? "text-[#1f2a44]" : "text-[#9a6b00]"}`}>{value || "운영 정보 확정 후 공개"}</dd></div>)}</dl>
    </section>
  );
}

function PolicyTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-[18px] border border-[#dbe8fb]" role="region" aria-label={`${headers.join(", ")} 표`} tabIndex={0}>
      <table className="min-w-[720px] w-full border-collapse text-left text-xs leading-5">
        <thead className="bg-[#edf5ff] text-[#315e9b]">
          <tr>{headers.map((header) => <th key={header} scope="col" className="border-b border-[#dbe8fb] px-4 py-3 font-extrabold">{header}</th>)}</tr>
        </thead>
        <tbody className="bg-white text-[var(--color-on-surface-variant)]">
          {rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`} className="border-b border-[#e8eff8] align-top last:border-b-0">{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className={`px-4 py-3 font-semibold ${cellIndex === 0 ? "whitespace-nowrap font-extrabold text-[var(--color-on-surface)]" : ""}`}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
