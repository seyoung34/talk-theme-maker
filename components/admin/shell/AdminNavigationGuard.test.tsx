import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminNavigationGuardProvider, useAdminNavigationGuard, useAdminNavigationGuardCheck } from "./AdminNavigationGuard";

function Probe({ onReady }: { onReady: (check: (href: string) => boolean) => void }) {
  onReady(useAdminNavigationGuardCheck());
  return null;
}

function Screen({ block }: { block: boolean }) {
  useAdminNavigationGuard(() => block);
  return null;
}

describe("admin navigation guard", () => {
  it("등록된 화면 판정을 따르고 최신 값을 읽는다", () => {
    let check: (href: string) => boolean = () => false;
    const { rerender } = render(
      <AdminNavigationGuardProvider>
        <Screen block={false} />
        <Probe onReady={(next) => { check = next; }} />
      </AdminNavigationGuardProvider>,
    );
    expect(check("/admin")).toBe(false);

    rerender(
      <AdminNavigationGuardProvider>
        <Screen block />
        <Probe onReady={(next) => { check = next; }} />
      </AdminNavigationGuardProvider>,
    );
    expect(check("/admin")).toBe(true);
  });

  it("화면이 사라지면 판정도 해제된다", () => {
    let check: (href: string) => boolean = () => true;
    const { rerender } = render(
      <AdminNavigationGuardProvider>
        <Screen block />
        <Probe onReady={(next) => { check = next; }} />
      </AdminNavigationGuardProvider>,
    );
    expect(check("/admin")).toBe(true);

    rerender(
      <AdminNavigationGuardProvider>
        <Probe onReady={(next) => { check = next; }} />
      </AdminNavigationGuardProvider>,
    );
    expect(check("/admin")).toBe(false);
  });

  it("셸 밖에서는 아무것도 막지 않는다", () => {
    let check: (href: string) => boolean = () => true;
    render(<><Screen block /><Probe onReady={(next) => { check = next; }} /></>);
    expect(check("/admin")).toBe(false);
  });
});
