/** Failure is explicit so a failed initial lookup never appears as an empty successful list. */
export type AdminInitialData<T> = { ok: true; value: T } | { ok: false; error: string };

export async function loadAdminInitialData<T>(load: () => Promise<T>, error: string): Promise<AdminInitialData<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (cause) {
    console.warn("Admin initial lookup failed", cause);
    return { ok: false, error };
  }
}

export type AdminGrantCode = {
  id: string;
  code_preview: string;
  name: string;
  credits: number;
  status: "active" | "inactive";
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  created_at: string;
  updated_at: string;
};
