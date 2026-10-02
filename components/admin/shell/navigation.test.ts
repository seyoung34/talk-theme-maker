import { describe, expect, it } from "vitest";
import { adminConsoleNavGroups, formatAdminBadge, getAdminConsoleMode, isAdminNavItemActive } from "./navigation";

describe("admin console navigation", () => {
  it("개요는 /admin 에서만 활성이다", () => {
    expect(isAdminNavItemActive("/admin", "/admin")).toBe(true);
    expect(isAdminNavItemActive("/admin/", "/admin")).toBe(true);
    expect(isAdminNavItemActive("/admin/assets", "/admin")).toBe(false);
  });

  it("하위 경로까지 현재 메뉴로 보지만 접두사만 같은 경로는 제외한다", () => {
    expect(isAdminNavItemActive("/admin/templates", "/admin/templates")).toBe(true);
    expect(isAdminNavItemActive("/admin/templates/abc", "/admin/templates")).toBe(true);
    expect(isAdminNavItemActive("/admin/templatesx", "/admin/templates")).toBe(false);
  });

  it("에셋만 workspace 모드다", () => {
    expect(getAdminConsoleMode("/admin/assets")).toBe("workspace");
    expect(getAdminConsoleMode("/admin")).toBe("standard");
    expect(getAdminConsoleMode("/admin/analytics")).toBe("standard");
  });

  it("배지는 양수만 표시하고 실패와 0을 구분해 그리지 않는다", () => {
    expect(formatAdminBadge(undefined)).toBeUndefined();
    expect(formatAdminBadge(0)).toBeUndefined();
    expect(formatAdminBadge(3)).toBe("3");
    expect(formatAdminBadge(120)).toBe("99+");
  });

  it("메뉴 경로가 겹치지 않는다", () => {
    const hrefs = adminConsoleNavGroups.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
