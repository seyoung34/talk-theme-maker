"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const hiddenPrefixes = ["/edit", "/admin", "/project"];
// `고객지원`은 사업자 정보(상호·사업자등록번호·통신판매업 신고번호)를 담은 페이지라
// 법정 표시 경로다. 문의사항과 목적지가 달라 둘 다 남긴다.
const policyLinks = [
  { href: "/account/inquiries", label: "문의사항" },
  { href: "/terms", label: "이용약관" }, { href: "/privacy", label: "개인정보 처리방침" }, { href: "/refund", label: "환불 안내" },
  { href: "/support", label: "고객지원" }, { href: "/copyright", label: "권리침해 신고" },
];

export default function SiteFooter() {
  const pathname = usePathname();
  if (hiddenPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;

  return (
    <footer className="border-t border-[#dbe8fb] bg-[#f4f9ff] text-[#5b6b82]">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3d7bd6]">Talk Theme</p>
          {/*
            제3자 테마 제작 서비스라는 사실을 명시한다. 서비스명·설명·미리보기가 카카오톡을
            전면에 내세우므로, 표기가 없으면 카카오가 만들었거나 승인한 서비스로 오인될 수 있다.
            카카오 로그인은 공식 OAuth 를 쓰지만 그것이 제휴를 뜻하지는 않는다.

            상표는 호환 대상을 가리키는 용도로만 쓴다. 문구는 법률 검토 대상이다.
          */}
          <p className="mt-2.5 text-[11px] font-semibold leading-relaxed text-[#7d8ca3]">
            TalkTheme는 카카오톡 테마 파일을 만드는 독립 서비스로, 주식회사 카카오와 제휴·후원·협력 관계가 없으며 카카오가 운영하거나 승인한 서비스가 아닙니다.
            ‘카카오톡’, ‘카카오’와 관련 상표의 권리는 주식회사 카카오에 있으며, 이 서비스에서는 호환 대상을 가리키기 위해서만 사용합니다.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold" aria-label="정책 및 고객지원">{policyLinks.map((item) => <Link key={item.href} href={item.href} className="underline-offset-4 transition hover:text-[#2f6bbf] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bbf]">{item.label}</Link>)}</nav>
      </div>
    </footer>
  );
}
