"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Images,
  MoreVertical,
  Palette,
  Plus,
  Search,
  Smartphone,
  Sparkles,
} from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

type ChatLine = { side: "left" | "right"; text: string; time: string; read?: boolean };

type Subject = {
  keyword: string;
  room: string;
  partner: string;
  tone: string;
  ink: string;
  ring: string;
  accent: string;
  bubbleRight: string;
  bubbleRightInk: string;
  chatBg: string;
  background: string;
  profile: string;
  chat: ChatLine[];
};

const subjects: Subject[] = [
  {
    keyword: "연인",
    room: "우리 둘",
    partner: "자기야",
    tone: "from-[#ffe4ec] via-[#fff7f9] to-[#ffffff]",
    ink: "text-[#b42355]",
    ring: "ring-[#ffc6d8]",
    accent: "#ff7aa6",
    bubbleRight: "#ffd9e4",
    bubbleRightInk: "#7a1738",
    chatBg: "linear-gradient(180deg, #ffeef3 0%, #fff6f9 100%)",
    background:
      "radial-gradient(circle at 18% 12%, rgba(255, 190, 209, 0.82), transparent 28%), radial-gradient(circle at 86% 28%, rgba(255, 230, 128, 0.68), transparent 30%), linear-gradient(135deg, #fff8fa 0%, #ffffff 48%, #f7f0ff 100%)",
    profile: "bg-[#ffb8cc]",
    chat: [
      { side: "left", text: "오늘 테마 색감 너무 좋다", time: "오후 9:24" },
      { side: "right", text: "우리 사진으로 바꾸니까 진짜 내 카톡 같아", time: "오후 9:24", read: true },
      { side: "left", text: "말풍선까지 같이 맞춰봤어 🩷", time: "오후 9:25" },
    ],
  },
  {
    keyword: "반려동물",
    room: "댕댕이 일상",
    partner: "초코집사",
    tone: "from-[#dcfce7] via-[#f6fff9] to-[#ffffff]",
    ink: "text-[#087443]",
    ring: "ring-[#bbf7d0]",
    accent: "#34d399",
    bubbleRight: "#c7f5da",
    bubbleRightInk: "#0c5a37",
    chatBg: "linear-gradient(180deg, #eafaf0 0%, #f6fff9 100%)",
    background:
      "radial-gradient(circle at 22% 18%, rgba(187, 247, 208, 0.86), transparent 30%), radial-gradient(circle at 82% 36%, rgba(254, 240, 138, 0.64), transparent 28%), linear-gradient(135deg, #f6fff9 0%, #ffffff 48%, #eefbf5 100%)",
    profile: "bg-[#86efac]",
    chat: [
      { side: "left", text: "프로필을 이 사진으로 넣어볼까?", time: "오후 1:02" },
      { side: "right", text: "하단 탭도 초록 톤으로 맞추자", time: "오후 1:03", read: true },
      { side: "left", text: "귀여운데 과하지 않아서 좋아 🐾", time: "오후 1:04" },
    ],
  },
  {
    keyword: "캐릭터",
    room: "직접 그린 세계",
    partner: "그림쟁이",
    tone: "from-[#fef3c7] via-[#fffaf0] to-[#ffffff]",
    ink: "text-[#a16207]",
    ring: "ring-[#fde68a]",
    accent: "#fbbf24",
    bubbleRight: "#ffe9a8",
    bubbleRightInk: "#7a5510",
    chatBg: "linear-gradient(180deg, #fff6df 0%, #fffaf0 100%)",
    background:
      "radial-gradient(circle at 16% 20%, rgba(253, 230, 138, 0.9), transparent 28%), radial-gradient(circle at 82% 22%, rgba(196, 181, 253, 0.58), transparent 28%), linear-gradient(135deg, #fffaf0 0%, #ffffff 46%, #f5f3ff 100%)",
    profile: "bg-[#facc15]",
    chat: [
      { side: "left", text: "배경에 직접 그린 그림을 넣었어", time: "오후 8:11" },
      { side: "right", text: "아이콘이랑 말풍선도 같은 분위기로", time: "오후 8:12", read: true },
      { side: "left", text: "테마 하나가 작은 작품 같아 🎨", time: "오후 8:13" },
    ],
  },
  {
    keyword: "최애",
    room: "개인 소장 무드",
    partner: "덕질메이트",
    tone: "from-[#dbeafe] via-[#f6f9ff] to-[#ffffff]",
    ink: "text-[#1d4ed8]",
    ring: "ring-[#bfdbfe]",
    accent: "#60a5fa",
    bubbleRight: "#cfe0ff",
    bubbleRightInk: "#1c3f8f",
    chatBg: "linear-gradient(180deg, #eaf1ff 0%, #f6f9ff 100%)",
    background:
      "radial-gradient(circle at 20% 18%, rgba(191, 219, 254, 0.88), transparent 30%), radial-gradient(circle at 82% 24%, rgba(221, 214, 254, 0.72), transparent 30%), linear-gradient(135deg, #f6f9ff 0%, #ffffff 48%, #eef2ff 100%)",
    profile: "bg-[#93c5fd]",
    chat: [
      { side: "left", text: "개인용으로만 쓸 거라 더 마음대로 했어", time: "오후 11:40" },
      { side: "right", text: "색상은 차분하게 정리했어", time: "오후 11:41", read: true },
      { side: "left", text: "미리보기로 가독성 먼저 확인하자 💙", time: "오후 11:41" },
    ],
  },
];

const galleryThemes = [
  {
    name: "우리 둘",
    mood: "연인 · 핑크 무드",
    gradient: "linear-gradient(160deg, #ffe0ea 0%, #fff1f6 55%, #ffffff 100%)",
    swatches: ["#ff7aa6", "#ffd9e4", "#fff1f6", "#1b1c19"],
    emoji: "🩷",
  },
  {
    name: "댕댕이 일상",
    mood: "반려동물 · 그린 무드",
    gradient: "linear-gradient(160deg, #d6f6e3 0%, #f0fff7 55%, #ffffff 100%)",
    swatches: ["#34d399", "#c7f5da", "#f0fff7", "#1b1c19"],
    emoji: "🐾",
  },
  {
    name: "직접 그린 세계",
    mood: "캐릭터 · 옐로 무드",
    gradient: "linear-gradient(160deg, #ffeec2 0%, #fff8e6 55%, #ffffff 100%)",
    swatches: ["#fbbf24", "#ffe9a8", "#fff8e6", "#1b1c19"],
    emoji: "🎨",
  },
  {
    name: "내 최애",
    mood: "아이돌 · 블루 무드",
    gradient: "linear-gradient(160deg, #d7e6ff 0%, #eef4ff 55%, #ffffff 100%)",
    swatches: ["#60a5fa", "#cfe0ff", "#eef4ff", "#1b1c19"],
    emoji: "💙",
  },
  {
    name: "잔잔한 하루",
    mood: "미니멀 · 베이지 무드",
    gradient: "linear-gradient(160deg, #efe7d8 0%, #f8f3ea 55%, #ffffff 100%)",
    swatches: ["#a98c63", "#e8dcc6", "#f8f3ea", "#1b1c19"],
    emoji: "🤍",
  },
  {
    name: "여름 바다",
    mood: "추억 · 청량 무드",
    gradient: "linear-gradient(160deg, #cdeef0 0%, #eafbfb 55%, #ffffff 100%)",
    swatches: ["#2dd4bf", "#bdeeee", "#eafbfb", "#1b1c19"],
    emoji: "🌊",
  },
];

const steps = [
  {
    icon: Images,
    title: "템플릿 선택",
    body: "처음부터 만들지 않고 원하는 분위기에서 시작합니다.",
  },
  {
    icon: Palette,
    title: "사진과 색상 교체",
    body: "배경, 프로필, 말풍선, 탭 이미지를 내 취향으로 바꿉니다.",
  },
  {
    icon: Smartphone,
    title: "화면별 미리보기",
    body: "친구 목록과 채팅방에서 실제로 어울리는지 확인합니다.",
  },
  {
    icon: Download,
    title: "파일 다운로드",
    body: "Android APK 또는 iOS ktheme로 적용할 준비를 마칩니다.",
  },
];

function useReveal<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, shown];
}

export default function HomePage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = subjects[activeIndex];

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % subjects.length);
    }, 3600);

    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader />

      {/* ===================== HERO ===================== */}
      <section
        className="relative isolate overflow-hidden transition-[background] duration-700 ease-out"
        style={{ background: active.background }}
      >
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(251,249,244,0.96)_0%,rgba(251,249,244,0.72)_44%,rgba(251,249,244,0.18)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[var(--color-background)] to-transparent" />

        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-12 md:px-8 lg:min-h-[calc(100svh-73px)] lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1.06fr)] lg:py-14">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white/72 px-3.5 py-1.5 text-[12px] font-black text-[var(--color-on-surface-variant)] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-on-primary-container)]" />
              나만 보는 카카오톡, 내 손으로
            </span>

            <h1 className="mt-5 text-balance text-[42px] font-black leading-[1.04] text-[var(--color-on-background)] sm:text-[58px] lg:text-[74px]">
              내가 좋아하는{" "}
              <span className="relative inline-grid min-w-[3.1em] align-baseline">
                <span
                  key={active.keyword}
                  className={`rounded-[0.34em] bg-white/80 px-3 py-1 shadow-[0_18px_42px_rgba(27,28,25,0.1)] ring-1 ${active.ring} ${active.ink} motion-safe:animate-[word-pop_500ms_cubic-bezier(0.34,1.56,0.64,1)]`}
                >
                  {active.keyword}
                </span>
              </span>
              으로
              <br />
              카카오톡 테마를
              <br className="hidden sm:block" /> 만들어보세요
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-[17px] font-semibold leading-8 text-[var(--color-on-surface-variant)] sm:text-[19px]">
              템플릿을 고르고 내 사진과 색상만 바꾸면, 채팅방과 친구 목록 미리보기까지 확인한 뒤
              Android APK 또는 iOS ktheme로 완성할 수 있습니다.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/template"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-6 py-4 text-base font-black text-[var(--color-inverse-on-surface)] shadow-[0_18px_36px_rgba(27,28,25,0.2)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-container)]"
              >
                내 테마 만들기
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-outline-variant)] bg-white/80 px-6 py-4 text-base font-black text-[var(--color-on-surface)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-container)]"
              >
                만드는 법 보기
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {subjects.map((subject, index) => (
                <button
                  key={subject.keyword}
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    setPaused(true);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-container)] ${
                    index === activeIndex
                      ? "bg-[var(--color-on-background)] text-white shadow-[0_12px_28px_rgba(27,28,25,0.14)]"
                      : "border border-[var(--color-outline-variant)] bg-white/72 text-[var(--color-on-surface-variant)] hover:bg-white"
                  }`}
                >
                  {subject.keyword}
                </button>
              ))}
            </div>
          </div>

          <HeroMockup active={active} />
        </div>
      </section>

      {/* ===================== GALLERY ===================== */}
      <GallerySection />

      {/* ===================== FLOW ===================== */}
      <FlowSection />

      {/* ===================== EXPORT ===================== */}
      <section className="bg-[var(--color-inverse-surface)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 text-[var(--color-inverse-on-surface)] md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] lg:items-center">
          <Reveal>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#fee500]">
              Export Ready
            </p>
            <h2 className="mt-3 text-balance text-[32px] font-black leading-tight sm:text-[44px]">
              예쁜 목업에서 끝나지 않고 실제 적용 파일까지 연결합니다
            </h2>
            <p className="mt-4 max-w-2xl text-[16px] font-semibold leading-8 text-[#d8d7d0]">
              말풍선 비율, 배경 이미지, 프로필, 하단 탭처럼 실패하기 쉬운 지점을 미리보기와
              진단 흐름으로 관리해 제작 성공률을 높입니다.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="grid gap-3">
              {["Android APK", "iOS ktheme", "화면별 미리보기"].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-5 py-4 transition hover:border-white/25 hover:bg-white/12"
                >
                  <span className="flex items-center gap-3 text-base font-black">
                    <Check className="h-5 w-5 text-[#fee500]" />
                    {item}
                  </span>
                  <ChevronRight className="h-5 w-5 text-white/50" />
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_0%,rgba(254,229,0,0.28),transparent_42%),radial-gradient(circle_at_88%_30%,rgba(255,190,209,0.34),transparent_40%)]" />
        <div className="mx-auto max-w-4xl px-5 py-20 text-center md:px-8 md:py-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white/72 px-3.5 py-1.5 text-[12px] font-black text-[var(--color-on-surface-variant)] backdrop-blur">
              <Heart className="h-3.5 w-3.5 text-[#ff7aa6]" />
              개인 소장용으로 딱 좋아요
            </span>
            <h2 className="mt-5 text-balance text-[34px] font-black leading-tight sm:text-[52px]">
              오늘, 내 카톡을 나답게 바꿔보세요
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[17px] font-semibold leading-8 text-[var(--color-on-surface-variant)]">
              내 사진 한 장, 좋아하는 색 하나면 충분합니다. 매일 보는 화면이 가장 나다운 공간이 됩니다.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/template"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-8 py-4 text-base font-black text-[var(--color-inverse-on-surface)] shadow-[0_18px_36px_rgba(27,28,25,0.2)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-container)]"
              >
                지금 시작하기
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <style jsx global>{`
        @keyframes word-pop {
          0% {
            opacity: 0;
            transform: translateY(0.32em) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes float-soft {
          0%,
          100% {
            transform: var(--float-base) translateY(0);
          }
          50% {
            transform: var(--float-base) translateY(-14px);
          }
        }
        .reveal-item {
          opacity: 0;
          transform: translateY(26px);
          transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
          transition-delay: var(--reveal-delay, 0ms);
        }
        .reveal-item.is-shown {
          opacity: 1;
          transform: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .reveal-item {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal-item ${shown ? "is-shown" : ""} ${className}`}
      style={{ ["--reveal-delay" as string]: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function GallerySection() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
      <Reveal className="max-w-2xl">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
          Theme Gallery
        </p>
        <h2 className="mt-3 text-balance text-[32px] font-black leading-tight sm:text-[44px]">
          이런 무드로 시작할 수 있어요
        </h2>
        <p className="mt-4 text-[16px] font-semibold leading-8 text-[var(--color-on-surface-variant)]">
          좋아하는 분위기를 고르고 내 사진과 색만 바꾸면 끝. 모든 테마는 개인 소장용으로 자유롭게
          꾸밀 수 있습니다.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {galleryThemes.map((theme, index) => (
          <Reveal key={theme.name} delay={(index % 3) * 90}>
            <Link
              href="/template"
              className="group block h-full overflow-hidden rounded-[28px] border border-[var(--color-outline-variant)] bg-white/76 shadow-[0_18px_42px_rgba(27,28,25,0.05)] transition hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(27,28,25,0.12)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-primary-container)]"
            >
              <div
                className="relative flex h-40 items-end p-5"
                style={{ background: theme.gradient }}
              >
                <span className="absolute right-4 top-4 text-3xl drop-shadow-sm transition group-hover:scale-110">
                  {theme.emoji}
                </span>
                <div className="flex gap-1.5">
                  {theme.swatches.map((color, i) => (
                    <span
                      key={i}
                      className="h-6 w-6 rounded-full border border-white/70 shadow-sm"
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <h3 className="text-lg font-black">{theme.name}</h3>
                  <p className="mt-0.5 text-xs font-bold text-[var(--color-on-surface-variant)]">
                    {theme.mood}
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)] transition group-hover:bg-[var(--color-inverse-surface)] group-hover:text-[var(--color-inverse-on-surface)]">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FlowSection() {
  return (
    <section className="bg-[var(--color-surface-low)]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <Reveal>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
            Simple Flow
          </p>
          <h2 className="mt-3 max-w-lg text-balance text-[32px] font-black leading-tight sm:text-[44px]">
            설명보다 결과가 먼저 보이는 제작 흐름
          </h2>
          <p className="mt-4 max-w-md text-[16px] font-semibold leading-8 text-[var(--color-on-surface-variant)]">
            템플릿을 고르고 이미지를 교체하면 미리보기에서 바로 결과가 보입니다. 마음에 들면 그대로
            다운로드하면 됩니다.
          </p>
        </Reveal>

        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.title} delay={(index % 2) * 90}>
                <article className="h-full rounded-[28px] border border-[var(--color-outline-variant)] bg-white/80 p-5 shadow-[0_18px_42px_rgba(27,28,25,0.05)] transition hover:-translate-y-1 hover:shadow-[0_24px_54px_rgba(27,28,25,0.1)]">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[13px] font-black text-[var(--color-outline)]">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-black">{step.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)]">
                    {step.body}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HeroMockup({ active }: { active: Subject }) {
  return (
    <div className="relative min-h-[480px] md:min-h-[640px]">
      <div className="absolute inset-x-0 top-8 mx-auto h-[440px] max-w-[660px] rounded-[48px] bg-white/24 blur-2xl" />

      <div
        className="absolute left-[1%] top-[12%] hidden w-[208px] opacity-80 sm:block lg:left-[-1%] lg:top-[18%] motion-safe:animate-[float-soft_7s_ease-in-out_infinite]"
        style={{ ["--float-base" as string]: "rotate(-8deg)" }}
      >
        <PhoneFrame active={active} variant="friends" />
      </div>

      <div
        className="absolute right-[-1%] top-[4%] hidden w-[224px] opacity-85 md:block motion-safe:animate-[float-soft_8s_ease-in-out_infinite_0.8s]"
        style={{ ["--float-base" as string]: "rotate(9deg)" }}
      >
        <PhoneFrame active={active} variant="profile" />
      </div>

      <div className="relative mx-auto w-[min(82vw,346px)] pt-8 md:pt-14">
        <PhoneFrame active={active} variant="chat" />
      </div>
    </div>
  );
}

function PhoneFrame({
  active,
  variant,
}: {
  active: Subject;
  variant: "chat" | "friends" | "profile";
}) {
  return (
    <div className="rounded-[44px] border border-white/70 bg-[#1f2933] p-2.5 shadow-[0_34px_80px_rgba(27,28,25,0.26)]">
      <div className="relative overflow-hidden rounded-[36px] bg-white">
        {/* status bar */}
        <div
          className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[11px] font-bold text-black/70"
          style={{ background: variant === "chat" ? active.chatBg : undefined }}
        >
          <span>9:41</span>
          <span className="absolute left-1/2 top-1.5 h-4 w-16 -translate-x-1/2 rounded-full bg-black/85" />
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-3.5 rounded-[2px] bg-black/55" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-black/55" />
            <span className="inline-block h-2.5 w-5 rounded-[3px] border border-black/45" />
          </span>
        </div>

        {variant === "chat" ? (
          <ChatScreen active={active} />
        ) : variant === "friends" ? (
          <FriendsScreen active={active} />
        ) : (
          <ProfileScreen active={active} />
        )}
      </div>
    </div>
  );
}

function ChatScreen({ active }: { active: Subject }) {
  return (
    <div className="flex flex-col" style={{ background: active.chatBg }}>
      {/* chat header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <ChevronLeft className="h-5 w-5 text-black/65" />
        <span className={`h-8 w-8 rounded-2xl ${active.profile} shadow-inner`} />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[13px] font-black text-[#1b1c19]">
            {active.partner}
          </strong>
        </div>
        <Search className="h-[18px] w-[18px] text-black/55" />
        <MoreVertical className="h-[18px] w-[18px] text-black/55" />
      </div>

      {/* messages */}
      <div className="min-h-[336px] space-y-3 px-3.5 pb-3 pt-1">
        <div className="flex justify-center">
          <span className="rounded-full bg-black/12 px-3 py-1 text-[10px] font-bold text-black/55">
            오늘
          </span>
        </div>

        {active.chat.map((message, index) =>
          message.side === "left" ? (
            <div key={index} className="flex items-end gap-2">
              <span className={`h-8 w-8 shrink-0 rounded-2xl ${active.profile} shadow-inner`} />
              <div className="min-w-0">
                <span className="mb-1 block text-[10px] font-bold text-black/55">
                  {active.partner}
                </span>
                <div className="flex items-end gap-1.5">
                  <p className="max-w-[176px] rounded-[16px] rounded-tl-[6px] bg-white px-3 py-2 text-[12.5px] font-semibold leading-5 text-[#1b1c19] shadow-[0_8px_18px_rgba(27,28,25,0.07)]">
                    {message.text}
                  </p>
                  <span className="shrink-0 text-[9px] font-semibold text-black/40">
                    {message.time}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div key={index} className="flex items-end justify-end gap-1.5">
              <span className="flex shrink-0 flex-col items-end text-[9px] font-semibold leading-tight text-black/40">
                {message.read ? <span className="text-[#f7c948]">1</span> : null}
                <span>{message.time}</span>
              </span>
              <p
                className="max-w-[182px] rounded-[16px] rounded-tr-[6px] px-3 py-2 text-[12.5px] font-semibold leading-5 shadow-[0_8px_18px_rgba(27,28,25,0.08)]"
                style={{ background: active.bubbleRight, color: active.bubbleRightInk }}
              >
                {message.text}
              </p>
            </div>
          ),
        )}
      </div>

      {/* input bar */}
      <div className="flex items-center gap-2 border-t border-black/8 bg-white/80 px-3 py-2.5">
        <Plus className="h-5 w-5 text-black/50" />
        <div className="flex-1 rounded-full bg-black/6 px-3 py-1.5 text-[11px] font-semibold text-black/35">
          메시지 입력
        </div>
        <span
          className="grid h-7 w-7 place-items-center rounded-full text-[12px] font-black"
          style={{ background: active.accent, color: "#ffffff" }}
        >
          #
        </span>
      </div>
    </div>
  );
}

function FriendsScreen({ active }: { active: Subject }) {
  return (
    <div className={`bg-gradient-to-br ${active.tone}`}>
      <div className="flex items-center justify-between px-4 pb-2 pt-2.5">
        <strong className="text-[13px] font-black text-[#1b1c19]">친구</strong>
        <Search className="h-4 w-4 text-black/45" />
      </div>
      <div className="flex items-center gap-2.5 px-4 pb-3">
        <span className={`h-11 w-11 rounded-2xl ${active.profile} shadow-inner`} />
        <div className="grid gap-1">
          <span className="h-2.5 w-20 rounded-full bg-[#1b1c19]/22" />
          <span className="h-2 w-28 rounded-full bg-[#1b1c19]/10" />
        </div>
      </div>
      <div className="space-y-3 rounded-t-[20px] bg-white/72 px-4 py-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="flex items-center gap-3">
            <span className={`h-9 w-9 rounded-full ${item % 2 ? active.profile : "bg-[#ece8dd]"}`} />
            <span className="grid flex-1 gap-1.5">
              <span className="h-2.5 w-24 rounded-full bg-[#1b1c19]/18" />
              <span className="h-2 w-32 rounded-full bg-[#1b1c19]/10" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileScreen({ active }: { active: Subject }) {
  return (
    <div className={`bg-gradient-to-br ${active.tone}`}>
      <div className="flex min-h-[150px] flex-col items-center justify-end px-4 pb-4 pt-8">
        <span className={`h-16 w-16 rounded-3xl ${active.profile} shadow-[0_10px_24px_rgba(27,28,25,0.16)]`} />
        <strong className="mt-3 text-[13px] font-black text-[#1b1c19]">{active.room}</strong>
        <span className="mt-1 h-2 w-24 rounded-full bg-[#1b1c19]/14" />
      </div>
      <div className="space-y-2.5 bg-white/72 px-4 py-4">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2.5 shadow-[0_8px_18px_rgba(27,28,25,0.05)]"
          >
            <span className="h-2.5 w-20 rounded-full bg-[#1b1c19]/16" />
            <span
              className="h-5 w-5 rounded-full"
              style={{ background: item === 0 ? active.accent : "rgba(27,28,25,0.1)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
