import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  verifyOtp: vi.fn(),
  recordConsents: vi.fn(),
  claimBonus: vi.fn(),
  track: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout/SiteHeader", () => ({ default: () => null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword, verifyOtp: mocks.verifyOtp, getUser: mocks.getUser, resend: vi.fn() },
  }),
}));
vi.mock("@/lib/policies/signupConsentClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/policies/signupConsentClient")>()),
  recordSignupConsentFromClient: mocks.recordConsents,
}));
vi.mock("@/lib/billing/signupBonusClient", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/billing/signupBonusClient")>()), claimSignupBonusFromClient: mocks.claimBonus }));
vi.mock("@/lib/analytics/ga4", () => ({ trackAnalyticsEvent: mocks.track }));

import LoginClient from "@/components/auth/LoginClient";

const retryButton = () => screen.findByRole("button", { name: "동의 기록 다시 저장" });
const trackedNames = () => mocks.track.mock.calls.map(([name]) => name);

async function submitEmailSignup() {
  render(<LoginClient />);
  fireEvent.click(screen.getByRole("tab", { name: "회원가입" }));
  fireEvent.click(screen.getByLabelText(/만 14세/));
  fireEvent.click(screen.getByLabelText(/이용약관에 동의/));
  fireEvent.click(screen.getByLabelText(/개인정보 처리방침에 동의/));
  fireEvent.click(screen.getByRole("button", { name: /이메일로 가입/ }));
  const [emailInput] = screen.getAllByPlaceholderText("name@example.com");
  fireEvent.change(emailInput, { target: { value: "new@example.com" } });
  const [password, confirm] = screen.getAllByPlaceholderText(/8자 이상|비밀번호 다시 입력/);
  fireEvent.change(password, { target: { value: "password123" } });
  fireEvent.change(confirm, { target: { value: "password123" } });
  fireEvent.submit(emailInput.closest("form")!);
}

describe("LoginClient email signup consent failure", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.claimBonus.mockResolvedValue({ granted: true, campaignKey: "signup_bonus_v1", creditsGranted: 1 });
  });
  afterEach(cleanup);

  it("keeps the immediate-session signup unfinished and retries only the consent write", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockRejectedValueOnce(new Error("rls")).mockResolvedValueOnce(undefined);

    await submitEmailSignup();

    expect(await retryButton()).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("정책 동의 내용을 저장하지 못했습니다");
    expect(mocks.claimBonus).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(trackedNames()).not.toContain("signup_completed");
    expect(mocks.track).toHaveBeenCalledWith("signup_failed", { provider: "email", reason: "consent_error" });

    fireEvent.click(await retryButton());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    expect(mocks.recordConsents).toHaveBeenCalledTimes(2);
    expect(mocks.claimBonus).toHaveBeenCalledTimes(1);
    expect(mocks.claimBonus).toHaveBeenCalledWith("u1");
    expect(trackedNames().filter((name) => name === "signup_completed")).toHaveLength(1);
    expect(trackedNames().filter((name) => name === "signup_bonus_granted")).toHaveLength(1);
  });

  it("stays on the retry step when the retry fails again", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockRejectedValue(new Error("down"));

    await submitEmailSignup();
    fireEvent.click(await retryButton());

    await waitFor(() => expect(mocks.recordConsents).toHaveBeenCalledTimes(2));
    expect(await retryButton()).not.toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("정책 동의 내용을 저장하지 못했습니다");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.claimBonus).not.toHaveBeenCalled();
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
  });

  it("does not repeat the one-time OTP verification when its consent write fails", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.recordConsents.mockRejectedValueOnce(new Error("rls")).mockResolvedValueOnce(undefined);

    await submitEmailSignup();
    fireEvent.change(await screen.findByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" }));

    expect(await retryButton()).toBeInTheDocument();
    // OTP 자체는 성공했으므로 인증 실패 문구가 아니라 동의 기록 문구여야 한다.
    expect(screen.getByRole("alert")).not.toHaveTextContent("인증번호가 만료");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.claimBonus).not.toHaveBeenCalled();

    fireEvent.click(await retryButton());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    expect(mocks.claimBonus).toHaveBeenCalledTimes(1);
    expect(trackedNames().filter((name) => name === "signup_completed")).toHaveLength(1);
  });

  it("still reports an invalid OTP as an authentication error without touching consent", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    mocks.verifyOtp.mockResolvedValue({ error: new Error("Token has expired or is invalid") });

    await submitEmailSignup();
    fireEvent.change(await screen.findByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("인증번호가 만료됐거나 올바르지 않습니다");
    expect(screen.queryByRole("button", { name: "동의 기록 다시 저장" })).toBeNull();
    expect(mocks.recordConsents).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("completes the immediate-session signup once when consent succeeds first time", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockResolvedValue(undefined);

    await submitEmailSignup();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
    expect(mocks.claimBonus).toHaveBeenCalledTimes(1);
    expect(trackedNames().filter((name) => name === "signup_completed")).toHaveLength(1);
    expect(trackedNames()).not.toContain("signup_failed");
  });

  it("does not record signup consent for password sign-in", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    render(<LoginClient />);
    const [emailInput] = screen.getAllByPlaceholderText("name@example.com");
    fireEvent.change(emailInput, { target: { value: "old@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("8자 이상"), { target: { value: "password123" } });
    fireEvent.submit(emailInput.closest("form")!);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
    expect(mocks.recordConsents).not.toHaveBeenCalled();
    expect(mocks.claimBonus).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("login_completed", { provider: "email" });
  });

  it("emits signup_failed for consent only once across repeated retry failures", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockRejectedValue(new Error("down"));

    await submitEmailSignup();
    fireEvent.click(await retryButton());
    await waitFor(() => expect(mocks.recordConsents).toHaveBeenCalledTimes(2));
    fireEvent.click(await retryButton());
    await waitFor(() => expect(mocks.recordConsents).toHaveBeenCalledTimes(3));

    expect(trackedNames().filter((name) => name === "signup_failed")).toHaveLength(1);
  });

  it("does not complete when the server refuses the retry write because the account changed", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    const { SignupConsentSessionChangedError } = await import("@/lib/policies/signupConsentClient");
    mocks.recordConsents.mockRejectedValueOnce(new Error("rls")).mockRejectedValueOnce(new SignupConsentSessionChangedError());

    await submitEmailSignup();
    fireEvent.click(await retryButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("계정이 달라");
    // 계정 확인은 서버가 쓰기와 같은 요청에서 하므로 클라이언트는 항상 가입 계정 id만 보낸다.
    expect(mocks.recordConsents).toHaveBeenCalledTimes(2);
    expect(mocks.recordConsents).toHaveBeenNthCalledWith(2, "u1");
    expect(mocks.claimBonus).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(trackedNames()).not.toContain("signup_completed");
    expect(mocks.track).toHaveBeenCalledWith("signup_failed", { provider: "email", reason: "session_changed" });
  });

  it("does not claim the bonus or complete when the server refuses the first consent write", async () => {
    const { SignupConsentSessionChangedError } = await import("@/lib/policies/signupConsentClient");
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockRejectedValue(new SignupConsentSessionChangedError());

    await submitEmailSignup();

    expect(await screen.findByRole("alert")).toHaveTextContent("계정이 달라");
    expect(mocks.claimBonus).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(trackedNames()).not.toContain("signup_completed");
  });

  it("does not complete when the server rejects the bonus claim for a different account", async () => {
    const { SignupBonusSessionChangedError } = await import("@/lib/billing/signupBonusClient");
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockResolvedValue(undefined);
    mocks.claimBonus.mockRejectedValue(new SignupBonusSessionChangedError());

    await submitEmailSignup();

    expect(await screen.findByRole("alert")).toHaveTextContent("계정이 달라");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(trackedNames()).not.toContain("signup_completed");
    expect(trackedNames()).not.toContain("signup_bonus_granted");
  });
});
