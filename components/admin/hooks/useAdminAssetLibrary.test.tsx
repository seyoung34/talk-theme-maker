import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAdminAssetLibrary } from "./useAdminAssetLibrary";
import { listAdminAssetLibrary } from "@/lib/theme/adminAssets";
import type { AdminAssetKind } from "@/lib/theme/adminAssets";

vi.mock("@/lib/theme/adminAssets", () => ({ listAdminAssetLibrary: vi.fn(async () => ({ items: [], truncated: false })) }));
afterEach(() => vi.clearAllMocks());

it("initial background avoids duplicate fetch; kind switches and refresh still query", async () => {
  const initialData = { ok: true as const, value: { items: [], truncated: true } };
  const onError = vi.fn();
  const { result, rerender } = renderHook(({ assetKind }: { assetKind: AdminAssetKind }) => useAdminAssetLibrary({ assetKind, onError, initialData }), {
    initialProps: { assetKind: "background" }, wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  expect(result.current.truncated).toBe(true);
  expect(listAdminAssetLibrary).not.toHaveBeenCalled();
  rerender({ assetKind: "icon" });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(listAdminAssetLibrary).toHaveBeenCalledWith({ assetKind: "icon" });
  rerender({ assetKind: "background" });
  await waitFor(() => expect(listAdminAssetLibrary).toHaveBeenCalledTimes(2));
  await act(() => result.current.refresh());
  expect(listAdminAssetLibrary).toHaveBeenCalledTimes(3);
});
