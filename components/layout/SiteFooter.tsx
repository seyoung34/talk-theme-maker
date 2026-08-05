"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const hiddenPrefixes = ["/edit", "/admin", "/project"];
const policyLinks = [
  { href: "/notice", label: "공지사항" },
  { href: "/terms", label: "이용약관" }, { href: "/privacy", label: "개인정보 처리방침" }, { href: "/refund", label: "환불 안내" },
  { href: "/support", label: "고객지원" }, { href: "/copyright", label: "권리침해 신고" },
];

export default function SiteFooter() {
  const pathname = usePathname();
  if (hiddenPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;

  return (
    <footer className="border-t border-[#dbe8fb] bg-[#f4f9ff] text-[#5b6b82]">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3d7bd6]">Talk Theme</p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold" aria-label="정책 및 고객지원">{policyLinks.map((item) => <Link key={item.href} href={item.href} className="underline-offset-4 transition hover:text-[#2f6bbf] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bbf]">{item.label}</Link>)}</nav>
      </div>
    </footer>
  );
}
