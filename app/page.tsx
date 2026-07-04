"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  Gift,
  Heart,
  Images,
  Laugh,
  MessageCircle,
  Palette,
  Smartphone,
  Sparkles,
  Star,
} from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

type Subject = {
  keyword: string;
  image: string;
  glow: string;
};

// 히어로 배경은 편집창과 동일한 흰/하늘 베이스로 통일하고,
// 강조는 옐로우 포인트 하나로만 유지한다. (카테고리별 색상 변화 X)
const subjects: Subject[] = [
  {
    keyword: "연인",
    image: "/landing/couple_mockup.png",
    glow: "rgba(96, 165, 250, 0.30)",
  },
  {
    keyword: "캐릭터",
    image: "/landing/character_mockup.png",
    glow: "rgba(129, 190, 255, 0.30)",
  },
  {
    keyword: "반려동물",
    image: "/landing/pet_mockup.png",
    glow: "rgba(96, 165, 250, 0.28)",
  },
];

const showcaseThemes = [
  {
    src: "/landing/couple_mockup.png",
    label: "연인 테마",
    desc: "우리 사진과 하늘 배경으로 채운 채팅방",
    accent: "#ff7aa6",
    glow: "rgba(255, 122, 166, 0.30)",
    tilt: "-4deg",
    raised: false,
  },
  {
    src: "/landing/character_mockup.png",
    label: "캐릭터 테마",
    desc: "직접 그린 캐릭터로 완성한 파스텔 무드",
    accent: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.30)",
    tilt: "0deg",
    raised: true,
  },
  {
    src: "/landing/pet_mockup.png",
    label: "반려동물 테마",
    desc: "우리집 강아지를 프로필과 배경에",
    accent: "#fb923c",
    glow: "rgba(251, 146, 60, 0.28)",
    tilt: "4deg",
    raised: false,
  },
];

const useCases = [
  {
    icon: Gift,
    emoji: "🎁",
    title: "선물하기 좋아요",
    body: "기프티콘 말고, 세상에 하나뿐인 카톡을 선물하세요. 생일·기념일에 오래 기억에 남는 특별한 선물이 됩니다.",
    tint: "#fff6d6",
    accent: "#f2b705",
  },
  {
    icon: Laugh,
    emoji: "😆",
    title: "친구랑 놀기 좋아요",
    body: "우리끼리만 아는 드립과 짤로 웃긴 테마를 만들어 공유하세요. 단톡방 놀이가 하나 더 늘어납니다.",
    tint: "#e3efff",
    accent: "#5b9bff",
  },
  {
    icon: Heart,
    emoji: "💙",
    title: "최애·커플과 매일",
    body: "연인 사진이나 최애로 채운 채팅방. 매일 여는 카톡이 설레는 공간으로 바뀝니다.",
    tint: "#ffe9ef",
    accent: "#ff8fa8",
  },
  {
    icon: Sparkles,
    emoji: "✨",
    title: "나만 가질 수 있어요",
    body: "반려동물, 우리 아기, 좋아하는 캐릭터까지. 세상에 딱 하나뿐인 내 취향으로 꾸밉니다.",
    tint: "#eafaf1",
    accent: "#34c98a",
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
    <main className="relative min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_16%,#ffffff_40%,#f7fbff_66%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      {/* 페이지 전체를 덮는 단일 배경 레이어 — 섹션 경계에 걸리지 않아 구분선이 생기지 않는다 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-8rem] top-[2%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.42),transparent_68%)] blur-3xl" />
        <div className="absolute right-[-9rem] top-[7%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.5),transparent_68%)] blur-3xl" />
        <div className="absolute left-[-9rem] top-[46%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.30),transparent_70%)] blur-3xl" />
        <div className="absolute right-[-9rem] top-[52%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(254,229,0,0.16),transparent_70%)] blur-3xl" />
        <div className="absolute left-[-7rem] bottom-[4%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(254,229,0,0.20),transparent_70%)] blur-3xl" />
        <div className="absolute right-[-7rem] bottom-[1%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.34),transparent_70%)] blur-3xl" />
      </div>
      <SiteHeader />

      {/* ===================== HERO ===================== */}
      <section className="relative">
        {/* 손그림 두들 */}
        <Sparkles className="pointer-events-none absolute left-[6%] top-[18%] z-0 h-6 w-6 rotate-12 text-[#fee500] drop-shadow-sm md:h-8 md:w-8" />
        <MessageCircle className="pointer-events-none absolute left-[2%] top-[52%] -z-0 hidden h-9 w-9 -rotate-6 text-[#8fc0ff] md:block" />
        <Heart className="pointer-events-none absolute bottom-[16%] left-[44%] -z-0 hidden h-7 w-7 rotate-6 fill-[#ffd6df] text-[#ffb3c2] lg:block" />
        <Star className="pointer-events-none absolute right-[46%] top-[10%] -z-0 hidden h-6 w-6 fill-[#fee500] text-[#fee500] lg:block" />

        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-12 md:px-8 lg:min-h-[calc(100svh-73px)] lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1.06fr)] lg:py-14">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-3.5 py-1.5 text-[12px] font-black text-[#3d7bd6] shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
              세상에 하나뿐인 카카오톡 테마
            </span>

            <h1 className="mt-5 text-[42px] font-black leading-[1.14] text-[var(--color-on-background)] sm:text-[58px] lg:text-[74px]">
              <span className="block">내가 좋아하는</span>
              <span className="mt-1 block">
                <span className="relative inline-block align-baseline">
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[-0.14em] bottom-[0.08em] z-0 h-[0.42em] -rotate-2 rounded-[0.32em] bg-[rgba(254,229,0,0.62)]"
                    style={{ transformOrigin: "left center" }}
                  />
                  <span
                    key={active.keyword}
                    className="relative text-[#2f6bbf] motion-safe:animate-[word-pop_520ms_cubic-bezier(0.34,1.56,0.64,1)]"
                  >
                    {active.keyword}
                  </span>
                </span>
                으로
              </span>
              <span className="mt-1 block">카카오톡 테마를 만들어보세요</span>
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-[17px] font-semibold leading-8 text-[var(--color-on-surface-variant)] sm:text-[19px]">
              똑같은 카톡은 재미없으니까. 내 사진과 최애로 나만의 테마를 만들고,
              기억에 남는 선물로 보내거나 웃긴 테마를 만들어 친구들과 함께 놀아보세요.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/template"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#fee500] px-6 py-4 text-base font-black text-[#191600] shadow-[0_16px_32px_rgba(254,229,0,0.44)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus:outline-none focus:ring-4 focus:ring-[#fff2a8]"
              >
                내 테마 만들기
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center justify-center rounded-full border border-[#cfe0ff] bg-white/85 px-6 py-4 text-base font-black text-[#2f6bbf] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#dcebff]"
              >
                만드는 법 보기
              </Link>
            </div>

            {/* 신뢰 · 사용 시나리오 뱃지 */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-bold text-[var(--color-on-surface-variant)]">
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-[#fee500] text-[#fee500]" />
                나만 가질 수 있는 하나뿐인 테마
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Gift className="h-4 w-4 text-[#ff9db0]" />
                기억에 남는 선물
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Laugh className="h-4 w-4 text-[#5b9bff]" />
                친구랑 웃긴 테마로 놀기
              </span>
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
                  className={`rounded-full px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-[#dcebff] ${
                    index === activeIndex
                      ? "bg-[#2f6bbf] text-white shadow-[0_12px_28px_rgba(47,107,191,0.28)]"
                      : "border border-[#cfe0ff] bg-white/72 text-[#3d7bd6] hover:bg-white"
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

      {/* ===================== USE CASES ===================== */}
      <UseCaseSection />

      {/* ===================== SHOWCASE ===================== */}
      <ShowcaseSection />

      {/* ===================== FLOW ===================== */}
      <FlowSection />

      {/* ===================== FINAL CTA ===================== */}
      <section className="relative">
        <Sparkles className="pointer-events-none absolute left-[12%] top-[24%] z-0 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
        <Heart className="pointer-events-none absolute right-[14%] bottom-[24%] -z-0 hidden h-6 w-6 rotate-6 fill-[#ffd6df] text-[#ffb3c2] lg:block" />
        <div className="mx-auto max-w-4xl px-5 py-20 text-center md:px-8 md:py-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-3.5 py-1.5 text-[12px] font-black text-[#3d7bd6] shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
              세상에 하나뿐인 카톡, 지금 시작
            </span>
            <h2 className="mt-5 text-balance text-[34px] font-black leading-tight sm:text-[52px]">
              오늘, 내 카톡을 나답게 바꿔보세요
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[17px] font-semibold leading-8 text-[var(--color-on-surface-variant)]">
              좋아하는 사진 한 장이면 충분해요. 나만 쓰든, 선물하든, 친구랑 웃긴 테마로 놀든
              — 여기서 세상에 하나뿐인 카톡이 시작됩니다.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/template"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#fee500] px-8 py-4 text-base font-black text-[#191600] shadow-[0_16px_32px_rgba(254,229,0,0.44)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus:outline-none focus:ring-4 focus:ring-[#fff2a8]"
              >
                내 테마 만들기
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
        @keyframes hero-swap {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: none;
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

function UseCaseSection() {
  return (
    <section className="relative isolate overflow-hidden">
      <Sparkles className="pointer-events-none absolute right-[8%] top-[12%] -z-0 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
      <MessageCircle className="pointer-events-none absolute left-[6%] bottom-[14%] -z-0 hidden h-8 w-8 -rotate-6 text-[#8fc0ff] lg:block" />

      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#3d7bd6]">
            Why TalkTheme
          </p>
          <h2 className="mt-3 text-balance text-[32px] font-black leading-tight sm:text-[44px]">
            이런 순간에, 톡테마
          </h2>
          <p className="mt-4 text-[16px] font-semibold leading-8 text-[var(--color-on-surface-variant)]">
            빠르게 만드는 게 중요한 게 아니에요. 세상에 하나뿐이라서 특별하고,
            그래서 선물하거나 함께 놀기에 딱 좋습니다.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={(index % 4) * 90}>
                <article className="group relative h-full overflow-hidden rounded-[28px] border border-[#e3ecf7] bg-white p-6 shadow-[0_18px_42px_rgba(47,107,191,0.06)] transition hover:-translate-y-1.5 hover:shadow-[0_28px_60px_rgba(47,107,191,0.14)]">
                  <span
                    className="absolute right-4 top-4 text-2xl opacity-90 transition group-hover:scale-110"
                    aria-hidden="true"
                  >
                    {item.emoji}
                  </span>
                  <span
                    className="grid h-12 w-12 place-items-center rounded-2xl"
                    style={{ background: item.tint, color: item.accent }}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-black">{item.title}</h3>
                  <p className="mt-2 text-[14px] font-semibold leading-7 text-[var(--color-on-surface-variant)]">
                    {item.body}
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

function ShowcaseSection() {
  return (
    <section className="relative">

      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
            Real Result
          </p>
          <h2 className="mt-3 text-balance text-[32px] font-black leading-tight sm:text-[44px]">
            목업이 아니라, 진짜 완성된 화면이에요
          </h2>
          <p className="mt-4 text-[16px] font-semibold leading-8 text-[var(--color-on-surface-variant)]">
            연인, 캐릭터, 반려동물까지. 내 사진과 색으로 만든 테마가 실제 카카오톡 채팅방에서
            이렇게 보입니다.
          </p>
        </Reveal>

        <div className="mt-14 grid items-end gap-10 sm:grid-cols-3 sm:gap-4 lg:gap-8">
          {showcaseThemes.map((theme, index) => (
            <Reveal key={theme.label} delay={index * 120}>
              <figure
                className={`group relative mx-auto flex max-w-[260px] flex-col items-center ${theme.raised ? "sm:-translate-y-8 lg:-translate-y-12" : ""}`}
              >
                <div
                  className="pointer-events-none absolute inset-x-2 top-6 -z-10 h-[78%] rounded-[48px] blur-3xl transition-opacity duration-500 group-hover:opacity-90"
                  style={{ background: theme.glow, opacity: 0.7 }}
                />
                <div
                  className="w-full motion-safe:animate-[float-soft_8s_ease-in-out_infinite] transition-transform duration-500 group-hover:-translate-y-1.5"
                  style={{
                    ["--float-base" as string]: `rotate(${theme.tilt})`,
                    animationDelay: `${index * 0.9}s`,
                  }}
                >
                  <img
                    src={theme.src}
                    alt={`${theme.label} 적용 예시`}
                    width={808}
                    height={1602}
                    loading="lazy"
                    className="h-auto w-full drop-shadow-[0_34px_60px_rgba(27,28,25,0.24)]"
                  />
                </div>
                <figcaption className="mt-7 flex flex-col items-center text-center">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white/85 px-3.5 py-1.5 text-[13px] font-black text-[var(--color-on-surface)] shadow-sm backdrop-blur">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: theme.accent }} />
                    {theme.label}
                  </span>
                  <p className="mt-2.5 max-w-[230px] text-[13px] font-semibold leading-6 text-[var(--color-on-surface-variant)]">
                    {theme.desc}
                  </p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mt-14 flex justify-center">
          <Link
            href="/template"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#fee500] px-7 py-4 text-base font-black text-[#191600] shadow-[0_16px_32px_rgba(254,229,0,0.44)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus:outline-none focus:ring-4 focus:ring-[#fff2a8]"
          >
            나도 이렇게 만들기
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function FlowSection() {
  return (
    <section className="relative">
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
    <div className="relative flex min-h-[480px] items-center justify-center md:min-h-[640px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.5),transparent_62%)] blur-2xl" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[86%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-[background] duration-700 ease-out"
        style={{
          background: `radial-gradient(circle, ${active.glow}, transparent 64%)`,
        }}
      />

      <div
        className="relative w-[min(78vw,332px)] pt-6 md:w-[356px] md:pt-10 motion-safe:animate-[float-soft_8s_ease-in-out_infinite]"
        style={{ ["--float-base" as string]: "rotate(0deg)" }}
      >
        <img
          key={active.image}
          src={active.image}
          alt={`${active.keyword} 테마 적용 예시`}
          width={808}
          height={1602}
          className="h-auto w-full drop-shadow-[0_40px_70px_rgba(27,28,25,0.28)] motion-safe:animate-[hero-swap_620ms_cubic-bezier(0.22,1,0.36,1)]"
        />
      </div>
    </div>
  );
}
