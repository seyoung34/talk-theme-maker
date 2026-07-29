import { describe, expect, it, vi } from "vitest";
import { deleteAccount, type AccountDeletionRepository } from "@/lib/account/deleteAccount";

function createRepository(
  overrides: Partial<AccountDeletionRepository> = {},
): AccountDeletionRepository {
  return {
    isAdmin: vi.fn().mockResolvedValue({ value: false, error: null }),
    hasPendingExport: vi.fn().mockResolvedValue({ value: false, error: null }),
    hasPendingPayment: vi.fn().mockResolvedValue({ value: false, error: null }),
    prepareServiceDataDeletion: vi.fn().mockResolvedValue({ error: null }),
    deleteAuthUser: vi.fn().mockResolvedValue({ error: null }),
    completeDeletionAudit: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

describe("deleteAccount", () => {
  it("deletes an eligible account after all guards pass", async () => {
    const repository = createRepository();

    await expect(deleteAccount("user-1", repository)).resolves.toEqual({ status: "deleted" });
    expect(repository.deleteAuthUser).toHaveBeenCalledWith("user-1");
  });

  it("blocks admin accounts before checking user-owned data", async () => {
    const repository = createRepository({
      isAdmin: vi.fn().mockResolvedValue({ value: true, error: null }),
    });

    await expect(deleteAccount("admin-1", repository)).resolves.toEqual({
      status: "blocked",
      reason: "admin_account",
    });
    expect(repository.hasPendingExport).not.toHaveBeenCalled();
    expect(repository.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("blocks while an export is pending", async () => {
    const repository = createRepository({
      hasPendingExport: vi.fn().mockResolvedValue({ value: true, error: null }),
    });

    await expect(deleteAccount("user-1", repository)).resolves.toEqual({
      status: "blocked",
      reason: "pending_export",
    });
    expect(repository.hasPendingPayment).not.toHaveBeenCalled();
    expect(repository.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("blocks while a payment is pending", async () => {
    const repository = createRepository({
      hasPendingPayment: vi.fn().mockResolvedValue({ value: true, error: null }),
    });

    await expect(deleteAccount("user-1", repository)).resolves.toEqual({
      status: "blocked",
      reason: "pending_payment",
    });
    expect(repository.prepareServiceDataDeletion).not.toHaveBeenCalled();
    expect(repository.deleteAuthUser).not.toHaveBeenCalled();
  });

  it.each([
    ["admin_lookup", "isAdmin"],
    ["pending_export_lookup", "hasPendingExport"],
    ["pending_payment_lookup", "hasPendingPayment"],
  ] as const)("returns the failed %s step without deleting the auth user", async (step, method) => {
    const repository = createRepository({
      [method]: vi.fn().mockResolvedValue({ value: false, error: new Error(step) }),
    });

    const result = await deleteAccount("user-1", repository);

    expect(result).toMatchObject({ status: "failed", step });
    expect(repository.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("does not delete the auth user when legal retention preparation fails", async () => {
    const repository = createRepository({
      prepareServiceDataDeletion: vi.fn().mockResolvedValue({ error: new Error("prepare failed") }),
    });

    const result = await deleteAccount("user-1", repository);

    expect(result).toMatchObject({ status: "failed", step: "service_data_deletion" });
    expect(repository.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("reports auth deletion failures", async () => {
    const repository = createRepository({
      deleteAuthUser: vi.fn().mockResolvedValue({ error: new Error("delete failed") }),
    });

    const result = await deleteAccount("user-1", repository);

    expect(result).toMatchObject({ status: "failed", step: "auth_user_delete" });
  });

  it("returns success with an audit warning when completion marking fails after auth deletion", async () => {
    const repository = createRepository({
      completeDeletionAudit: vi.fn().mockResolvedValue({ error: new Error("audit failed") }),
    });

    await expect(deleteAccount("user-1", repository)).resolves.toEqual({
      status: "deleted",
      auditCompletionPending: true,
    });
  });
});
