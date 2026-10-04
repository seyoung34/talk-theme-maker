import { expect, it, vi } from "vitest";
const { snapshot, count } = vi.hoisted(() => ({ snapshot: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/ops/repository", () => ({ getOpsStatusSnapshot: snapshot }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: count }) }) }) }));
import { getAdminConsoleBadges } from "./consoleBadges";
it("isolates badge failures without inventing a zero", async () => {
  count.mockResolvedValue({ count: 3, error: null }); snapshot.mockRejectedValue(new Error());
  expect(await getAdminConsoleBadges()).toEqual({ openInquiries: 3 });
  count.mockResolvedValue({ count: null, error: new Error() }); snapshot.mockResolvedValue({ staleExports: 4 });
  expect(await getAdminConsoleBadges()).toEqual({ staleExports: 4 });
});
