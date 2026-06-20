import Link from "next/link";

type SiteHeaderProps = {
  currentPath?: string;
};

const navItems = [
  { href: "/template", label: "템플릿" },
  { href: "/account", label: "계정" },
  { href: "/admin", label: "관리자" },
];

export default function SiteHeader({ currentPath }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-outline-variant)]/70 bg-[color:rgba(251,249,244,0.86)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--color-on-surface-variant)]">KakaoTalk Theme Maker</p>
        </Link>

        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.href || (item.href === "/admin" && currentPath?.startsWith("/admin"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-black transition ${
                  isActive
                    ? "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)] shadow-[0_14px_28px_rgba(42,103,103,0.16)]"
                    : "border border-[var(--color-outline-variant)] bg-white/90 text-[var(--color-on-surface-variant)] hover:-translate-y-px hover:bg-white"
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
