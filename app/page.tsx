"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  Images,
  Palette,
  Smartphone,
} from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

const subjects = [
  {
    keyword: "연인",
    title: "둘만의 대화",
    tone: "from-[#ffe4ec] via-[#fff7f9] to-[#ffffff]",
    ink: "text-[#b42355]",
    ring: "ring-[#ffc6d8]",
    background:
      "radial-gradient(circle at 18% 12%, rgba(255, 190, 209, 0.82), transparent 28%), radial-gradient(circle at 86% 28%, rgba(255, 230, 128, 0.68), transparent 30%), linear-gradient(135deg, #fff8fa 0%, #ffffff 48%, #f7f0ff 100%)",
    chat: [
      { side: "left", text: "오늘 테마 색감 너무 좋다" },
      { side: "right", text: "우리 사진으로 바꾸니까 진짜 내 카톡 같아" },
      { side: "left", text: "말풍선까지 같이 맞춰봤어" },
    ],
    profile: "bg-[#ffb8cc]",
  },
  {
    keyword: "반려동물",
    title: "매일 보는 얼굴",
    tone: "from-[#dcfce7] via-[#f6fff9] to-[#ffffff]",
    ink: "text-[#087443]",
    ring: "ring-[#bbf7d0]",
    background:
      "radial-gradient(circle at 22% 18%, rgba(187, 247, 208, 0.86), transparent 30%), radial-gradient(circle at 82% 36%, rgba(254, 240, 138, 0.64), transparent 28%), linear-gradient(135deg, #f6fff9 0%, #ffffff 48%, #eefbf5 100%)",
    chat: [
      { side: "left", text: "프로필을 이 사진으로 넣어볼까?" },
      { side: "right", text: "하단 탭도 초록 톤으로 맞추자" },
      { side: "left", text: "귀여운데 너무 과하지 않아서 좋아" },
    ],
    profile: "bg-[#86efac]",
  },
  {
    keyword: "캐릭터",
    title: "직접 그린 세계",
    tone: "from-[#fef3c7] via-[#fffaf0] to-[#ffffff]",
    ink: "text-[#a16207]",
    ring: "ring-[#fde68a]",
    background:
      "radial-gradient(circle at 16% 20%, rgba(253, 230, 138, 0.9), transparent 28%), radial-gradient(circle at 82% 22%, rgba(196, 181, 253, 0.58), transparent 28%), linear-gradient(135deg, #fffaf0 0%, #ffffff 46%, #f5f3ff 100%)",
    chat: [
      { side: "left", text: "배경에 직접 그린 그림을 넣었어" },
      { side: "right", text: "아이콘이랑 말풍선도 같은 분위기로" },
      { side: "left", text: "테마 하나가 작은 작품 같아" },
    ],
    profile: "bg-[#facc15]",
  },
  {
    keyword: "최애",
    title: "개인 소장 무드",
    tone: "from-[#dbeafe] via-[#f6f9ff] to-[#ffffff]",
    ink: "text-[#1d4ed8]",
    ring: "ring-[#bfdbfe]",
    background:
      "radial-gradient(circle at 20% 18%, rgba(191, 219, 254, 0.88), transparent 30%), radial-gradient(circle at 82% 24%, rgba(221, 214, 254, 0.72), transparent 30%), linear-gradient(135deg, #f6f9ff 0%, #ffffff 48%, #eef2ff 100%)",
    chat: [
      { side: "left", text: "공개 배포 말고 개인용으로만 쓸게" },
      { side: "right", text: "색상은 차분하게 정리했어" },
      { side: "left", text: "미리보기로 가독성 먼저 확인하자" },
    ],
    profile: "bg-[#93c5fd]",
  },
] as const;

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

export default function HomePage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = subjects[activeIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % subjects.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader />

      <section
        className="relative isolate min-h-[calc(100svh-73px)] overflow-hidden"
        style={{ background: active.background }}
      >
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(251,249,244,0.96)_0%,rgba(251,249,244,0.74)_42%,rgba(251,249,244,0.2)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-[var(--color-background)] to-transparent" />

        <div className="mx-auto grid min-h-[calc(100svh-73px)] max-w-7xl items-center gap-8 px-5 py-10 md:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:py-12">
          <div className="relative z-10 max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--color-on-surface-variant)]">
              KakaoTalk Theme Maker
            </p>

            <h1 className="mt-5 text-balance text-[42px] font-black leading-[1.04] text-[var(--color-on-background)] sm:text-[58px] lg:text-[76px]">
              내가 좋아하는{" "}
              <span className="relative inline-grid min-w-[3.1em] align-baseline">
                <span
                  key={active.keyword}
                  className={`rounded-[0.34em] bg-white/78 px-3 py-1 shadow-[0_18px_42px_rgba(27,28,25,0.09)] ring-1 ${active.ring} ${active.ink} motion-safe:animate-[word-swap_3200ms_ease-in-out_infinite]`}
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
              템플릿을 고르고 사진과 색상만 바꾸면, 채팅방과 친구 목록 미리보기까지 확인한 뒤
              Android APK 또는 iOS ktheme로 완성할 수 있습니다.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/template"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-6 py-4 text-base font-black text-[var(--color-inverse-on-surface)] shadow-[0_18px_36px_rgba(27,28,25,0.2)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-container)]"
              >
                테마 만들기
                <ArrowRight className="h-4 w-4" />
              </Link>
              {/* <Link
                href="/editor"
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-outline-variant)] bg-white/86 px-6 py-4 text-base font-black text-[var(--color-on-surface)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-container)]"
              >
                편집기 열기
              </Link> */}
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {subjects.map((subject, index) => (
                <button
                  key={subject.keyword}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`rounded-full px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-container)] ${index === activeIndex
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

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
            Simple Flow
          </p>
          <h2 className="mt-3 max-w-lg text-balance text-[32px] font-black leading-tight sm:text-[44px]">
            설명보다 결과가 먼저 보이는 제작 흐름
          </h2>
          <p className="mt-4 max-w-md text-[16px] font-semibold leading-8 text-[var(--color-on-surface-variant)]">
            홈에서는 감정적인 사용 장면을 보여주고, 제작 화면에서는 템플릿, 이미지 교체,
            미리보기, 다운로드로 바로 이어지게 만듭니다.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <article
                key={step.title}
                className="rounded-[28px] border border-[var(--color-outline-variant)] bg-white/76 p-5 shadow-[0_18px_42px_rgba(27,28,25,0.05)]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-xl font-black">{step.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)]">
                  {step.body}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-[var(--color-inverse-surface)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 text-[var(--color-inverse-on-surface)] md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] lg:items-center">
          <div>
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
          </div>

          <div className="grid gap-3">
            {["Android APK", "iOS ktheme", "화면별 미리보기"].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-5 py-4"
              >
                <span className="flex items-center gap-3 text-base font-black">
                  <Check className="h-5 w-5 text-[#fee500]" />
                  {item}
                </span>
                <ChevronRight className="h-5 w-5 text-white/50" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <style jsx global>{`
        @keyframes word-swap {
          0%,
          14% {
            opacity: 0;
            transform: translateY(0.18em);
          }
          24%,
          76% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-0.16em);
          }
        }
      `}</style>
    </main>
  );
}

function HeroMockup({ active }: { active: (typeof subjects)[number] }) {
  return (
    <div className="relative min-h-[470px] md:min-h-[620px]">
      <div className="absolute inset-x-0 top-8 mx-auto h-[440px] max-w-[660px] rounded-[48px] bg-white/24 blur-2xl" />

      <div className="absolute left-[2%] top-[10%] hidden w-[210px] rotate-[-8deg] opacity-70 blur-[1px] sm:block lg:left-[0%] lg:top-[20%]">
        <PhoneFrame active={active} compact label="Friends" />
      </div>

      <div className="absolute right-[0%] top-[4%] hidden w-[230px] rotate-[9deg] opacity-75 blur-[0.5px] md:block">
        <PhoneFrame active={active} compact label="Profile" />
      </div>

      <div className="relative mx-auto w-[min(82vw,360px)] pt-8 md:pt-14">
        <PhoneFrame active={active} label={active.title} />
      </div>
    </div>
  );
}

function PhoneFrame({
  active,
  compact = false,
  label,
}: {
  active: (typeof subjects)[number];
  compact?: boolean;
  label: string;
}) {
  return (
    <div className="rounded-[42px] border border-white/70 bg-[#1f2933] p-2 shadow-[0_34px_80px_rgba(27,28,25,0.26)]">
      <div className="overflow-hidden rounded-[34px] bg-white">
        <div className={`bg-gradient-to-br ${active.tone} px-4 pb-4 pt-5`}>
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-black/16" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/42">
                Theme Preview
              </p>
              <strong className="mt-1 block text-base font-black text-[#1b1c19]">{label}</strong>
            </div>
            <span className={`h-12 w-12 rounded-2xl ${active.profile} shadow-inner`} />
          </div>
        </div>

        {compact ? (
          <div className="grid gap-3 px-4 py-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid grid-cols-[auto_1fr] items-center gap-3">
                <span className={`h-10 w-10 rounded-full ${item % 2 ? active.profile : "bg-[#ece8dd]"}`} />
                <span className="grid gap-1.5">
                  <span className="h-2.5 w-24 rounded-full bg-[#1b1c19]/18" />
                  <span className="h-2 w-32 rounded-full bg-[#1b1c19]/10" />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="min-h-[390px] px-4 py-5">
            <div className="mb-4 text-center">
              <span className="rounded-full bg-[#1b1c19]/10 px-3 py-1 text-[11px] font-black text-[#1b1c19]/54">
                {active.keyword}
              </span>
            </div>

            <div className="grid gap-4">
              {active.chat.map((message) => (
                <div
                  key={message.text}
                  className={`flex ${message.side === "right" ? "justify-end" : "justify-start"}`}
                >
                  <p
                    className={`max-w-[82%] rounded-[22px] px-4 py-3 text-sm font-bold leading-6 shadow-[0_12px_24px_rgba(27,28,25,0.09)] ${message.side === "right"
                        ? "bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]"
                        : "bg-[#f6f4ee] text-[#1b1c19]"
                      }`}
                  >
                    {message.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-[26px] border border-[#ece8dd] bg-[#fbf9f4] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-black text-[#4b4732]">적용 전 체크</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#4b4732]">
                  Ready
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className={`h-16 rounded-2xl ${active.profile}`} />
                <span className="h-16 rounded-2xl bg-[#ece8dd]" />
                <span className="h-16 rounded-2xl bg-[var(--color-primary-container)]" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
