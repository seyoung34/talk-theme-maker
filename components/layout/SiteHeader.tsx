import Link from "next/link";

type SiteHeaderProps = {
  currentPath?: string;
};

const navItems = [{ href: "/template", label: "템플릿" }];

export default function SiteHeader({ currentPath }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#dbe2ea] bg-white/88 backdrop-blur">
      <div className="flex items-center justify-between px-5 py-4 mx-auto max-w-7xl md:px-8">
        <Link href="/" className="min-w-0">
          <strong className="text-[14px] font-extrabold uppercase tracking-[0.18em] text-[#64748b]">KakaoTalk Theme Maker</strong>
        </Link>
        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-black transition ${isActive
                  ? "bg-[#111827] text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]"
                  : "border border-[#d7dee8] bg-white text-[#334155] hover:border-[#94a3b8] hover:bg-[#f8fafc]"
                  }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
