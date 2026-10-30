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

import { SignupConsentVersionChangedError } from "@/lib/policies/signupConsentClient";
import LoginClient from "@/components/auth/LoginClient";

const retryButton = () => screen.findByRole("button", { name: "동의하고 기록 저장" });
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
    window.localStorage.clear();
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
    expect(screen.queryByRole("button", { name: "동의하고 기록 저장" })).toBeNull();
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

  it("keeps the retry state and does not complete when the bonus claim hits a transient auth error, then recovers on retry", async () => {
    const { SignupBonusAuthUnavailableError } = await import("@/lib/billing/signupBonusClient");
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockResolvedValue(undefined);
    mocks.claimBonus.mockRejectedValueOnce(new SignupBonusAuthUnavailableError()).mockResolvedValueOnce({ granted: true, campaignKey: "signup_bonus_v1", creditsGranted: 1 });

    await submitEmailSignup();

    expect(await screen.findByRole("alert")).toHaveTextContent("로그인 상태를 확인하지 못해");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(trackedNames()).not.toContain("signup_completed");
    expect(trackedNames()).not.toContain("signup_failed");
    expect(window.localStorage.getItem("talktheme.pendingSignupConsent")).toContain("u1");

    fireEvent.click(await retryButton());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
    expect(mocks.claimBonus).toHaveBeenNthCalledWith(2, "u1");
    expect(trackedNames().filter((name) => name === "signup_completed")).toHaveLength(1);
    expect(window.localStorage.getItem("talktheme.pendingSignupConsent")).toBeNull();
  });

  it.each([
    ["network failure", () => new TypeError("Failed to fetch")],
    ["429/500 response", () => new Error("가입 혜택을 처리하지 못했습니다.")],
  ])("keeps the retry state and does not complete on %s from the bonus claim", async (_name, makeError) => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    mocks.recordConsents.mockResolvedValue(undefined);
    mocks.claimBonus.mockRejectedValueOnce(makeError()).mockResolvedValueOnce({ granted: false });

    await submitEmailSignup();

    expect(await screen.findByRole("alert")).toHaveTextContent("로그인 상태를 확인하지 못해");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(trackedNames()).not.toContain("signup_completed");
    expect(window.localStorage.getItem("talktheme.pendingSignupConsent")).toContain("u1");

    fireEvent.click(await retryButton());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
    expect(window.localStorage.getItem("talktheme.pendingSignupConsent")).toBeNull();
  });

  describe("persisted consent retry", () => {
    const pendingKey = "talktheme.pendingSignupConsent";
    const markPending = (userId: string, createdAt = Date.now()) => window.localStorage.setItem(pendingKey, JSON.stringify({ userId, createdAt }));
    const submitPasswordSignIn = () => {
      const [emailInput] = screen.getAllByPlaceholderText("name@example.com");
      fireEvent.change(emailInput, { target: { value: "old@example.com" } });
      fireEvent.change(screen.getByPlaceholderText("8자 이상"), { target: { value: "password123" } });
      fireEvent.submit(emailInput.closest("form")!);
    };

    const checkAll = () => {
      fireEvent.click(screen.getByLabelText(/만 14세/));
      fireEvent.click(screen.getByLabelText(/이용약관.*동의/));
      fireEvent.click(screen.getByLabelText(/개인정보 처리방침.*동의/));
    };

    it("restores the retry step after reload but requires fresh acceptance before any write", async () => {
      mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
      mocks.recordConsents.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(undefined);
      await submitEmailSignup();
      await retryButton();
      expect(window.localStorage.getItem(pendingKey)).toContain("u1");
      expect(mocks.recordConsents).toHaveBeenCalledTimes(1);

      cleanup(); // 새로고침: 메모리 상태 소실, localStorage 유지
      render(<LoginClient />);

      const button = await retryButton();
      expect(button).toBeDisabled();
      expect(screen.getByLabelText(/이용약관\(2026-07-30 버전\)/)).not.toBeChecked();
      expect(mocks.recordConsents).toHaveBeenCalledTimes(1);

      checkAll();
      fireEvent.click(await retryButton());
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
      expect(mocks.recordConsents).toHaveBeenLastCalledWith("u1");
      expect(mocks.signUp).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem(pendingKey)).toBeNull();
    });

    it("after reload, a network failure on the bonus claim keeps the pending marker and does not complete", async () => {
      mocks.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
      mocks.recordConsents.mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
      mocks.claimBonus.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ granted: false });
      await submitEmailSignup();
      await retryButton();

      cleanup();
      render(<LoginClient />);
      await retryButton();
      checkAll();
      fireEvent.click(await retryButton());

      expect(await screen.findByRole("alert")).toHaveTextContent("로그인 상태를 확인하지 못해");
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(trackedNames()).not.toContain("signup_completed");
      expect(window.localStorage.getItem(pendingKey)).toContain("u1");

      fireEvent.click(await retryButton());
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
      expect(window.localStorage.getItem(pendingKey)).toBeNull();
    });

    it("a forged marker for the signed-in user only shows the consent step and never records automatically", async () => {
      markPending("u1");
      render(<LoginClient />);
      const button = await retryButton();
      expect(button).toBeDisabled();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mocks.recordConsents).not.toHaveBeenCalled();
      expect(mocks.claimBonus).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("keeps an old pending marker instead of discarding it after 24 hours and still asks for fresh acceptance", async () => {
      markPending("u1", Date.now() - 30 * 24 * 60 * 60 * 1000);
      render(<LoginClient />);
      expect(await retryButton()).toBeDisabled();
      expect(window.localStorage.getItem(pendingKey)).toContain("u1");
      expect(mocks.recordConsents).not.toHaveBeenCalled();
    });

    it("asks again with the current versions when the server reports a policy rollover", async () => {
      markPending("u1");
      mocks.recordConsents.mockRejectedValueOnce(new SignupConsentVersionChangedError());
      render(<LoginClient />);
      await retryButton();
      checkAll();
      fireEvent.click(await retryButton());
      expect(await screen.findByText(/정책이 갱신되었습니다/)).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(pendingKey)).toContain("u1");
    });

    it("does not restore the retry step when the logged-in account differs from the pending one", async () => {
      markPending("u1");
      mocks.getUser.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
      render(<LoginClient />);

      await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "동의하고 기록 저장" })).toBeNull();
      expect(mocks.recordConsents).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(pendingKey)).toContain("u1");
    });

    it("never checks the session or writes consent when nothing is pending", async () => {
      render(<LoginClient />);
      await Promise.resolve();
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.recordConsents).not.toHaveBeenCalled();
    });

    it("keeps the retry step on password sign-in of the pending account instead of completing login", async () => {
      markPending("u1");
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
      mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
      mocks.recordConsents.mockResolvedValueOnce(undefined);
      render(<LoginClient />);
      submitPasswordSignIn();

      expect(await retryButton()).toBeDisabled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.recordConsents).not.toHaveBeenCalled();
      expect(trackedNames()).not.toContain("login_completed");

      checkAll();
      fireEvent.click(await retryButton());
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
      expect(mocks.recordConsents).toHaveBeenLastCalledWith("u1");
      expect(window.localStorage.getItem(pendingKey)).toBeNull();
    });

    it("lets other accounts and existing users without a pending marker sign in without consent writes", async () => {
      markPending("u1");
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("no session") });
      mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "u2" }, session: { access_token: "t" } }, error: null });
      render(<LoginClient />);
      submitPasswordSignIn();

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/account"));
      expect(mocks.recordConsents).not.toHaveBeenCalled();
      expect(mocks.claimBonus).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(pendingKey)).toContain("u1");
    });
  });
});
