import { afterEach, describe, expect, it, vi } from "vitest";
import { getGa4VisitorConfigStatus, readGa4DailyVisitors, readGa4VisitorConfig } from "@/lib/analytics/ga4DataApi";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GA4 Data API visitor reader", () => {
  it("does not call Google when the optional server configuration is absent", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(readGa4DailyVisitors("2026-09-02", {
      env: {},
      fetchImpl,
    })).resolves.toEqual({
      status: "not_configured",
      visitors: null,
      sessions: null,
      newUsers: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads the aggregate metrics for an explicit KST calendar day", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      rows: [{ metricValues: [{ value: "12" }, { value: "19" }, { value: "5" }] }],
    }), { status: 200 }));

    const result = await readGa4DailyVisitors("2026-09-02", {
      env: {
        GA4_PROPERTY_ID: "properties/545151038",
        GA4_SERVICE_ACCOUNT_EMAIL: "ga4-admin@project.iam.gserviceaccount.com",
      },
      fetchImpl,
      getAccessToken: vi.fn().mockResolvedValue("short-lived-token"),
    });

    expect(result).toEqual({ status: "ok", visitors: 12, sessions: 19, newUsers: 5 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://analyticsdata.googleapis.com/v1beta/properties/545151038:runReport",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer short-lived-token" }),
      }),
    );
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      dateRanges: [{ startDate: "2026-09-02", endDate: "2026-09-02" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }, { name: "newUsers" }],
    });
  });

  it("turns provider failures into an unavailable metric instead of failing the whole summary", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("provider error", { status: 403 }));

    await expect(readGa4DailyVisitors("2026-09-02", {
      env: {
        GA4_PROPERTY_ID: "545151038",
        GA4_SERVICE_ACCOUNT_EMAIL: "ga4-admin@project.iam.gserviceaccount.com",
      },
      fetchImpl,
      getAccessToken: vi.fn().mockResolvedValue("short-lived-token"),
    })).resolves.toEqual({
      status: "unavailable",
      visitors: null,
      sessions: null,
      newUsers: null,
    });
  });

  it.each([
    { name: "a row without metric values", payload: { rows: [{}] } },
    { name: "a row with too few metric values", payload: { rows: [{ metricValues: [{ value: "1" }, { value: "2" }] }] } },
    { name: "a row with an invalid metric value", payload: { rows: [{ metricValues: [{ value: "1" }, { value: "NaN" }, { value: "3" }] }] } },
  ])("reports $name as unavailable instead of inventing zeroes", async ({ payload }) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(readGa4DailyVisitors("2026-09-02", {
      env: {
        GA4_PROPERTY_ID: "545151038",
        GA4_SERVICE_ACCOUNT_EMAIL: "ga4-admin@project.iam.gserviceaccount.com",
      },
      fetchImpl,
      getAccessToken: vi.fn().mockResolvedValue("short-lived-token"),
    })).resolves.toEqual({
      status: "unavailable",
      visitors: null,
      sessions: null,
      newUsers: null,
    });
  });

  it("reports zeroes only when GA4 explicitly returns an empty rows array", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

    await expect(readGa4DailyVisitors("2026-09-02", {
      env: {
        GA4_PROPERTY_ID: "545151038",
        GA4_SERVICE_ACCOUNT_EMAIL: "ga4-admin@project.iam.gserviceaccount.com",
      },
      fetchImpl,
      getAccessToken: vi.fn().mockResolvedValue("short-lived-token"),
    })).resolves.toEqual({ status: "ok", visitors: 0, sessions: 0, newUsers: 0 });
  });

  it("rejects malformed optional configuration before a network call", () => {
    expect(() => readGa4VisitorConfig({
      GA4_PROPERTY_ID: "not-a-property",
      GA4_SERVICE_ACCOUNT_EMAIL: "not-an-account",
    })).toThrow("GA4 Data API 설정 형식이 올바르지 않습니다.");
    expect(getGa4VisitorConfigStatus({
      GA4_PROPERTY_ID: "not-a-property",
      GA4_SERVICE_ACCOUNT_EMAIL: "not-an-account",
    })).toBe("invalid");
  });

  it("applies one deadline across token acquisition and the GA4 request", async () => {
    const getAccessToken = vi.fn(() => new Promise<string>(() => {}));

    await expect(readGa4DailyVisitors("2026-09-02", {
      env: {
        GA4_PROPERTY_ID: "545151038",
        GA4_SERVICE_ACCOUNT_EMAIL: "ga4-admin@project.iam.gserviceaccount.com",
      },
      getAccessToken,
      timeoutMs: 25,
    })).resolves.toMatchObject({ status: "unavailable" });
    expect(getAccessToken).toHaveBeenCalledOnce();
  });

  it("keeps the deadline active while the response JSON body is being read", async () => {
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, "json").mockImplementation(() => new Promise<unknown>(() => {}));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(readGa4DailyVisitors("2026-09-02", {
      env: {
        GA4_PROPERTY_ID: "545151038",
        GA4_SERVICE_ACCOUNT_EMAIL: "ga4-admin@project.iam.gserviceaccount.com",
      },
      fetchImpl,
      getAccessToken: vi.fn().mockResolvedValue("short-lived-token"),
      timeoutMs: 25,
    })).resolves.toMatchObject({ status: "unavailable" });
  });
});
