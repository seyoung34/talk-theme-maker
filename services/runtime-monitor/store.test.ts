import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ file: vi.fn(), save: vi.fn(), download: vi.fn(), metadata: vi.fn(), exists: vi.fn() }));
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() { return { file: mocks.file }; }
  },
}));
import { createGcsStore, validateState } from "./store";
import { emptyState } from "./model";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.file.mockImplementation(() => ({
    metadata: { generation: "12" }, getMetadata: mocks.metadata,
    download: mocks.download, save: mocks.save, exists: mocks.exists,
  }));
});
it("reads the same immutable generation then uses create/update CAS preconditions", async () => {
  mocks.metadata.mockResolvedValue([{ generation: "11", size: 100 }]);
  mocks.download.mockResolvedValue([Buffer.from(JSON.stringify(emptyState()))]);
  const store = createGcsStore("bucket", "monitor/state-v1.json");
  const snapshot = await store.load();
  expect(snapshot.generation).toBe("11");
  expect(mocks.file).toHaveBeenCalledWith("monitor/state-v1.json", { generation: "11" });
  expect(await store.save(snapshot.state, snapshot.generation)).toBe("12");
  expect(mocks.save.mock.calls[0][1].preconditionOpts).toEqual({ ifGenerationMatch: "11" });
  await store.save(emptyState(), "0");
  expect(mocks.save.mock.calls[1][1].preconditionOpts).toEqual({ ifGenerationMatch: "0" });
});
it("missing state is empty only when live object is absent", async () => {
  mocks.metadata.mockRejectedValue({ code: 404 });
  mocks.exists.mockResolvedValue([false]);
  expect((await createGcsStore("bucket", "state").load()).generation).toBe("0");
  mocks.exists.mockResolvedValue([true]);
  await expect(createGcsStore("bucket", "state").load()).rejects.toThrow("state_read_failed");
});
it("permissions/schema failures and CAS conflicts never reset state or overwrite it", async () => {
  mocks.metadata.mockRejectedValue({ code: 403, message: "private-token" });
  await expect(createGcsStore("bucket", "state").load()).rejects.toThrow("state_read_failed");
  mocks.save.mockRejectedValue({ code: 412 });
  await expect(createGcsStore("bucket", "state").save(emptyState(), "11")).rejects.toThrow("state_write_failed");
  expect(mocks.save).toHaveBeenCalledOnce();
});
it("rejects corrupt or oversized incident, lease and message data", () => {
  for (const value of [
    { ...emptyState(), version: 2 },
    { ...emptyState(), incidents: { userPrivate: {} } },
    { ...emptyState(), lease: { owner: "private", until: 1 } },
    { ...emptyState(), evidence: Array.from({ length: 121 }, () => ({})) },
    { ...emptyState(), pending: [{ sample: { source: "public_http", outcome: "failed", code: "private@email", observationId: "1", at: 1 } }] },
  ]) expect(() => validateState(value)).toThrow();
});
