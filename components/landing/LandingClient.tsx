"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
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
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";

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
    image: "/landing/couple_mockup.webp",
    glow: "rgba(96, 165, 250, 0.30)",
  },
  {
    keyword: "캐릭터",
    image: "/landing/character_mockup.webp",
    glow: "rgba(129, 190, 255, 0.30)",
  },
  {
    keyword: "반려동물",
    image: "/landing/pet_mockup.webp",
    glow: "rgba(96, 165, 250, 0.28)",
  },
];

const showcaseThemes = [
  {
    src: "/landing/couple_mockup.webp",
    label: "연인 테마",
    desc: "우리 사진과 하늘 배경으로 채운 채팅방",
    accent: "#ff7aa6",
    glow: "rgba(255, 122, 166, 0.30)",
    tilt: "-4deg",
    raised: false,
  },
  {
    src: "/landing/character_mockup.webp",
    label: "캐릭터 테마",
    desc: "직접 그린 캐릭터로 완성한 파스텔 무드",
    accent: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.30)",
    tilt: "0deg",
    raised: true,
  },
  {
    src: "/landing/pet_mockup.webp",
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

export default function LandingClient() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const active = subjects[activeIndex];

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % subjects.length);
    }, 3600);

    return () => window.clearInterval(timer);
  }, [prefersReducedMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // 한국어를 어절 단위로 끊어 좁은 화면에서도 낱글자 단위로 잘리지 않게 한다.
  return (
    <main className="relative min-h-screen overflow-x-hidden break-keep bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_16%,#ffffff_40%,#f7fbff_66%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      {/* 페이지 전체를 덮는 단일 배경 레이어 — 섹션 경계에 걸리지 않아 구분선이 생기지 않는다 */}
      {/* <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute left-[-8rem] top-[2%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.42),transparent_68%)] blur-3xl outline outline-red-500" />
        <div className="absolute right-[-9rem] top-[7%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.5),transparent_68%)] blur-3xl" />
        <div className="absolute left-[-9rem] top-[46%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.30),transparent_70%)] blur-3xl" />
        <div className="absolute right-[-9rem] top-[52%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(254,229,0,0.16),transparent_70%)] blur-3xl" />
        <div className="absolute left-[-7rem] bottom-[4%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(254,229,0,0.20),transparent_70%)] blur-3xl" />
        <div className="absolute right-[-7rem] bottom-[1%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.34),transparent_70%)] blur-3xl" />
      </div> */}
      <SiteHeader />

      {/* ===================== HERO ===================== */}
      <section className="relative">
        {/* 손그림 두들 */}
        {/* 히어로가 짧아지면서 배지와 겹치던 위치를 제목 왼쪽으로 내렸다. 좁은 화면은 여백이 없어 두들을 숨긴다. */}
        <Star className="pointer-events-none absolute left-[5%] top-[30%] z-0 hidden h-6 w-6 rotate-12 text-[#fee500] drop-shadow-sm md:block md:h-8 md:w-8" />
        <MessageCircle className="pointer-events-none absolute left-[2%] top-[52%] -z-0 hidden h-9 w-9 -rotate-6 text-[#8fc0ff] md:block" />
        <Heart className="pointer-events-none absolute bottom-[16%] left-[44%] -z-0 hidden h-7 w-7 rotate-6 fill-[#ffd6df] text-[#ffb3c2] lg:block" />
        <Star className="pointer-events-none absolute right-[46%] top-[10%] -z-0 hidden h-6 w-6 fill-[#fee500] text-[#fee500] lg:block" />

        <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-5 py-8 md:gap-8 md:px-8 md:py-12 lg:min-h-[calc(100svh-73px)] lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1.06fr)] lg:py-14">
          <div className="hero-anim hero-anim-title relative z-10 max-w-3xl text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-3.5 py-1.5 text-[12px] font-black text-[#3d7bd6] shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
              세상에 하나뿐인 카카오톡 테마
            </span>

            <h1 className="mt-4 text-[34px] font-black leading-[1.14] text-[var(--color-on-background)] sm:mt-5 sm:text-[58px] lg:text-[74px]">
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
              {/* 자동 줄바꿈에 맡기면 끊기는 위치가 화면 폭마다 달라져 "카카오톡 테마를 / 만들어보세요"로 고정한다 */}
              <span className="mt-1 block">
                카카오톡 테마를
                <br />
                만들어보세요
              </span>
            </h1>

            {/*
              히어로는 제목·목업·CTA만 남긴다. 가입 혜택과 지원 환경은 하단 SignupOfferSection이 맡는다.
            */}
            <p className="mx-auto mt-5 max-w-xl text-[14px] font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:text-[17px] sm:leading-8 lg:mx-0">
              좋아하는 사진을 고르고 미리보면서, 카카오톡에 그대로 적용할 테마를 만들어보세요.
            </p>

            <div className="hero-anim hero-anim-cta mt-8 hidden lg:block">
              <HeroActions viewportGroup="desktop" />
            </div>
          </div>

          <div className="hero-anim hero-anim-mockup">
            <HeroMockup active={active} />
          </div>

          <div className="hero-anim hero-anim-cta w-full max-w-xl mx-auto lg:hidden">
            <HeroActions viewportGroup="mobile" />
          </div>
        </div>

        {/*
          콘텐츠는 초기 DOM에 존재하고, 오프닝은 데스크톱에서만 잠깐 덮는 장식 레이어로 동작한다.
          반투명이면 뒤 히어로가 비쳐 두 화면이 겹쳐 보이므로 배경은 불투명하게 깔고,
          페이지 배경 그라디언트와 같은 색으로 시작해 걷힐 때 이음매가 보이지 않게 한다.
        */}
        <div
          data-testid="hero-opening"
          aria-hidden="true"
          className="hero-opening pointer-events-none absolute inset-x-0 top-0 z-20 hidden h-[calc(100svh-73px)] items-center justify-center bg-[linear-gradient(180deg,#e8f1ff_0%,#f2f8ff_60%,#ffffff_100%)] px-5 text-center motion-reduce:hidden lg:flex"
        >
          <p className="hero-opening-copy text-[30px] font-black leading-[1.25] tracking-[-0.045em] text-[#2f6bbf] sm:text-[52px] lg:text-[68px]">
            <span className="block">세상에 하나뿐인</span>
            <span className="mt-1 block">나만의 카톡 테마</span>
          </p>
        </div>
      </section>

      {/* ===================== SHOWCASE ===================== */}
      <ShowcaseSection />

      {/* ===================== USE CASES ===================== */}
      <UseCaseSection />

      {/* ===================== FLOW ===================== */}
      <FlowSection />

      {/* ===================== SIGNUP OFFER ===================== */}
      <SignupOfferSection />

      {/* ===================== FINAL CTA ===================== */}
      <section className="relative">
        <Sparkles className="pointer-events-none absolute left-[12%] top-[24%] z-0 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
        <Heart className="pointer-events-none absolute right-[14%] bottom-[24%] -z-0 hidden h-6 w-6 rotate-6 fill-[#ffd6df] text-[#ffb3c2] lg:block" />
        <div className="max-w-4xl px-5 pt-6 pb-12 mx-auto text-center md:px-8 md:pt-12 md:pb-24">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-3.5 py-1.5 text-[12px] font-black text-[#3d7bd6] shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
              세상에 하나뿐인 카톡, 지금 시작
            </span>
            <h2 className="mt-4 text-[28px] font-black leading-tight sm:mt-5 sm:text-[52px]">
              <span className="block">세상에 하나뿐인</span>
              {/* "나만의 테마"만 글자별로 순차 bounce. 원문은 aria-label로 읽히고 각 글자는 aria-hidden */}
              <span className="mt-1 block text-[#2f6bbf]" aria-label="나만의 테마">
                {Array.from("나만의 테마").map((char, index) =>
                  char === " " ? (
                    <span key={index} aria-hidden="true" className="inline-block w-[0.28em]" />
                  ) : (
                    <span
                      key={index}
                      aria-hidden="true"
                      className="inline-block motion-safe:animate-[letter-bounce_1.6s_ease-in-out_infinite]"
                      style={{ animationDelay: `${index * 90}ms` }}
                    >
                      {char}
                    </span>
                  ),
                )}
              </span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:mt-4 sm:text-[17px] sm:leading-8">
              좋아하는 사진 한 장이면 충분해요. 나만 쓰든, 선물하든, 친구랑 웃긴 테마로 놀든
              — 여기서 세상에 하나뿐인 카톡이 시작됩니다.
            </p>
            <div className="flex justify-center mt-6 sm:mt-8">
              <Link
                href="/template"
                onClick={preserveUtmNavigation}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#fee500] px-8 py-4 text-base font-black text-[#191600] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] hover:shadow-[0_10px_24px_rgba(47,107,191,0.14)] focus:outline-none focus:ring-4 focus:ring-[#fff2a8]"
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
        @keyframes hero-opening-overlay-out {
          0%,
          52% {
            opacity: 1;
            visibility: visible;
          }
          100% {
            opacity: 0;
            visibility: hidden;
          }
        }
        @keyframes hero-opening-copy-out {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          26%,
          52% {
            opacity: 1;
            transform: none;
          }
          100% {
            opacity: 0;
            transform: translateY(-14px) scale(0.985);
          }
        }
        @keyframes hero-title-in {
          0% {
            opacity: 0;
            transform: translateY(18px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes hero-mockup-in {
          0% {
            opacity: 0;
            transform: translateY(28px) scale(0.97);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes hero-cta-in {
          0% {
            opacity: 0;
            transform: translateY(12px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes letter-bounce {
          0%,
          45%,
          100% {
            transform: translateY(0);
          }
          22% {
            transform: translateY(-0.24em);
          }
        }
        /*
          오프닝과 히어로 등장 순서를 한곳에서 맞춘다. 오프닝은 lg 이상에서만 뜨므로
          그 아래 화면에서는 지연 없이 곧바로 콘텐츠가 등장한다.
        */
        .hero-opening {
          animation: hero-opening-overlay-out 980ms ease-in-out both;
        }
        .hero-opening-copy {
          animation: hero-opening-copy-out 980ms ease-in-out both;
        }
        .hero-anim {
          animation-fill-mode: both;
          animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
        }
        .hero-anim-title {
          animation-name: hero-title-in;
          animation-duration: 620ms;
        }
        .hero-anim-mockup {
          animation-name: hero-mockup-in;
          animation-duration: 700ms;
          animation-delay: 140ms;
        }
        .hero-anim-cta {
          animation-name: hero-cta-in;
          animation-duration: 520ms;
          animation-delay: 320ms;
        }
        @media (min-width: 1024px) {
          .hero-anim-title {
            animation-delay: 520ms;
          }
          .hero-anim-mockup {
            animation-delay: 600ms;
          }
          .hero-anim-cta {
            animation-delay: 760ms;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-anim {
            animation: none !important;
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
    <section className="relative overflow-hidden isolate">
      <Sparkles className="pointer-events-none absolute right-[8%] top-[12%] -z-0 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
      <MessageCircle className="pointer-events-none absolute left-[6%] bottom-[14%] -z-0 hidden h-8 w-8 -rotate-6 text-[#8fc0ff] lg:block" />

      <div className="px-5 py-10 mx-auto max-w-7xl md:px-8 md:py-20">
        <Reveal className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#3d7bd6]">
            Why TalkTheme
          </p>
          <h2 className="mt-3 text-balance text-[26px] font-black leading-tight sm:text-[44px]">
            내 취향을 담고, 카카오톡에서 써요
          </h2>
          <p className="mt-3 text-[14px] font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:mt-4 sm:text-[16px] sm:leading-8">
            사진·색상·말풍선을 바꾸는 재미부터 Android·iPhone용 파일로 받는 과정까지,
            한 곳에서 이어집니다.
          </p>
        </Reveal>

        {/* 모바일부터 2열로 묶어 세로 스크롤을 절반으로 줄인다 */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4 lg:grid-cols-4">
          {useCases.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={(index % 4) * 90}>
                {/* 카드 자체에 파스텔 톤을 입혀, 뒤따르는 흐름 섹션과 화면 인상이 겹치지 않게 한다 */}
                <article
                  className="group relative h-full overflow-hidden rounded-[20px] border border-white p-4 shadow-[0_18px_42px_rgba(47,107,191,0.06)] transition hover:-translate-y-1.5 hover:shadow-[0_28px_60px_rgba(47,107,191,0.14)] sm:rounded-[28px] sm:p-6"
                  style={{ background: item.tint }}
                >
                  <span
                    className="absolute text-lg transition right-3 top-3 opacity-90 group-hover:scale-110 sm:right-4 sm:top-4 sm:text-2xl"
                    aria-hidden="true"
                  >
                    {item.emoji}
                  </span>
                  <span
                    className="grid h-10 w-10 place-items-center rounded-xl bg-white/85 sm:h-12 sm:w-12 sm:rounded-2xl"
                    style={{ color: item.accent }}
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </span>
                  <h3 className="mt-3 text-[15px] font-black sm:mt-5 sm:text-lg">{item.title}</h3>
                  <p className="mt-1.5 text-[13px] font-semibold leading-6 text-[var(--color-on-surface-variant)] sm:mt-2 sm:text-[14px] sm:leading-7">
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
  // 좁은 화면에서는 좌우 버튼으로 한 장씩 넘긴다(스와이프 대신 명시적 컨트롤).
  const [slide, setSlide] = useState(0);
  const lastSlide = showcaseThemes.length - 1;

  return (
    <section className="relative">

      <div className="py-10 mx-auto max-w-7xl md:py-20">
        <Reveal className="max-w-2xl px-5 mx-auto text-center md:px-8">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
            Real Result
          </p>
          <h2 className="mt-3 text-balance text-[26px] font-black leading-tight sm:text-[44px]">
            매일 여는 카톡이 달라져요
          </h2>
          <p className="mt-3 text-[14px] font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:mt-4 sm:text-[16px] sm:leading-8">
            연인, 캐릭터, 반려동물까지. 내 사진과 색으로 만든 테마가 실제 카카오톡 채팅방에서
            이렇게 보입니다.
          </p>
        </Reveal>

        {/*
          좁은 화면: 좌우 버튼으로 넘기는 캐러셀(translateX). 넓은 화면: 기존 3열 그리드.
          Reveal은 컨테이너에 한 번만 건다 — 개별 아이템에 걸면 화면 밖 카드가 opacity 0으로 남는다.
        */}
        <Reveal className="mt-8 sm:mt-14">
          {/*
            가로 이동을 감추려면 overflow-hidden이 필요한데, 그대로 두면 목업의 float 애니메이션과
            glow(blur-3xl)가 위아래로 잘려 경계가 드러난다. 상하 여백을 넉넉히 주고 음수 마진으로
            되돌려, 레이아웃 높이는 그대로 두면서 잘림만 없앤다.
          */}
          <div className="-my-12 overflow-hidden px-5 py-12 sm:my-0 sm:overflow-visible sm:px-8 sm:py-0">
          {/* transform은 CSS 변수로 넘겨 sm 이상에서 Tailwind 클래스로 되돌릴 수 있게 한다(인라인 style은 미디어쿼리가 안 먹는다) */}
          <div
            className="flex translate-x-[var(--slide)] items-end transition-transform duration-500 ease-out sm:grid sm:translate-x-0 sm:grid-cols-3 sm:gap-4 sm:transition-none lg:gap-8"
            style={{ ["--slide" as string]: `-${slide * 100}%` }}
          >
          {showcaseThemes.map((theme, index) => (
            <div key={theme.label} className="w-full shrink-0 sm:w-auto sm:shrink sm:[transform:none]">
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
                    srcSet={`${theme.src.replace(".webp", "@464.webp")} 464w, ${theme.src} 712w`}
                    sizes="(min-width: 768px) 320px, 60vw"
                    alt={`${theme.label} 적용 예시`}
                    width={712}
                    height={1412}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full drop-shadow-[0_34px_60px_rgba(27,28,25,0.24)]"
                  />
                </div>
                <figcaption className="mt-4 flex flex-col items-center text-center sm:mt-7">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white/85 px-3 py-1 text-[12px] font-black text-[var(--color-on-surface)] shadow-sm backdrop-blur sm:px-3.5 sm:py-1.5 sm:text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: theme.accent }} />
                    {theme.label}
                  </span>
                  <p className="mt-2 line-clamp-2 max-w-[230px] text-[12px] font-semibold leading-5 text-[var(--color-on-surface-variant)] sm:mt-2.5 sm:line-clamp-none sm:text-[13px] sm:leading-6">
                    {theme.desc}
                  </p>
                </figcaption>
              </figure>
            </div>
          ))}
          </div>
          </div>

          {/* 좁은 화면 전용 컨트롤: 좌우 버튼 + 인디케이터 */}
          <div className="mt-4 flex items-center justify-center gap-4 sm:hidden">
            <button
              type="button"
              aria-label="이전 테마 보기"
              onClick={() => setSlide((current) => (current === 0 ? lastSlide : current - 1))}
              className="grid size-10 place-items-center rounded-full border border-[#cfe0ff] bg-white/90 text-[#2f6bbf] shadow-sm transition hover:bg-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              {showcaseThemes.map((theme, index) => (
                <button
                  key={theme.label}
                  type="button"
                  aria-label={`${theme.label} 보기`}
                  aria-current={slide === index ? "true" : undefined}
                  onClick={() => setSlide(index)}
                  className={`h-2 rounded-full transition-all ${slide === index ? "w-5 bg-[#2f6bbf]" : "w-2 bg-[#cfe0ff]"}`}
                />
              ))}
            </div>

            <button
              type="button"
              aria-label="다음 테마 보기"
              onClick={() => setSlide((current) => (current === lastSlide ? 0 : current + 1))}
              className="grid size-10 place-items-center rounded-full border border-[#cfe0ff] bg-white/90 text-[#2f6bbf] shadow-sm transition hover:bg-white"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </Reveal>

        <Reveal delay={200} className="mt-8 flex justify-center px-5 sm:mt-14 md:px-8">
          <Link
            href="/template"
            onClick={preserveUtmNavigation}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#fee500] px-7 py-4 text-base font-black text-[#191600] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] hover:shadow-[0_10px_24px_rgba(47,107,191,0.14)] focus:outline-none focus:ring-4 focus:ring-[#fff2a8]"
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
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:px-8 md:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
        <Reveal>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
            Simple Flow
          </p>
          {/* 폭에 따라 "고르고 바꾸 / 면,"으로 끊기지 않도록 줄바꿈 위치를 고정한다 */}
          <h2 className="mt-3 text-[26px] font-black leading-tight sm:text-[44px]">
            고르고 바꾸면,
            <br />
            바로 보여요
          </h2>
          <p className="mt-3 max-w-md text-[14px] font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:mt-4 sm:text-[16px] sm:leading-8">
            템플릿을 고르고 이미지를 교체하면 미리보기에서 바로 결과가 보입니다. 마음에 들면 그대로
            다운로드하면 됩니다.
          </p>
        </Reveal>

        {/*
          바로 앞 섹션이 카드 그리드라 여기서도 카드를 깔면 같은 화면이 두 번 반복된다.
          네 단계는 순서가 핵심이므로 세로 타임라인으로 보여 리듬을 바꾼다.
        */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-8 left-[19px] top-8 w-px bg-[linear-gradient(180deg,rgba(207,224,255,0),#cfe0ff_14%,#cfe0ff_80%,rgba(207,224,255,0))] sm:left-[23px]"
          />
          <ol className="relative space-y-5 sm:space-y-7">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title}>
                  <Reveal delay={index * 80}>
                    <div className="flex items-start gap-4 sm:gap-5">
                      <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-[#dbe8fb] bg-white text-[#2f6bbf] shadow-[0_8px_18px_rgba(47,107,191,0.12)] sm:size-12">
                        <Icon className="size-4 sm:size-5" />
                      </span>
                      <div className="min-w-0 pt-1 sm:pt-1.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[11px] font-black tracking-[0.08em] text-[#9fb4d0] sm:text-[12px]">
                            0{index + 1}
                          </span>
                          <h3 className="text-[15px] font-black sm:text-xl">{step.title}</h3>
                        </div>
                        <p className="mt-1 max-w-md text-[13px] font-semibold leading-6 text-[var(--color-on-surface-variant)] sm:mt-1.5 sm:text-sm sm:leading-7">
                          {step.body}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

// "만드는 법 보기"가 왼쪽, 첫 테마 혜택 CTA가 오른쪽.
function HeroActions({ viewportGroup }: { viewportGroup: "mobile" | "desktop" }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:flex lg:justify-start">
      <Link
        href="/guide"
        className="inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-[#cfe0ff] bg-white/85 px-2 py-3.5 text-[14px] font-black text-[#2f6bbf] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#dcebff] sm:px-4 sm:text-[15px] lg:flex-none lg:px-6 lg:py-4 lg:text-base"
      >
        만드는 법 보기
      </Link>
      <Link
        href="/template"
        onClick={(event) => {
          preserveUtmNavigation(event);
          trackAnalyticsEvent("landing_primary_cta_clicked", { viewport_group: viewportGroup, destination: "template" });
        }}
        className="group inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#fee500] px-2 py-3.5 text-[14px] font-black text-[#191600] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] hover:shadow-[0_10px_24px_rgba(47,107,191,0.14)] focus:outline-none focus:ring-4 focus:ring-[#fff2a8] sm:gap-2 sm:px-4 sm:text-[15px] lg:flex-none lg:px-6 lg:py-4 lg:text-base"
      >
        무료로 시작하기
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

/**
 * `/r/*`가 첫 랜딩에서 붙인 UTM을 다음 화면까지 이어 간다.
 * 현재 주소를 새로 만들기 때문에 외부 브라우저 안내에서도 같은 유입 정보를 유지할 수 있다.
 */
function preserveUtmNavigation(event: MouseEvent<HTMLAnchorElement>, destination = "/template") {
  if (typeof window === "undefined") return;
  const current = new URL(window.location.href);
  const query = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const value = current.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const value = query.toString();
  if (!value) return;
  event.preventDefault();
  window.location.assign(`${destination}?${value}`);
}

/**
 * 가입 혜택은 히어로에서 빼고 여기 한 곳에 모은다.
 * 히어로 CTA는 "만들기 시작"이고, 이 섹션의 CTA는 "가입"이라 목적이 겹치지 않는다.
 */
function SignupOfferSection() {
  return (
    <section className="relative">
      {/* 아래 최종 CTA와 이어지는 구간이라 아래 여백은 줄여 둘을 한 덩어리로 읽히게 한다 */}
      <div className="px-5 pt-10 pb-6 mx-auto max-w-5xl md:px-8 md:pt-20 md:pb-8">
        <Reveal>
          {/*
            카드는 페이지 공통인 흰/하늘 베이스를 쓰고, 옐로우는 배지·제목 하이라이트·주 버튼에만 남긴다.
            패널 전체를 노랗게 칠하면 바로 위 파스텔 카드 섹션과 색이 부딪힌다.
          */}
          <div className="overflow-hidden rounded-[28px] border border-[#e3ecf7] bg-white/85 p-6 shadow-[0_24px_60px_rgba(47,107,191,0.08)] backdrop-blur sm:rounded-[36px] sm:p-10">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fee500] px-3 py-1.5 text-[12px] font-black text-[#191600]">
                <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                가입 혜택
              </span>
              <h2 className="mt-4 text-[26px] font-black leading-tight sm:text-[40px]">
                가입하면{" "}
                {/* 히어로 제목과 같은 손그림 하이라이트로 브랜드 톤을 잇는다 */}
                <span className="relative inline-block align-baseline">
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[-0.14em] bottom-[0.06em] z-0 h-[0.4em] -rotate-2 rounded-[0.32em] bg-[rgba(254,229,0,0.62)]"
                    style={{ transformOrigin: "left center" }}
                  />
                  <span className="relative text-[#2f6bbf]">1크레딧</span>
                </span>
                ,
                <br />첫 테마 파일은 무료예요
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-[14px] font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:mt-4 sm:text-[16px] sm:leading-8">
                카카오나 이메일로 가입하면 1크레딧이 바로 지급됩니다. 이후 테마 파일은 1크레딧부터이고,
                결제는 크레딧을 충전할 때만 발생해요.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 mt-7 sm:flex-row">
              <Link
                href="/login"
                onClick={(event) => {
                  preserveUtmNavigation(event, "/login");
                  trackAnalyticsEvent("landing_signup_cta_clicked", { destination: "login" });
                }}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#fee500] px-7 py-4 text-base font-black text-[#191600] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] hover:shadow-[0_10px_24px_rgba(47,107,191,0.14)] focus:outline-none focus:ring-4 focus:ring-[#fff2a8] sm:w-auto"
              >
                무료로 가입하고 1크레딧 받기
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              {/* 보조 동선이므로 주 버튼보다 한 단계 낮은 무게로 둔다 */}
              <Link
                href="/credits"
                className="inline-flex w-full items-center justify-center rounded-full border border-[#cfe0ff] bg-white/85 px-6 py-3 text-[15px] font-black text-[#2f6bbf] transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#dcebff] sm:w-auto"
              >
                가격 보기
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HeroMockup({ active }: { active: Subject }) {
  return (
    <div className="relative flex min-h-[340px] items-center justify-center md:min-h-[640px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.5),transparent_62%)] blur-2xl" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[86%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-[background] duration-700 ease-out"
        style={{
          background: `radial-gradient(circle, ${active.glow}, transparent 64%)`,
        }}
      />

      <div
        className="relative w-[min(56vw,232px)] pt-2 md:w-[356px] md:pt-10 motion-safe:animate-[float-soft_8s_ease-in-out_infinite]"
        style={{ ["--float-base" as string]: "rotate(0deg)" }}
      >
        <img
          data-testid="hero-mockup"
          key={active.image}
          src={active.image}
          srcSet={`${active.image.replace(".webp", "@464.webp")} 464w, ${active.image} 712w`}
          // 표시 폭은 모바일 min(56vw, 232px), md 이상 356px이다.
          sizes="(min-width: 768px) 356px, 56vw"
          alt={`${active.keyword} 테마 적용 예시`}
          width={712}
          height={1412}
          // 첫 화면 LCP 후보다. 늦게 발견되지 않도록 우선순위를 올린다.
          fetchPriority="high"
          decoding="async"
          className="h-auto w-full drop-shadow-[0_40px_70px_rgba(27,28,25,0.28)] motion-safe:animate-[hero-swap_620ms_cubic-bezier(0.22,1,0.36,1)]"
        />
      </div>
    </div>
  );
}
