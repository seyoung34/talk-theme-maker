"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { Apple, Check, CircleAlert, Smartphone } from "lucide-react";
import { guideContent, type GuidePlatform, type GuideSection } from "@/lib/guide/content";

type GuideClientProps = {
  initialPlatform: GuidePlatform;
};

export default function GuideClient({ initialPlatform }: GuideClientProps) {
  const router = useRouter();
  const [platform, setPlatform] = useState<GuidePlatform>(initialPlatform);

  useEffect(() => setPlatform(initialPlatform), [initialPlatform]);

  const selectPlatform = (value: string) => {
    if (value !== "android" && value !== "ios") return;
    setPlatform(value);
    router.push(`/guide?platform=${value}`, { scroll: false });
  };

  return (
    <Tabs.Root value={platform} onValueChange={selectPlatform}>
      <header className="grid gap-7 border-b border-[var(--color-outline-variant)] pb-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p className="text-xs font-black tracking-[0.16em] text-[var(--color-secondary)]">THEME GUIDE</p>
          <h1 className="mt-2 max-w-2xl font-[var(--font-display)] text-[34px] font-semibold tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[42px]">만드는 방법부터<br className="hidden sm:block" /> 적용하는 순간까지</h1>
        </div>
        <Tabs.List className="grid w-full grid-cols-2 rounded-[14px] bg-[var(--color-surface-container)] p-1" aria-label="가이드 플랫폼 선택">
          <PlatformTab value="android" label="Android" icon={<Smartphone size={17} aria-hidden="true" />} />
          <PlatformTab value="ios" label="iOS" icon={<Apple size={17} aria-hidden="true" />} />
        </Tabs.List>
      </header>

      <Tabs.Content value="android" className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]">
        <PlatformManual platform="android" />
      </Tabs.Content>
      <Tabs.Content value="ios" className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]">
        <PlatformManual platform="ios" />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function PlatformTab({ value, label, icon }: { value: GuidePlatform; label: string; icon: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className="flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-extrabold text-[var(--color-on-surface-variant)] transition data-[state=active]:bg-white data-[state=active]:text-[var(--color-on-surface)] data-[state=active]:shadow-[0_2px_10px_rgba(48,49,46,0.08)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-secondary)]"
    >
      {icon}{label}
    </Tabs.Trigger>
  );
}

function PlatformManual({ platform }: { platform: GuidePlatform }) {
  const guide = guideContent[platform];
  const isAndroid = platform === "android";

  return (
    <div className="pt-7">
      <div className={`relative overflow-hidden rounded-[20px] border px-5 py-6 sm:px-7 sm:py-7 ${isAndroid ? "border-[#b9ddd3] bg-[#edf8f4]" : "border-[#c9d8ed] bg-[#f1f6fc]"}`}>
        <div className={`absolute -right-8 -top-12 size-40 rounded-full border-[28px] opacity-45 ${isAndroid ? "border-[#b9ddd3]" : "border-[#c9d8ed]"}`} aria-hidden="true" />
        <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <p className={`text-xs font-black tracking-[0.16em] ${isAndroid ? "text-[#246758]" : "text-[#315e95]"}`}>{guide.label.toUpperCase()} FIELD MANUAL</p>
            <h2 className="mt-2 max-w-2xl font-[var(--font-display)] text-[28px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)] sm:text-[34px]">{guide.label} 가이드 문서</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{guide.intro}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:min-w-[260px]">
            <div><dt className="font-bold text-[var(--color-outline)]">기준 샘플</dt><dd className="mt-1 font-extrabold">{guide.sourceVersion}</dd></div>
            <div><dt className="font-bold text-[var(--color-outline)]">출력 형식</dt><dd className="mt-1 font-extrabold">{guide.output}</dd></div>
            {/* <div className="col-span-2 min-w-0"><dt className="font-bold text-[var(--color-outline)]">참조 경로</dt><dd className="mt-1 truncate font-mono text-[11px] font-bold" title={guide.sourcePath}>{guide.sourcePath}</dd></div> */}
          </dl>
        </div>
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
        <aside className="min-w-0">
          <nav className="sticky top-[88px]" aria-label={`${guide.label} 가이드 목차`}>
            <p className="mb-2 text-[11px] font-black tracking-[0.14em] text-[var(--color-outline)]">ON THIS PAGE</p>
            <ol className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] lg:grid lg:overflow-visible lg:pb-0">
              {guide.sections.map((section, index) => (
                <li key={section.id} className="shrink-0 lg:shrink">
                  <a href={`#${section.id}`} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-extrabold text-[var(--color-on-surface-variant)] transition hover:bg-white hover:text-[var(--color-on-surface)] focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)]">
                    <span className="font-mono text-[10px] text-[var(--color-outline)]">0{index + 1}</span>{section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="min-w-0 divide-y divide-[var(--color-outline-variant)]">
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
        <p className="pt-1 text-[10px] font-black tracking-[0.15em] text-[var(--color-secondary)]">{section.eyebrow}</p>
        <div className="min-w-0">
          <h3 id={`${section.id}-title`} className="font-[var(--font-display)] text-2xl font-semibold tracking-[-0.035em] text-[var(--color-on-surface)] sm:text-[28px]">{section.title}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{section.summary}</p>

          {section.steps ? (
            <ol className="mt-7 grid gap-0 border-y border-[var(--color-outline-variant)]">
              {section.steps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-[var(--color-outline-variant)] py-4 last:border-b-0 sm:grid-cols-[40px_150px_minmax(0,1fr)] sm:gap-4">
                  <span className="grid size-7 place-items-center rounded-full bg-[var(--color-inverse-surface)] font-mono text-[10px] font-bold text-[var(--color-inverse-on-surface)]">{String(index + 1).padStart(2, "0")}</span>
                  <strong className="pt-1 text-sm font-extrabold text-[var(--color-on-surface)]">{step.title}</strong>
                  <div className="col-start-2 text-sm font-medium leading-6 text-[var(--color-on-surface-variant)] sm:col-start-3">
                    <p>{step.body}</p>
                    {step.note ? <p className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-[var(--color-secondary)]"><Check className="mt-0.5 shrink-0" size={14} aria-hidden="true" />{step.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {section.specifications ? (
            <div className="mt-7 overflow-hidden rounded-[14px] border border-[var(--color-outline-variant)] bg-white">
              <div className="hidden grid-cols-[140px_220px_minmax(0,1fr)] border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-2.5 text-[10px] font-black tracking-[0.12em] text-[var(--color-outline)] sm:grid">
                <span>항목</span><span>규격</span><span>설명</span>
              </div>
              <dl className="divide-y divide-[var(--color-outline-variant)]">
                {section.specifications.map((item) => (
                  <div key={item.subject} className="grid gap-1 px-4 py-4 sm:grid-cols-[140px_220px_minmax(0,1fr)] sm:gap-0">
                    <dt className="text-xs font-extrabold text-[var(--color-on-surface)]">{item.subject}</dt>
                    <dd className="break-all font-mono text-[11px] font-bold text-[var(--color-secondary)] sm:pr-5">{item.value}</dd>
                    <dd className="text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{item.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {section.caution ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#e5c968] bg-[#fff8d8] px-4 py-3 text-[#5d4e13]">
              <CircleAlert className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
              <p className="text-xs font-bold leading-5">{section.caution}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
