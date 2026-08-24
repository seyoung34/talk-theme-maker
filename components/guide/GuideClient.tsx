"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, Apple, Check, ChevronRight, CircleAlert, Images, Smartphone } from "lucide-react";
import { guideContent, type EasyStep, type GuidePlatform, type GuideSection } from "@/lib/guide/content";
import { EasyStepMediaFrame } from "@/components/guide/EasyStepMedia";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";

type GuideClientProps = {
  initialPlatform: GuidePlatform;
};

/**
 * 가이드는 **한 페이지다.**
 *
 * 예전에는 "쉬운 / 자세한" 두 모드를 먼저 고르게 했다. 처음 오는 사람에게는 그 자체가 부담이다 —
 * 무엇이 다른지 모르는 채로 골라야 하고, 잘못 고르면 자기가 찾던 것이 없는 화면에 도착한다.
 * 게다가 쉬운 쪽 8스텝과 자세한 쪽 `01 처음부터 적용까지`는 같은 흐름을 두 번 쓴 것이었다.
 *
 * 이제 위에서 아래로 깊어진다. 8스텝 영상이 먼저 오고, 규격과 문제 해결은 그 아래에 있다.
 * 처음 오는 사람은 위만 보면 되고, 다시 오는 사람은 찾아 내려온다.
 *
 * **플랫폼 구분은 남긴다.** 모드와 달리 Android와 iOS는 결과물이 다르다(APK 대 .ktheme,
 * 설치 경로, 규격). 합치면 모든 문단에 "Android는… iOS는…"이 붙는다.
 */
export default function GuideClient({ initialPlatform }: GuideClientProps) {
  const router = useRouter();
  const [platform, setPlatform] = useState<GuidePlatform>(initialPlatform);

  useEffect(() => setPlatform(initialPlatform), [initialPlatform]);
  useEffect(() => {
    trackAnalyticsEvent("install_guide_viewed", { platform });
  }, [platform]);

  const selectPlatform = (value: string) => {
    if (value !== "android" && value !== "ios") return;
    setPlatform(value);
    router.push(`/guide?platform=${value}`, { scroll: false });
  };

  return (
    <Tabs.Root value={platform} onValueChange={selectPlatform}>
      <header className="grid gap-7 border-b border-[#e3ecf7] pb-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-3.5 py-1.5 text-[11px] font-black tracking-[0.16em] text-[#3d7bd6] shadow-sm backdrop-blur">
            THEME GUIDE
          </span>
          <h1 className="mt-4 max-w-2xl text-[32px] font-black leading-[1.16] tracking-[-0.02em] text-[var(--color-on-background)] sm:text-[44px]">만드는 방법부터<br className="hidden sm:block" /> 적용하는 순간까지</h1>
        </div>
        <div className="grid gap-2.5">
          <Tabs.List className="grid w-full grid-cols-2 rounded-full border border-[#dbe8fb] bg-[#eef5ff] p-1" aria-label="가이드 플랫폼 선택">
            <PlatformTab value="android" label="Android" icon={<Smartphone size={17} aria-hidden="true" />} />
            <PlatformTab value="ios" label="iOS" icon={<Apple size={17} aria-hidden="true" />} />
          </Tabs.List>
        </div>
      </header>

      <Tabs.Content value="android" className="outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bbf]">
        <EasyGuide platform="android" />
        <PlatformManual platform="android" />
      </Tabs.Content>
      <Tabs.Content value="ios" className="outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bbf]">
        <EasyGuide platform="ios" />
        <PlatformManual platform="ios" />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function PlatformTab({ value, label, icon }: { value: GuidePlatform; label: string; icon: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className="flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-black text-[#3d7bd6] transition data-[state=active]:bg-[#2f6bbf] data-[state=active]:text-white data-[state=active]:shadow-[0_10px_22px_rgba(47,107,191,0.24)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2f6bbf]"
    >
      {icon}{label}
    </Tabs.Trigger>
  );
}

function EasyGuide({ platform }: { platform: GuidePlatform }) {
  const guide = guideContent[platform];
  const steps = guide.easySteps;

  if (!steps || steps.length === 0) {
    return (
      <div className="pt-10">
        <div className="mx-auto grid max-w-lg place-items-center gap-3 rounded-[28px] border border-[#dbe8fb] bg-white/70 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bbf]"><Images size={22} aria-hidden="true" /></span>
          <p className="text-lg font-black text-[var(--color-on-background)]">{guide.label} 화면 가이드를 준비하고 있어요</p>
          {/* 아래로 이어지는 상세 문서가 이미 같은 페이지에 있다. 전환 버튼을 둘 자리가 아니다. */}
          <p className="max-w-sm text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">단계별 화면은 곧 추가돼요. 아래 문서에 만드는 방법과 규격이 정리돼 있어요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <ol className="grid gap-5">
        {steps.map((step, index) => (
          <EasyStepCard key={step.title} step={step} index={index} platformLabel={guide.label} />
        ))}
      </ol>
    </div>
  );
}

function EasyStepCard({ step, index, platformLabel }: { step: EasyStep; index: number; platformLabel: string }) {
  return (
    <li className="overflow-hidden rounded-[28px] border border-[#e3ecf7] bg-white shadow-[0_18px_42px_rgba(47,107,191,0.06)]">
      {/*
        가로 2단이 아니라 세로로 쌓는다. 편집기 화면을 절반 폭 칸에 넣으면 1920으로 찍은 자료가
        698px로 줄어(2.75배 버림) 슬롯 이름 같은 작은 글자를 읽을 수 없다. 세로로 쌓으면 같은
        자료가 카드 폭을 그대로 쓴다.

        곁들여 좁은 화면 문제도 사라진다. 예전 구조는 카드가 768px에서 2단이 되는데 자료는
        1024px까지 세로(9:16)라, 그 사이 구간에서 세로 영상이 좁은 칸에 들어가 카드 높이가
        800px을 넘었다. 단이 하나면 두 기준이 어긋날 자리가 없다.
      */}
      <div className="flex flex-col gap-2 p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-[#2f6bbf] text-sm font-black text-white">{index + 1}</span>
          <h3 className="text-lg font-black tracking-[-0.01em] text-[var(--color-on-background)] sm:text-xl">{step.title}</h3>
        </div>
        {step.hardStep ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#fff8e1] px-3 py-1 text-[11px] font-black text-[#8a6a10]"><AlertTriangle size={12} aria-hidden="true" />가장 헷갈리는 곳</span>
        ) : null}
        <p className="text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{step.caption}</p>
      </div>

      {/* 자료는 화면 높이에 맞춰 줄어들 수 있어 카드보다 좁아진다. 남는 자리를 띠로 채워 가운데 정렬이 의도로 보이게 한다. */}
      <div className="border-y border-[#e3ecf7] bg-[#eef5ff] px-5 py-5 sm:px-7 sm:py-6">
        {step.media ? (
          <EasyStepMediaFrame step={step} label={`${platformLabel} ${step.title} 화면`} />
        ) : (
          <div className="mx-auto grid aspect-[16/9] w-full max-w-md place-items-center rounded-2xl bg-[#f7fbff] px-6 text-center">
            <div className="grid gap-2">
              <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bbf]"><AlertTriangle size={20} aria-hidden="true" /></span>
              <p className="text-xs font-black tracking-[0.14em] text-[#94a3b8]">SCREEN COMING SOON</p>
              {/* 화면 자료가 아직 없다는 안내다. 무엇을 해야 하는지는 아래 순서가 이미 알려준다. */}
              <p className="text-sm font-semibold text-[var(--color-on-surface-variant)]">화면 사진은 준비 중이에요. 아래 순서를 그대로 따라 하면 돼요.</p>
            </div>
          </div>
        )}
      </div>

      {/*
        순서가 곧 내용인 스텝만 여기까지 온다. 번호를 보이게 그리는 이유는, 설치 허용처럼
        건너뛰면 다음이 진행되지 않는 동작이 섞여 있어서 "몇 번째까지 했는지"가 중요하기 때문이다.

        카드 폭을 다 쓰면 한 줄이 너무 길어 읽는 눈이 되돌아올 자리를 놓친다. 폭을 제한하고
        왼쪽에 붙여 위쪽 제목과 같은 선에서 시작하게 한다.
      */}
      {step.actions?.length ? (
        <ol className="grid max-w-3xl gap-2 p-5 sm:p-7">
          {step.actions.map((action, actionIndex) => (
            <li key={action} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-2.5">
              <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-[#eef5ff] font-mono text-[10px] font-bold text-[#2f6bbf]">{actionIndex + 1}</span>
              <span className="text-sm font-medium leading-6 text-[var(--color-on-surface-variant)]">{action}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {/*
        심화 내용은 접어서 그 스텝 안에 둔다.

        펼쳐 두면 8스텝 전체가 무거워져 "그대로 따라 하면 된다"는 인상이 깨지고, 아래 상세 문서로만
        보내면 문맥에서 멀어져 못 찾는다. 막힌 사람은 지금 보고 있는 스텝에서 찾기 때문이다.

        `<details>`를 쓰는 이유는 상태를 직접 들지 않기 위해서다. 브라우저가 여닫기를 맡고,
        스크린리더도 접힌 채로 제목을 읽어 준다.
      */}
      {step.details?.length ? (
        <div className="grid gap-2 px-5 pb-5 sm:px-7 sm:pb-7">
          {step.details.map((detail) => (
            <details key={detail.title} className="group max-w-3xl rounded-2xl border border-[#e3ecf7] bg-[#f7fbff] px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-[#2f6bbf] marker:content-['']">
                <ChevronRight size={15} aria-hidden="true" className="shrink-0 transition group-open:rotate-90" />
                {detail.title}
              </summary>
              <p className="mt-2 pl-[23px] text-sm font-medium leading-6 text-[var(--color-on-surface-variant)]">{detail.body}</p>
            </details>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function PlatformManual({ platform }: { platform: GuidePlatform }) {
  const guide = guideContent[platform];
  const isAndroid = platform === "android";

  return (
    <div className="pt-7">
      <div className={`relative overflow-hidden rounded-[28px] border px-5 py-6 shadow-[0_18px_42px_rgba(47,107,191,0.06)] sm:px-7 sm:py-7 ${isAndroid ? "border-[#bdeeda] bg-[#eafaf1]" : "border-[#cfe0ff] bg-[#e3efff]"}`}>
        <div className={`absolute -right-8 -top-12 size-40 rounded-full border-[28px] opacity-45 ${isAndroid ? "border-[#bdeeda]" : "border-[#cfe0ff]"}`} aria-hidden="true" />
        <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <p className={`text-xs font-black tracking-[0.16em] ${isAndroid ? "text-[#1f8f6b]" : "text-[#2f6bbf]"}`}>{guide.label.toUpperCase()} FIELD MANUAL</p>
            <h2 className="mt-2 max-w-2xl text-[28px] font-black tracking-[-0.02em] text-[var(--color-on-background)] sm:text-[34px]">{guide.label} 가이드 문서</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{guide.intro}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:min-w-[260px]">
            <div><dt className="font-bold text-[#64748b]">기준 샘플</dt><dd className="mt-1 font-extrabold text-[var(--color-on-background)]">{guide.sourceVersion}</dd></div>
            <div><dt className="font-bold text-[#64748b]">출력 형식</dt><dd className="mt-1 font-extrabold text-[var(--color-on-background)]">{guide.output}</dd></div>
            {/* <div className="col-span-2 min-w-0"><dt className="font-bold text-[#64748b]">참조 경로</dt><dd className="mt-1 truncate font-mono text-[11px] font-bold" title={guide.sourcePath}>{guide.sourcePath}</dd></div> */}
          </dl>
        </div>
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
        <aside className="min-w-0">
          <nav className="sticky top-[88px]" aria-label={`${guide.label} 가이드 목차`}>
            <p className="mb-2 text-[11px] font-black tracking-[0.14em] text-[#94a3b8]">ON THIS PAGE</p>
            <ol className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] lg:grid lg:overflow-visible lg:pb-0">
              {guide.sections.map((section, index) => (
                <li key={section.id} className="shrink-0 lg:shrink">
                  <a href={`#${section.id}`} className="flex min-h-10 items-center gap-2 rounded-full px-2.5 py-2 text-xs font-extrabold text-[var(--color-on-surface-variant)] transition hover:bg-[#eef5ff] hover:text-[#2f6bbf] focus-visible:outline-2 focus-visible:outline-[#2f6bbf]">
                    <span className="font-mono text-[10px] text-[#9bc0f5]">0{index + 1}</span>{section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="min-w-0 divide-y divide-[#e3ecf7]">
          {guide.sections.map((section) => <GuideSectionBlock key={section.id} section={section} />)}
        </div>
      </div>
    </div>
  );
}

function GuideSectionBlock({ section }: { section: GuideSection }) {
  return (
    <section id={section.id} className="scroll-mt-24 py-9 first:pt-2 sm:py-12" aria-labelledby={`${section.id}-title`}>
      <div className="grid gap-5 md:grid-cols-[150px_minmax(0,1fr)] md:gap-8">
        <p className="pt-1 text-[10px] font-black tracking-[0.15em] text-[#3d7bd6]">{section.eyebrow}</p>
        <div className="min-w-0">
          <h3 id={`${section.id}-title`} className="text-2xl font-black tracking-[-0.02em] text-[var(--color-on-background)] sm:text-[28px]">{section.title}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{section.summary}</p>

          {section.steps ? (
            <ol className="mt-7 grid gap-0 border-y border-[#e3ecf7]">
              {section.steps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-[#e3ecf7] py-4 last:border-b-0 sm:grid-cols-[40px_150px_minmax(0,1fr)] sm:gap-4">
                  <span className="grid size-7 place-items-center rounded-full bg-[#2f6bbf] font-mono text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span>
                  <strong className="pt-1 text-sm font-extrabold text-[var(--color-on-background)]">{step.title}</strong>
                  <div className="col-start-2 text-sm font-medium leading-6 text-[var(--color-on-surface-variant)] sm:col-start-3">
                    <p>{step.body}</p>
                    {step.note ? <p className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-[#2f6bbf]"><Check className="mt-0.5 shrink-0" size={14} aria-hidden="true" />{step.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {section.specifications ? (
            <div className="mt-7 overflow-hidden rounded-[20px] border border-[#e3ecf7] bg-white">
              <div className="hidden grid-cols-[140px_220px_minmax(0,1fr)] border-b border-[#e3ecf7] bg-[#f7fbff] px-4 py-2.5 text-[10px] font-black tracking-[0.12em] text-[#94a3b8] sm:grid">
                <span>항목</span><span>규격</span><span>설명</span>
              </div>
              <dl className="divide-y divide-[#e3ecf7]">
                {section.specifications.map((item) => (
                  <div key={item.subject} className="grid gap-1 px-4 py-4 sm:grid-cols-[140px_220px_minmax(0,1fr)] sm:gap-0">
                    <dt className="text-xs font-extrabold text-[var(--color-on-background)]">{item.subject}</dt>
                    <dd className="break-all font-mono text-[11px] font-bold text-[#2f6bbf] sm:pr-5">{item.value}</dd>
                    <dd className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{item.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {section.caution ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#f5da8e] bg-[#fff8e1] px-4 py-3 text-[#8a6a10]">
              <CircleAlert className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
              <p className="text-xs font-bold leading-5">{section.caution}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
