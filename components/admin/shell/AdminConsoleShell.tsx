"use client";

import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ExternalLink,
  Activity,
  Gift,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { markInternalTraffic } from "@/lib/analytics/ga4";
import { AdminNavigationGuardProvider, useAdminNavigationGuardCheck } from "./AdminNavigationGuard";
import {
  adminConsoleNavGroups,
  formatAdminBadge,
  getAdminConsoleMode,
  isAdminNavItemActive,
  type AdminConsoleBadges,
  type AdminConsoleIcon,
  type AdminConsoleNavItem,
} from "./navigation";

const icons: Record<AdminConsoleIcon, LucideIcon> = {
  overview: LayoutDashboard,
  templates: LayoutTemplate,
  assets: Images,
  notices: Megaphone,
  inquiries: MessageSquare,
  promotions: Gift,
  analytics: TrendingUp,
  exports: Activity,
};

const collapsedStorageKey = "talktheme:admin-sidebar-collapsed:v1";
const BadgeUpdateContext = createContext<((badges: AdminConsoleBadges) => void) | null>(null);

type AdminConsoleShellProps = {
  badges: AdminConsoleBadges;
  children: ReactNode;
};

/**
 * 관리자 콘솔 공통 셸.
 *
 * - standard: 펼친 사이드바(접으면 아이콘 레일). 화면이 자기 제목과 작업 버튼을 그린다.
 * - workspace: 항상 아이콘 레일. 에셋처럼 `100dvh`를 직접 쓰는 화면이 높이·스크롤을 관리한다.
 *
 * 공개 `SiteHeader`가 하던 관리자 기기의 GA4 내부 트래픽 표시는 셸이 맡는다. 셸은 관리자 확인을
 * 통과한 화면에서만 그려지므로 세션을 다시 묻지 않고 바로 표시한다.
 */
export default function AdminConsoleShell({ badges, children }: AdminConsoleShellProps) {
  const [loadedBadges, setLoadedBadges] = useState<AdminConsoleBadges | null>(null);
  return (
    <BadgeUpdateContext.Provider value={setLoadedBadges}>
      <AdminNavigationGuardProvider>
        <Tooltip.Provider delayDuration={150}>
          <ShellFrame badges={loadedBadges ?? badges}>{children}</ShellFrame>
        </Tooltip.Provider>
      </AdminNavigationGuardProvider>
    </BadgeUpdateContext.Provider>
  );
}

/** Streamed separately so badge lookups do not hold up the shell or route content. */
export function AdminConsoleBadgeSync({ badges }: { badges: AdminConsoleBadges }) {
  const updateBadges = useContext(BadgeUpdateContext);
  useEffect(() => { updateBadges?.(badges); }, [badges, updateBadges]);
  return null;
}

function ShellFrame({ badges, children }: AdminConsoleShellProps) {
  const pathname = usePathname() ?? "/admin";
  const mode = getAdminConsoleMode(pathname);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isRail = mode === "workspace" || isCollapsed;

  useEffect(() => {
    markInternalTraffic();
    setIsCollapsed(readCollapsed());
  }, []);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setIsCollapsed((current) => {
      writeCollapsed(!current);
      return !current;
    });
  };

  return (
    <div
      className="min-h-[100dvh] bg-[var(--color-background)] text-[var(--color-on-background)] lg:pl-[var(--admin-nav-width)]"
      style={{ "--admin-nav-width": isRail ? "64px" : "232px" } as React.CSSProperties}
    >
      <aside
        aria-label="관리자 메뉴"
        className="fixed inset-y-0 left-0 z-50 hidden w-[var(--admin-nav-width)] flex-col border-r border-[var(--color-outline-variant)] bg-white transition-[width] duration-200 lg:flex"
      >
        <div className={`flex h-14 shrink-0 items-center border-b border-[var(--color-outline-variant)] ${isRail ? "justify-center" : "justify-between px-4"}`}>
          {isRail ? (
            <GuardedLink href="/admin" aria-label="관리자 개요" className="grid size-9 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-info)]">
              <AppMark />
            </GuardedLink>
          ) : (
            <GuardedLink href="/admin" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-info)]">
              <AppMark />
              <span className="min-w-0">
                <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Talk Theme</span>
                <span className="block truncate text-sm font-black text-[var(--color-on-surface)]">관리자 콘솔</span>
              </span>
            </GuardedLink>
          )}
          {mode === "standard" && !isRail ? (
            <button type="button" onClick={toggleCollapsed} aria-label="메뉴 접기" title="메뉴 접기" className="grid size-8 place-items-center rounded-lg text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-low)]">
              <PanelLeftClose size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <NavList pathname={pathname} badges={badges} rail={isRail} />
        <div className="mt-auto grid gap-1 border-t border-[var(--color-outline-variant)] p-2">
          {mode === "standard" && isRail ? (
            <RailButton label="메뉴 펼치기" onClick={toggleCollapsed}>
              <PanelLeftOpen size={18} aria-hidden="true" />
            </RailButton>
          ) : null}
          <FooterLinks rail={isRail} />
        </div>
      </aside>

      {mode === "standard" ? (
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--color-outline-variant)] bg-white/90 px-4 backdrop-blur lg:hidden">
          <DrawerTrigger onOpen={() => setIsDrawerOpen(true)} />
          <AppMark />
          <span className="text-sm font-black text-[var(--color-on-surface)]">관리자 콘솔</span>
        </header>
      ) : (
        <div className="fixed bottom-4 left-4 z-50 lg:hidden">
          <DrawerTrigger onOpen={() => setIsDrawerOpen(true)} floating />
        </div>
      )}

      <Dialog.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-dialog-overlay fixed inset-0 z-[70] bg-black/40 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-[71] flex w-[min(280px,85vw)] flex-col bg-white shadow-2xl outline-none lg:hidden">
            <div className="flex h-14 items-center justify-between border-b border-[var(--color-outline-variant)] px-4">
              <Dialog.Title className="flex items-center gap-2.5 text-sm font-black text-[var(--color-on-surface)]">
                <AppMark />
                관리자 콘솔
              </Dialog.Title>
              <Dialog.Close aria-label="메뉴 닫기" className="grid size-8 place-items-center rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)]">
                <X size={16} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">관리자 화면 사이를 이동합니다.</Dialog.Description>
            <NavList pathname={pathname} badges={badges} rail={false} onNavigate={() => setIsDrawerOpen(false)} />
            <div className="mt-auto grid gap-1 border-t border-[var(--color-outline-variant)] p-2">
              <FooterLinks rail={false} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

function NavList({ pathname, badges, rail, onNavigate }: { pathname: string; badges: AdminConsoleBadges; rail: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="관리자 화면" className="grid min-h-0 content-start gap-4 overflow-y-auto p-2 py-3">
      {adminConsoleNavGroups.map((group, index) => (
        <div key={group.label ?? index} className="grid gap-0.5">
          {group.label ? (
            rail ? (
              <span className="mx-auto mb-1 h-px w-6 bg-[var(--color-outline-variant)]" aria-hidden="true" />
            ) : (
              <span className="px-3 pb-1 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">{group.label}</span>
            )
          ) : null}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} active={isAdminNavItemActive(pathname, item.href)} badge={item.badge ? formatAdminBadge(badges[item.badge]) : undefined} rail={rail} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * 셸의 모든 링크가 거치는 링크.
 *
 * 화면이 등록한 이동 판정(예: 에셋의 말풍선 장식 준비 중)을 먼저 묻는다. 링크마다 판정을 손으로
 * 붙이면 새 링크에서 빠지기 쉬워, 셸 안에서는 `next/link`를 직접 쓰지 않는다.
 */
function GuardedLink({ href, onClick, onNavigate, children, className, ...props }: ComponentProps<typeof Link> & { href: string; onNavigate?: () => void }) {
  const shouldBlock = useAdminNavigationGuardCheck();
  return (
    <Link
      {...props}
      href={href}
      className={`relative ${className ?? ""}`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (shouldBlock(href)) {
          event.preventDefault();
          return;
        }
        onNavigate?.();
      }}
    >
      {children}
      <NavigationFeedback />
    </Link>
  );
}

function NavigationFeedback() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span role="status" className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-[var(--color-info)] motion-safe:animate-pulse">
      <span className="sr-only">페이지를 이동하는 중입니다</span>
    </span>
  );
}

function NavLink({ item, active, badge, rail, onNavigate }: { item: AdminConsoleNavItem; active: boolean; badge?: string; rail: boolean; onNavigate?: () => void }) {
  const Icon = icons[item.icon];
  const label = badge ? `${item.label}, 처리 필요 ${badge}건` : item.label;

  const link = (
    <GuardedLink
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? label : undefined}
      onNavigate={onNavigate}
      className={[
        "relative flex items-center rounded-lg text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-info)]",
        rail ? "mx-auto size-10 justify-center" : "h-9 gap-3 px-3",
        active
          ? "bg-[var(--color-surface-container)] font-bold text-[var(--color-on-surface)]"
          : "font-semibold text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] hover:text-[var(--color-on-surface)]",
      ].join(" ")}
    >
      {/* 활성 표시: 배경만으로는 hover와 구분되지 않아 왼쪽 표시줄과 아이콘 색을 함께 쓴다. */}
      {active ? <span aria-hidden="true" className={`absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--color-info)] ${rail ? "-left-2" : "left-0"}`} /> : null}
      <Icon size={18} aria-hidden="true" className={`shrink-0 ${active ? "text-[var(--color-info)]" : ""}`} />
      {rail ? (
        badge ? <span className="absolute right-1 top-1 size-2 rounded-full bg-[var(--color-error)]" aria-hidden="true" /> : null
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {badge ? <span className="rounded-full bg-[var(--color-error)] px-1.5 py-0.5 text-[11px] font-black leading-none text-[var(--color-on-error)]" aria-label={`처리 필요 ${badge}건`}>{badge}</span> : null}
        </>
      )}
    </GuardedLink>
  );

  if (!rail) return link;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={8} className="z-[80] rounded-lg bg-[var(--color-inverse-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-inverse-on-surface)] shadow-lg">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function FooterLinks({ rail }: { rail: boolean }) {
  const links = [
    { href: "/account", label: "내 계정", Icon: UserRound },
    { href: "/", label: "사이트로 이동", Icon: ExternalLink },
  ];
  return (
    <>
      {links.map(({ href, label, Icon }) => {
        const link = (
          <GuardedLink
            key={href}
            href={href}
            aria-label={rail ? label : undefined}
            className={`flex items-center rounded-xl text-sm font-bold text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-low)] hover:text-[var(--color-on-surface)] ${rail ? "mx-auto size-10 justify-center" : "h-10 gap-3 px-3"}`}
          >
            <Icon size={18} aria-hidden="true" />
            {rail ? null : label}
          </GuardedLink>
        );
        if (!rail) return link;
        return (
          <Tooltip.Root key={href}>
            <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="right" sideOffset={8} className="z-[80] rounded-lg bg-[var(--color-inverse-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-inverse-on-surface)] shadow-lg">{label}</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" onClick={onClick} aria-label={label} className="mx-auto grid size-10 place-items-center rounded-xl text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-low)]">
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={8} className="z-[80] rounded-lg bg-[var(--color-inverse-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-inverse-on-surface)] shadow-lg">{label}</Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function DrawerTrigger({ onOpen, floating = false }: { onOpen: () => void; floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="관리자 메뉴 열기"
      className={floating
        ? "grid size-11 place-items-center rounded-full border border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface)] shadow-lg"
        : "grid size-9 place-items-center rounded-lg text-[var(--color-on-surface)] hover:bg-[var(--color-surface-low)]"}
    >
      <Menu size={18} aria-hidden="true" />
    </button>
  );
}

/** 앱 아이콘(`app/icon.svg`). 파비콘·홈 화면 아이콘과 같은 파일을 쓴다. */
function AppMark() {
  // eslint-disable-next-line @next/next/no-img-element -- 정적 SVG라 이미지 최적화가 필요 없다.
  return <img src="/icon.svg" alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg" />;
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(collapsedStorageKey) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(collapsedStorageKey, collapsed ? "1" : "0");
  } catch {
    // 저장소가 막힌 환경에서는 이번 방문 동안만 유지한다.
  }
}
