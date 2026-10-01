/**
 * 관리자 콘솔 메뉴 정의와 경로 판정.
 *
 * 메뉴 순서·그룹·배지 키는 여기 한 곳에만 둔다. 셸 컴포넌트는 이 값을 그리기만 한다.
 */

export type AdminConsoleBadgeKey = "openInquiries";

export type AdminConsoleBadges = Partial<Record<AdminConsoleBadgeKey, number>>;

export type AdminConsoleIcon =
  | "overview"
  | "templates"
  | "assets"
  | "notices"
  | "inquiries"
  | "promotions"
  | "analytics";

export type AdminConsoleNavItem = {
  href: string;
  label: string;
  icon: AdminConsoleIcon;
  badge?: AdminConsoleBadgeKey;
};

export type AdminConsoleNavGroup = {
  label?: string;
  items: AdminConsoleNavItem[];
};

export const adminConsoleNavGroups: AdminConsoleNavGroup[] = [
  { items: [{ href: "/admin", label: "개요", icon: "overview" }] },
  {
    label: "콘텐츠",
    items: [
      { href: "/admin/templates", label: "시스템 템플릿", icon: "templates" },
      { href: "/admin/assets", label: "에셋", icon: "assets" },
      { href: "/admin/notices", label: "공지", icon: "notices" },
    ],
  },
  {
    label: "고객",
    items: [
      { href: "/admin/inquiries", label: "문의", icon: "inquiries", badge: "openInquiries" },
      { href: "/admin/promotions", label: "프로모션", icon: "promotions" },
    ],
  },
  {
    label: "성과",
    items: [{ href: "/admin/analytics", label: "분석", icon: "analytics" }],
  },
];

/**
 * 전체 화면을 쓰는 작업 화면.
 *
 * 에셋은 좌측 분류 패널과 크기 조절 우측 패널을 가진 `100dvh` 작업 공간이다. 펼친 사이드바까지
 * 서면 1280px에서 카드 라이브러리가 3열을 유지하지 못하므로, 이 경로에서는 아이콘 레일만 둔다.
 */
const workspacePaths = ["/admin/assets"];

export type AdminConsoleMode = "standard" | "workspace";

export function getAdminConsoleMode(pathname: string): AdminConsoleMode {
  return workspacePaths.some((path) => matchesPath(pathname, path)) ? "workspace" : "standard";
}

/** 개요(`/admin`)는 정확히 일치할 때만, 나머지는 하위 경로까지 현재 메뉴로 본다. */
export function isAdminNavItemActive(pathname: string, href: string) {
  if (href === "/admin") return normalize(pathname) === "/admin";
  return matchesPath(pathname, href);
}

/** 배지는 양수만 표시한다. 조회 실패(undefined)와 0은 모두 숨긴다 — 실패를 0으로 보이지 않게. */
export function formatAdminBadge(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return value > 99 ? "99+" : String(Math.trunc(value));
}

function matchesPath(pathname: string, path: string) {
  const current = normalize(pathname);
  return current === path || current.startsWith(`${path}/`);
}

function normalize(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
