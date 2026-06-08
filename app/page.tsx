"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Heart, ImageIcon, Layers3, MessageCircle, PawPrint, Sparkles, Star, UploadCloud } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

const heroSubjects = [
  {
    label: "연인",
    title: "연인 테마",
    subtitle: "서로의 사진과 대화 무드를 중심으로 구성한 테스트 목업",
    chatTitle: "연인 테마 미리보기",
    chatMessages: [
      { align: "left" as const, text: "둘만의 사진으로 채팅방 분위기를 바로 바꿔볼 수 있어요." },
      { align: "right" as const, text: "프로필과 아이콘까지 같은 톤으로 맞춰집니다." },
      { align: "left" as const, text: "템플릿에서 시작해서 APK 빌드까지 이어집니다." },
    ],
    previewImage: "/template-assets/spongebob/android/theme_chatroom_background_image.png",
    profileImage: "/template-assets/basic/android/theme_profile_01_image.png",
    accent: "from-[#ffd8e8] via-[#fff2f6] to-[#ffffff]",
    pillColor: "bg-[#fff0f6] text-[#be185d]",
  },
  {
    label: "반려동물",
    title: "반려동물 테마",
    subtitle: "프로필과 대표 아이콘에 집중한 테스트 목업",
    chatTitle: "반려동물 테마 미리보기",
    chatMessages: [
      { align: "left" as const, text: "가장 자주 보는 얼굴을 프로필과 배경에 자연스럽게 넣습니다." },
      { align: "right" as const, text: "친구 목록과 채팅방 톤을 함께 맞출 수 있어요." },
      { align: "left" as const, text: "공통 리소스도 같은 편집 화면에서 바로 확인합니다." },
    ],
    previewImage: "/template-assets/basic/android/theme_profile_01_image.png",
    profileImage: "/template-assets/basic/android/theme_profile_01_image.png",
    accent: "from-[#dcfce7] via-[#effcf5] to-[#ffffff]",
    pillColor: "bg-[#ecfdf5] text-[#047857]",
  },
  {
    label: "캐릭터",
    title: "캐릭터 테마",
    subtitle: "캐릭터 기반 화면 스타일을 검수하는 테스트 목업",
    chatTitle: "캐릭터 테마 미리보기",
    chatMessages: [
      { align: "left" as const, text: "좋아하는 캐릭터 이미지를 실제 카카오톡 화면에 맞춰 정리합니다." },
      { align: "right" as const, text: "말풍선, 배경, 목록형 화면까지 같은 캐릭터 톤으로 연결돼요." },
      { align: "left" as const, text: "테스트 이미지로 동작만 먼저 확인할 수 있습니다." },
    ],
    previewImage: "/template-assets/spongebob/android/theme_profile_01_image.png",
    profileImage: "/template-assets/spongebob/android/theme_profile_01_image.png",
    accent: "from-[#fff4bf] via-[#fff8dc] to-[#ffffff]",
    pillColor: "bg-[#fef3c7] text-[#b45309]",
  },
  {
    label: "최애",
    title: "최애 테마",
    subtitle: "무드와 강조색을 더 선명하게 보여주는 테스트 목업",
    chatTitle: "최애 테마 미리보기",
    chatMessages: [
      { align: "left" as const, text: "프로필, 아이콘, 채팅방을 하나의 팬 테마로 정리합니다." },
      { align: "right" as const, text: "실제 적용 전 preview로 화면 균형을 먼저 검수할 수 있어요." },
      { align: "left" as const, text: "완성되면 Android APK로 바로 내려받습니다." },
    ],
    previewImage: "/template-assets/basic/android/icon.png",
    profileImage: "/template-assets/spongebob/android/theme_profile_01_image.png",
    accent: "from-[#dbeafe] via-[#eef4ff] to-[#ffffff]",
    pillColor: "bg-[#eff6ff] text-[#1d4ed8]",
  },
] as const;

const useCases = [
  {
    title: "연인을 위한 테마",
    copy: "서로의 사진과 대화 무드를 담아 매일 여는 카카오톡을 더 개인적으로 만든다.",
    accent: "from-[#ffe1ec] via-[#fff4f7] to-white",
    icon: Heart,
  },
  {
    title: "가족을 위한 테마",
    copy: "부모님, 아이들, 가족 여행 사진을 화면 전반에 자연스럽게 연결할 수 있다.",
    accent: "from-[#fff0c9] via-[#fff8e7] to-white",
    icon: Sparkles,
  },
  {
    title: "반려동물 테마",
    copy: "프로필, 아이콘, 채팅방 배경까지 가장 자주 보는 순간을 중심으로 꾸민다.",
    accent: "from-[#dff7f0] via-[#effcf8] to-white",
    icon: PawPrint,
  },
  {
    title: "캐릭터 · 연예인 테마",
    copy: "좋아하는 캐릭터나 최애 이미지를 실제 카카오톡 UI에 맞춰 정리해 적용한다.",
    accent: "from-[#e5ebff] via-[#f4f6ff] to-white",
    icon: Star,
  },
];

const steps = [
  { title: "템플릿 선택", detail: "기본 스타일과 시작 구조를 고른다.", icon: Layers3 },
  { title: "이미지 업로드", detail: "배경, 프로필, 아이콘, 말풍선을 채운다.", icon: UploadCloud },
  { title: "화면별 검수", detail: "채팅방, 친구 목록, 공통 리소스를 확인한다.", icon: ImageIcon },
  { title: "Android APK 빌드", detail: "샘플 프로젝트 기반으로 바로 빌드한다.", icon: ArrowRight },
];

const featureBands = [
  {
    eyebrow: "Template-first",
    title: "좋아하는 존재에서 시작하는 카카오톡 테마 제작",
    body: "연인, 가족, 반려동물, 캐릭터, 연예인 사진을 템플릿 위에 올리고 실제 카카오톡 화면 흐름으로 검수한다.",
  },
  {
    eyebrow: "Preview-driven",
    title: "채팅방, 친구 목록, 공통 아이콘과 프로필까지 같은 워크플로 안에서 확인",
    body: "감성만 강조하는 랜딩이 아니라 실제 리소스 슬롯과 preview가 연결된 제작 도구다.",
  },
  {
    eyebrow: "Export-ready",
    title: "편집한 결과를 Android APK까지 바로 연결",
    body: "템플릿 선택에서 끝나지 않고, 샘플 프로젝트 기반 빌드까지 한 번에 이어진다.",
  },
];

export default function HomePage() {
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const activeHero = heroSubjects[activeHeroIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveHeroIndex((current) => (current + 1) % heroSubjects.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#111827]">
      <SiteHeader />

      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-12 md:px-8 md:pb-20 md:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:items-center">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d7dee8] bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#475569] shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <Sparkles className="h-3.5 w-3.5 text-[#2563eb]" />
              loved ones, pets, fandom
            </div>
            <h1 className="mt-5 max-w-4xl text-balance text-[38px] font-black leading-[1.05] text-[#0f172a] sm:text-[50px] lg:text-[62px]">
              내가 좋아하는{" "}
              <span className="relative inline-flex min-w-[1.9em] items-center justify-center align-baseline">
                <span
                  key={activeHero.label}
                  className={`inline-flex rounded-[18px] bg-gradient-to-r px-4 py-1.5 text-[#0f172a] shadow-[0_12px_28px_rgba(15,23,42,0.08)] motion-safe:animate-[fade-rise_2600ms_ease-in-out_infinite] ${activeHero.accent}`}
                >
                  {activeHero.label}
                </span>
              </span>
              로
              <br />
              카카오톡 테마를 만들어 보세요
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-[17px] font-medium leading-8 text-[#475569] sm:text-[19px]">
              사랑하는 연인, 가족같은 반려동물, 좋아하는 캐릭터와 연예인 사진으로 채팅방, 친구 목록, 프로필, 대표 아이콘까지 직접 꾸민다. 템플릿을 고르고 이미지를 넣고 preview를 확인한 뒤 Android APK까지 바로 빌드할 수 있다.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {heroSubjects.map((subject, index) => (
                <button
                  key={subject.label}
                  type="button"
                  onClick={() => setActiveHeroIndex(index)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${index === activeHeroIndex ? `${subject.pillColor} shadow-[0_12px_24px_rgba(15,23,42,0.08)]` : "bg-white text-[#475569] ring-1 ring-[#d7dee8] hover:bg-[#f8fafc]"}`}
                >
                  {subject.label}
                </button>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/template" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111827] px-6 py-4 text-base font-black text-white shadow-[0_18px_36px_rgba(15,23,42,0.22)] transition hover:translate-y-[-1px]">
                내 테마 만들기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/editor" className="inline-flex items-center justify-center rounded-full border border-[#cbd5e1] bg-white px-6 py-4 text-base font-semibold text-[#334155] transition hover:border-[#94a3b8] hover:bg-[#f8fafc]">
                말풍선만 정밀 편집
              </Link>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {featureBands.map((band) => (
                <div key={band.title} className="rounded-3xl border border-[#e2e8f0] bg-white/88 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#64748b]">{band.eyebrow}</p>
                  <strong className="mt-2 block text-sm font-bold leading-6 text-[#0f172a]">{band.title}</strong>
                  <p className="mt-2 text-sm leading-6 text-[#64748b]">{band.body}</p>
                </div>
              ))}
            </div>
          </div>

          <HeroVisual activeHero={activeHero} activeHeroIndex={activeHeroIndex} />
        </div>
      </section>

      <section className="border-y border-[#e2e8f0] bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-8 md:px-8 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="grid grid-cols-[auto_1fr] items-start gap-4 rounded-3xl bg-[#f8fafc] px-5 py-5">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#111827] text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#94a3b8]">{String(index + 1).padStart(2, "0")}</span>
                  <strong className="mt-1 block text-base font-bold text-[#0f172a]">{step.title}</strong>
                  <p className="mt-1 text-sm leading-6 text-[#64748b]">{step.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">Use cases</p>
          <h2 className="max-w-3xl text-balance text-[30px] font-black leading-tight text-[#0f172a] sm:text-[40px]">
            감정은 각자 다르지만,
            <br />
            시작 방식은 하나로 정리된다
          </h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {useCases.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className={`group grid min-h-[280px] content-between overflow-hidden rounded-[32px] border border-[#d7dee8] bg-gradient-to-b ${item.accent} p-6 shadow-[0_18px_42px_rgba(15,23,42,0.06)] transition hover:translate-y-[-2px]`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/88 text-[#111827] shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#475569]">
                    Theme
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#0f172a]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#475569]">{item.copy}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-[#0f172a]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#93c5fd]">Product preview</p>
            <h2 className="mt-3 text-balance text-[30px] font-black leading-tight text-white sm:text-[42px]">
              실제 편집 화면을 기준으로
              <br />
              바로 만들고 바로 확인한다
            </h2>
            <p className="mt-5 max-w-xl text-[16px] leading-8 text-[#cbd5e1]">
              템플릿 선택부터 공통 아이콘, 프로필, 채팅방 preview, 말풍선 정밀 조정, Android APK 빌드까지 한 흐름 안에 있다. 감성만 보여주는 소개 페이지가 아니라 실제 결과를 만들어내는 워크플로 자체를 제품 중심으로 드러낸다.
            </p>
          </div>
          <PreviewShowcase />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
        <div className="rounded-[40px] border border-[#dbe2ea] bg-white px-6 py-10 shadow-[0_22px_52px_rgba(15,23,42,0.08)] sm:px-10 lg:px-14 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">Start now</p>
              <h2 className="mt-3 max-w-3xl text-balance text-[30px] font-black leading-tight text-[#0f172a] sm:text-[42px]">
                매일 여는 카카오톡을
                <br />
                좋아하는 존재로 채우는 가장 빠른 시작
              </h2>
              <p className="mt-4 max-w-2xl text-[16px] leading-8 text-[#64748b]">
                템플릿을 먼저 고르고, 화면별로 필요한 슬롯을 채우고, 바로 preview와 APK 결과로 이어진다.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link href="/template" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c9ff3f] px-6 py-4 text-base font-black text-[#111827] shadow-[0_18px_36px_rgba(201,255,63,0.28)] transition hover:translate-y-[-1px]">
                템플릿으로 시작
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/editor" className="inline-flex items-center justify-center rounded-full border border-[#cbd5e1] bg-white px-6 py-4 text-base font-semibold text-[#334155] transition hover:border-[#94a3b8] hover:bg-[#f8fafc]">
                말풍선 편집기로 이동
              </Link>
            </div>
          </div>
        </div>
      </section>

      <style jsx global>{`
        @keyframes fade-rise {
          0%,
          16% {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          24%,
          76% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-10px) scale(0.98);
          }
        }
      `}</style>
    </main>
  );
}

function HeroVisual({
  activeHero,
  activeHeroIndex,
}: {
  activeHero: (typeof heroSubjects)[number];
  activeHeroIndex: number;
}) {
  return (
    <div className="relative min-h-[640px]">
      <div className={`absolute left-1/2 top-6 h-[240px] w-[240px] -translate-x-1/2 rounded-full bg-gradient-to-br ${activeHero.accent} blur-3xl`} />
      <div className="absolute right-4 top-32 h-[200px] w-[200px] rounded-full bg-[#93c5fd]/35 blur-3xl" />

      <div className="relative mx-auto grid h-full max-w-[620px] items-center">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="order-2 grid gap-4 lg:order-1">
            <MiniPhoneCard
              title={activeHero.title}
              subtitle={activeHero.subtitle}
              image={activeHero.profileImage}
              accent={activeHero.accent}
              activeHeroIndex={activeHeroIndex}
            />
            <MiniListCard image={activeHero.profileImage} label={activeHero.label} />
          </div>
          <div className="order-1 lg:order-2">
            <HeroPhone activeHero={activeHero} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroPhone({ activeHero }: { activeHero: (typeof heroSubjects)[number] }) {
  return (
    <div className="relative mx-auto w-full max-w-[360px] rounded-[40px] border border-[#d7dee8] bg-white p-3 shadow-[0_32px_70px_rgba(15,23,42,0.18)]">
      <div
        className="overflow-hidden rounded-[30px] border border-[#e2e8f0] bg-[#f8fafc]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08)), url('${activeHero.previewImage}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex items-center justify-between bg-white/88 px-5 pb-4 pt-5">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#64748b]">Chat preview</p>
            <strong className="mt-1 block text-base font-black text-[#0f172a]">{activeHero.chatTitle}</strong>
          </div>
          <span className="rounded-full bg-[#111827] px-3 py-1 text-[11px] font-extrabold text-white">Android</span>
        </div>

        <div className="grid gap-4 px-4 py-5">
          <div className="justify-self-center rounded-full bg-[#0f172a]/16 px-4 py-1 text-[11px] font-bold text-white">{activeHero.label}</div>
          {activeHero.chatMessages.map((message) => (
            <BubbleRow key={`${activeHero.label}-${message.align}-${message.text}`} align={message.align} text={message.text} />
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-white/25 bg-white/88 px-3 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef2f7] text-[#475569]">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="h-10 flex-1 rounded-full bg-white/90" />
          <span className="rounded-full bg-[#c9ff3f] px-4 py-2 text-xs font-black text-[#111827]">Send</span>
        </div>
      </div>
    </div>
  );
}

function BubbleRow({ align, text }: { align: "left" | "right"; text: string }) {
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-[22px] border border-white/60 px-4 py-3 text-sm font-medium leading-6 text-[#1f2937] shadow-[0_14px_26px_rgba(15,23,42,0.08)] ${align === "right" ? "bg-[#fff04f] text-right" : "bg-white"}`}
      >
        {text}
      </div>
    </div>
  );
}

function MiniPhoneCard({
  title,
  subtitle,
  image,
  accent,
  activeHeroIndex,
}: {
  title: string;
  subtitle: string;
  image: string;
  accent: string;
  activeHeroIndex: number;
}) {
  return (
    <div className="rounded-[28px] border border-[#d7dee8] bg-white p-4 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between">
        <div>
          <strong className="block text-sm font-black text-[#0f172a]">{title}</strong>
          <span className="mt-1 block text-xs font-medium text-[#64748b]">{subtitle}</span>
        </div>
        <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#475569]">
          test
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((item) => (
          <div key={`${title}-${item}-${activeHeroIndex}`} className="grid justify-items-center gap-2">
            <span
              className={`block h-16 w-16 rounded-full border border-[#d7dee8] bg-cover bg-center shadow-[0_10px_20px_rgba(15,23,42,0.08)] ${item === 2 ? "rounded-[18px]" : ""}`}
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.08)), url('${image}')`,
              }}
            />
            <span className={`h-2 w-10 rounded-full bg-gradient-to-r ${accent}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniListCard({ image, label }: { image: string; label: string }) {
  return (
    <div className="rounded-[28px] border border-[#d7dee8] bg-white p-4 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between">
        <div>
          <strong className="block text-sm font-black text-[#0f172a]">친구 목록</strong>
          <span className="mt-1 block text-xs font-medium text-[#64748b]">{label} 테마 테스트 목업</span>
        </div>
        <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#475569]">
          list
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        <ListRow name={`${label} 목록 1`} note="목업 이미지 교체 가능" image={image} />
        <ListRow name={`${label} 목록 2`} note="실제 리스트 구성 미리보기" image={image} />
        <ListRow name={`${label} 목록 3`} note="프로필 기반 테스트 카드" image={image} />
      </div>
    </div>
  );
}

function ListRow({ name, note, image }: { name: string; note: string; image: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl bg-[#f8fafc] px-3 py-3">
      <span className="block h-11 w-11 rounded-full border border-[#d7dee8] bg-cover bg-center" style={{ backgroundImage: `url('${image}')` }} />
      <div>
        <strong className="block text-sm font-bold text-[#0f172a]">{name}</strong>
        <span className="mt-1 block text-xs font-medium text-[#64748b]">{note}</span>
      </div>
    </div>
  );
}

function PreviewShowcase() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="grid gap-5">
        <SurfacePanel title="공통 리소스">
          <div className="grid grid-cols-[96px_1fr] gap-4">
            <span className="block h-24 w-24 rounded-[28px] border border-white/20 bg-[url('/template-assets/basic/android/icon.png')] bg-cover bg-center shadow-[0_18px_30px_rgba(0,0,0,0.18)]" />
            <div className="grid gap-3">
              <div className="flex gap-3">
                <span className="block h-14 w-14 rounded-full border border-white/20 bg-[url('/template-assets/basic/android/theme_profile_01_image.png')] bg-cover bg-center" />
                <span className="block h-14 w-14 rounded-full border border-white/20 bg-[url('/template-assets/spongebob/android/theme_profile_01_image.png')] bg-cover bg-center" />
                <span className="block h-14 w-14 rounded-full border border-dashed border-white/30" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="h-20 rounded-2xl border border-white/20 bg-white/10" />
                <span className="h-20 rounded-2xl border border-white/20 bg-white/10" />
                <span className="h-20 rounded-2xl border border-white/20 bg-white/10" />
              </div>
            </div>
          </div>
        </SurfacePanel>
        <SurfacePanel title="템플릿 진입">
          <div className="grid grid-cols-2 gap-3">
            <PreviewCard name="기본 템플릿" accent="bg-[#f3f6fb]" />
            <PreviewCard name="스폰지밥 템플릿" accent="bg-[#fff6bf]" />
          </div>
        </SurfacePanel>
      </div>
      <SurfacePanel title="워크스페이스">
        <div className="grid gap-4">
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4">
            <div className="grid gap-2 rounded-3xl bg-white/8 p-3">
              {["메인 화면", "하단 탭", "채팅방", "공통 리소스"].map((label, index) => (
                <div key={label} className={`rounded-2xl px-3 py-2 text-sm font-semibold ${index === 2 ? "bg-[#eff6ff] text-[#0f172a]" : "bg-white/6 text-[#cbd5e1]"}`}>
                  {label}
                </div>
              ))}
            </div>
            <div className="grid gap-3 rounded-3xl bg-white/8 p-4">
              <div className="flex items-center justify-between">
                <strong className="text-sm font-bold text-white">채팅방 배경</strong>
                <span className="rounded-full bg-[#c9ff3f] px-2.5 py-1 text-[10px] font-black text-[#111827]">선택 중</span>
              </div>
              <div className="rounded-[24px] border border-white/15 bg-white/10 p-4">
                <div className="grid h-32 place-items-center rounded-[20px] border border-dashed border-white/20 bg-white/10 text-sm font-semibold text-[#cbd5e1]">
                  이미지 업로드 · candidate 선택
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-3xl bg-white/8 p-4">
            <div className="flex gap-2">
              {["기본값", "내 업로드", "제작자 후보"].map((tab, index) => (
                <span key={tab} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${index === 0 ? "bg-white text-[#111827]" : "bg-white/10 text-[#cbd5e1]"}`}>
                  {tab}
                </span>
              ))}
            </div>
          </div>
        </div>
      </SurfacePanel>
    </div>
  );
}

function SurfacePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[32px] border border-white/12 bg-white/6 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <strong className="text-sm font-black text-white">{title}</strong>
        <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#93c5fd]">preview</span>
      </div>
      {children}
    </div>
  );
}

function PreviewCard({ name, accent }: { name: string; accent: string }) {
  return (
    <div className={`rounded-[24px] ${accent} p-4`}>
      <strong className="block text-sm font-black text-[#0f172a]">{name}</strong>
      <div className="mt-4 h-28 rounded-[18px] border border-[#d7dee8] bg-white/80" />
    </div>
  );
}
