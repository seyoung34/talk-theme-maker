"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { CircleUserRound, LayoutDashboard, LoaderCircle, LogIn, LogOut, UserRound, X } from "lucide-react";
import type { SessionResponse } from "@/lib/billing/apiTypes";
import { readJsonResponse } from "@/lib/shared/api/http";
import { createClient } from "@/lib/supabase/client";

type SiteHeaderProps = { currentPath?: string };

export default function SiteHeader({ currentPath }: SiteHeaderProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("session request failed");
        return readJsonResponse<SessionResponse>(response);
      })
      .then((payload) => {
        if (active) setSession(payload);
      })
      .catch(() => {
        if (active) setSession({ user: null, isAdmin: false });
      });
    return () => {
      active = false;
    };
  }, []);

  const openSignOutConfirm = () => {
    setIsOpen(false);
    setSignOutError(null);
    setShowSignOutConfirm(true);
  };

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setIsSigningOut(false);
      setSignOutError("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setSession({ user: null, isAdmin: false });
    setShowSignOutConfirm(false);
    router.replace("/login");
    router.refresh();
  };

  const isAccountArea = currentPath === "/account" || currentPath === "/credits" || currentPath?.startsWith("/admin");

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#dbe8fb]/80 bg-[color:rgba(244,249,255,0.82)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3.5 md:px-8">
          <Link href="/" className="min-w-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">
            <p className="truncate text-[14px] font-extrabold uppercase tracking-[0.14em] text-[#3d7bd6] sm:text-[11px] sm:tracking-[0.18em]">Talk Theme</p>
          </Link>

          <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="주요 메뉴">
            <Link href="/template" aria-current={currentPath === "/template" ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] sm:px-4 sm:text-sm ${currentPath === "/template" ? "bg-[#2f6bbf] text-white shadow-[0_10px_22px_rgba(47,107,191,0.24)]" : "text-[#3d7bd6] hover:bg-white"}`}>
              테마 만들기
            </Link>

            <Link href="/guide" aria-current={currentPath === "/guide" ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-3 py-2 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] sm:px-4 sm:text-sm ${currentPath === "/guide" ? "bg-[#2f6bbf] text-white shadow-[0_10px_22px_rgba(47,107,191,0.24)]" : "text-[#3d7bd6] hover:bg-white"}`}>
              가이드 문서
            </Link>

            <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
              <Popover.Trigger asChild>
                <button type="button" className={`flex size-11 items-center justify-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] ${isOpen || isAccountArea ? "border-[#2f6bbf] bg-[#2f6bbf] text-white" : "border-[#cfe0ff] bg-white text-[#3d7bd6] hover:border-[#9bc0f5]"}`} aria-label={session?.user ? "계정 메뉴 열기" : "로그인 메뉴 열기"} aria-expanded={isOpen}>
                  <CircleUserRound size={22} strokeWidth={2} aria-hidden="true" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="end" sideOffset={10} collisionPadding={16} className="radix-popover-content z-50 w-[min(300px,calc(100vw-40px))] overflow-hidden rounded-2xl border border-[var(--color-outline-variant)] bg-white shadow-[0_18px_55px_rgba(48,49,46,0.18)] outline-none" aria-label="계정 메뉴">
                  {session === null ? (
                    <div className="flex items-center gap-2 px-4 py-5 text-sm font-semibold text-[var(--color-on-surface-variant)]" role="status"><LoaderCircle className="animate-spin" size={17} aria-hidden="true" />계정 확인 중</div>
                  ) : session.user ? (
                    <>
                      <div className="border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-3.5">
                        <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">로그인한 계정</p>
                        <p className="mt-1 truncate text-sm font-extrabold text-[var(--color-on-surface)]">{session.user.displayName || session.user.email || "사용자"}</p>
                        {session.user.displayName && session.user.email ? <p className="mt-0.5 truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{session.user.email}</p> : null}
                      </div>
                      <div className="p-2">
                        <PopoverLink href="/account" label="마이페이지" icon={<UserRound size={18} aria-hidden="true" />} active={currentPath === "/account"} onClick={() => setIsOpen(false)} />
                        {session.isAdmin ? <PopoverLink href="/admin" label="관리자 페이지" icon={<LayoutDashboard size={18} aria-hidden="true" />} active={Boolean(currentPath?.startsWith("/admin"))} onClick={() => setIsOpen(false)} /> : null}
                        <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-extrabold text-[var(--color-error)] transition hover:bg-[var(--color-error-container)] focus-visible:outline-2 focus-visible:outline-[var(--color-error)]" onClick={openSignOutConfirm}>
                          <LogOut size={18} aria-hidden="true" />로그아웃
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-2">
                      <div className="px-3 pb-3 pt-2"><p className="text-sm font-extrabold">로그인이 필요합니다</p><p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">크레딧과 Export 이력을 계정에서 관리하세요.</p></div>
                      <PopoverLink href="/login" label="로그인 / 회원가입" icon={<LogIn size={18} aria-hidden="true" />} active={currentPath === "/login"} onClick={() => setIsOpen(false)} />
                    </div>
                  )}
                  <Popover.Arrow className="fill-[var(--color-outline-variant)]" width={14} height={7} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </nav>
        </div>
      </header>

      <Dialog.Root open={showSignOutConfirm} onOpenChange={(open) => { if (!isSigningOut) setShowSignOutConfirm(open); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-dialog-overlay fixed inset-0 z-[60] bg-black/45" />
          <Dialog.Content className="radix-dialog-content fixed left-1/2 top-1/2 z-[61] w-[calc(100%-40px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_24px_72px_rgba(15,23,42,0.24)] outline-none" onOpenAutoFocus={(event) => { if (isSigningOut) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (isSigningOut) event.preventDefault(); }} onPointerDownOutside={(event) => { if (isSigningOut) event.preventDefault(); }}>
            <span className="mb-4 grid size-10 place-items-center rounded-xl bg-[var(--color-surface-low)]"><LogOut size={20} aria-hidden="true" /></span>
            <Dialog.Title className="text-xl font-extrabold">로그아웃할까요?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">이 기기에서 로그아웃합니다. 크레딧과 Export 이력은 계정에 보관됩니다.</Dialog.Description>
            {signOutError ? <p className="mt-3 rounded-xl bg-[var(--color-error-container)] px-3 py-2 text-xs font-bold text-[var(--color-on-error-container)]" role="alert">{signOutError}</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Dialog.Close asChild><button type="button" className="min-h-11 rounded-xl border border-[var(--color-outline-variant)] px-4 py-2.5 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)] disabled:opacity-55" disabled={isSigningOut}>취소</button></Dialog.Close>
              <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-inverse-surface)] px-4 py-2.5 text-sm font-extrabold text-[var(--color-inverse-on-surface)] focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)] disabled:opacity-55" onClick={() => void signOut()} disabled={isSigningOut}>{isSigningOut ? <><LoaderCircle className="animate-spin" size={17} aria-hidden="true" />처리 중</> : "로그아웃"}</button>
            </div>
            <Dialog.Close asChild><button type="button" className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)] focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)] disabled:hidden" aria-label="닫기" disabled={isSigningOut}><X size={18} aria-hidden="true" /></button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function PopoverLink({ href, label, icon, active, onClick }: { href: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)] ${active ? "bg-[var(--color-surface-low)] text-[var(--color-on-surface)]" : "text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)]"}`} onClick={onClick}>{icon}{label}</Link>;
}
