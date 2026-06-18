"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Hash, SendHorizontal, Plus, Search, Settings, UserRound } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import UserTemplateCard from "@/components/template/UserTemplateCard";
import { createSystemTemplatePreviewUrls, createSystemTemplatePreviewVisual, type SignedUrlCache, type TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";
import { systemTemplateRepository, type SystemTemplateSummary } from "@/lib/theme/systemTemplates";
import { templateStartStorageKey, themeTemplates, type ThemeTemplate } from "@/lib/theme/templates";
import { deleteUserTemplate, listUserTemplates, type UserTemplateSummary } from "@/lib/theme/userTemplates";
import type { ThemePlatform } from "@/lib/theme/types";

type GalleryTemplateItem =
  | {
    id: string;
    kind: "base" | "seed";
    title: string;
    description?: string;
    badge: string;
    baseTemplate: ThemeTemplate;
    visual: TemplatePreviewVisual;
  }
  | {
    id: string;
    kind: "system";
    title: string;
    description?: string;
    badge: string;
    baseTemplate: ThemeTemplate;
    bundleId: string;
    variants: Partial<Record<ThemePlatform, SystemTemplateSummary>>;
    previewTemplate: SystemTemplateSummary;
    visual: TemplatePreviewVisual;
  };

type TemplatePreviewModel = {
  title: string;
  description?: string;
  eyebrow: string;
  closeLabel: string;
  androidLabel: string;
  iosLabel: string;
  baseTemplate: ThemeTemplate;
  visual: TemplatePreviewVisual;
  availablePlatforms?: ThemePlatform[];
  rows: Array<{ label: string; value: string }>;
  onStart: (platform: ThemePlatform) => void;
};

export default function TemplateGalleryClient() {
  const router = useRouter();
  const [selectedGalleryTemplateId, setSelectedGalleryTemplateId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplateSummary[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplateSummary[]>([]);
  const [systemUploadPreviewUrls, setSystemUploadPreviewUrls] = useState<SignedUrlCache>({});
  const [isSystemTemplatesLoading, setIsSystemTemplatesLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const galleryTemplates = useMemo(
    () =>
      createGalleryTemplates(systemTemplates, systemUploadPreviewUrls).map((item) => ({
        ...item,
        onStart: (platform: ThemePlatform) => {
          if (item.kind === "system") {
            const variant = item.variants[platform];
            if (variant) startSystemTemplateWithPlatform(variant, platform);
          } else {
            start(item.baseTemplate, platform);
          }
        },
      })),
    [systemTemplates, systemUploadPreviewUrls],
  );
  const selectedGalleryTemplate = galleryTemplates.find((template) => template.id === selectedGalleryTemplateId) ?? null;
  const previewModel = selectedGalleryTemplate ? createGalleryTemplatePreviewModel(selectedGalleryTemplate, selectedGalleryTemplate.onStart) : null;
  const basicGalleryTemplateId = "base:basic";
  const hasSavedTemplates = userTemplates.length > 0;

  useEffect(() => {
    let active = true;
    listUserTemplates()
      .then((templates) => {
        if (active) setUserTemplates(templates);
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setUserTemplates([]);
          setNotice("내 템플릿 목록을 불러오지 못했습니다.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    systemTemplateRepository
      .list()
      .then(async (templates) => {
        const publicTemplates = templates.filter((template) => template.status === "published" && template.visibility === "public");
        const previewUrls = await createSystemTemplatePreviewUrls(publicTemplates, systemUploadPreviewUrls);
        if (active) {
          setSystemTemplates(publicTemplates);
          setSystemUploadPreviewUrls(previewUrls);
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setSystemTemplates([]);
          setNotice("System templates could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setIsSystemTemplatesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const start = (template: ThemeTemplate, platform: ThemePlatform) => {
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ templateId: template.id, platform }));
    router.push("/edit");
  };

  const startUserTemplate = (template: UserTemplateSummary) => {
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ templateId: template.templateId, platform: template.platform, userTemplateId: template.id }));
    router.push("/edit");
  };

  const startSystemTemplateWithPlatform = (template: SystemTemplateSummary, platform: ThemePlatform) => {
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ templateId: template.baseTemplateId, platform, systemTemplateId: template.id, systemTemplateBundleId: template.bundleId ?? template.id, editMode: "user" }));
    router.push("/edit");
  };

  const handleDeleteUserTemplate = async (event: React.MouseEvent<HTMLButtonElement>, template: UserTemplateSummary) => {
    event.stopPropagation();
    const confirmed = window.confirm(`"${template.name}" 템플릿을 삭제하시겠습니까?`);
    if (!confirmed) return;

    try {
      await deleteUserTemplate(template.id);
      setUserTemplates((current) => current.filter((item) => item.id !== template.id));
      setNotice("내 템플릿을 삭제했습니다.");
    } catch (error) {
      console.error(error);
      setNotice("템플릿을 삭제하지 못했습니다.");
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/template" />

      <div className="grid gap-8 px-5 py-8 mx-auto max-w-7xl md:px-8 md:py-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_360px] lg:items-end">
          <strong className="text-2xl uppercase">template</strong>
        </section>

        {/* <section className="grid gap-3 rounded-[24px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
          <div className="flex items-center gap-3 rounded-[18px] bg-white/88 px-4 py-3 text-sm font-semibold text-[var(--color-on-surface-variant)]">
            <Search className="w-4 h-4" />
            <span>검색 / 태그 / 정렬 영역 예정</span>
          </div>
          <span className="inline-flex justify-center rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">
            Preview first
          </span>
          <span className="inline-flex justify-center rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-on-surface-variant)]">
            Saved first
          </span>
        </section> */}

        {notice ? (
          <div className="rounded-[18px] border border-[var(--color-outline-variant)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-on-surface-variant)] shadow-[0_12px_28px_rgba(42,103,103,0.06)]">
            {notice}
          </div>
        ) : null}

        <section className="grid gap-5 rounded-[32px] border border-[var(--color-outline-variant)] bg-white/92 p-5 shadow-[0_18px_48px_rgba(42,103,103,0.08)] md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">내 템플릿</h2>

            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-low)] px-3 py-2 text-xs font-bold text-[var(--color-on-surface-variant)]">
              <Clock3 className="w-4 h-4" />
              최근 수정순
            </div>
          </div>

          {hasSavedTemplates ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {userTemplates.map((template) => (
                <UserTemplateCard
                  key={template.id}
                  template={template}
                  formattedDate={formatDate(template.updatedAt)}
                  onDelete={handleDeleteUserTemplate}
                  onContinue={startUserTemplate}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 rounded-[24px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <strong className="block text-lg font-black text-[var(--color-on-surface)]">저장된 템플릿이 아직 없습니다.</strong>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-on-surface-variant)]">
                  기본 템플릿으로 시작해 편집 상태를 저장하면, 다음부터는 이 영역에서 바로 이어서 작업할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-4 py-2.5 text-sm font-black text-[var(--color-inverse-on-surface)]"
                onClick={() => setSelectedGalleryTemplateId(basicGalleryTemplateId)}
              >
                기본 템플릿 보기
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">템플릿 갤러리</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isSystemTemplatesLoading ? <TemplateGallerySkeletonCards count={3} /> : null}
            {galleryTemplates.map((template) => (
              <GalleryTemplateCard key={template.id} template={template} onPreview={setSelectedGalleryTemplateId} />
            ))}
          </div>
        </section>
      </div>

      {previewModel ? (
        <TemplatePreviewModal
          preview={previewModel}
          onClose={() => {
            setSelectedGalleryTemplateId(null);
          }}
        />
      ) : null}
    </main>
  );
}

function createGalleryTemplates(systemTemplates: SystemTemplateSummary[], uploadPreviewUrls: SignedUrlCache): GalleryTemplateItem[] {
  const basicTemplate = themeTemplates.find((template) => template.id === "basic") ?? themeTemplates[0];
  const seedTemplates = themeTemplates.filter((template) => template.id !== "basic");

  return [
    {
      id: `base:${basicTemplate.id}`,
      kind: "base",
      title: basicTemplate.name,
      description: basicTemplate.description,
      badge: "기본",
      baseTemplate: basicTemplate,
      visual: createBaseTemplatePreviewVisual(basicTemplate),
    },
    ...seedTemplates.map((template) => ({
      id: `seed:${template.id}`,
      kind: "seed" as const,
      title: template.name,
      description: template.description,
      badge: "시스템",
      baseTemplate: template,
      visual: createBaseTemplatePreviewVisual(template),
    })),
    ...groupSystemTemplateRecords(systemTemplates).map((bundle) => {
      const previewTemplate = bundle.variants.android ?? bundle.variants.ios!;
      const baseTemplate = themeTemplates.find((item) => item.id === previewTemplate.baseTemplateId) ?? basicTemplate;
      return {
        id: `system:${bundle.id}`,
        kind: "system" as const,
        title: previewTemplate.title,
        description: previewTemplate.description,
        badge: "시스템",
        baseTemplate,
        bundleId: bundle.id,
        variants: bundle.variants,
        previewTemplate,
        visual: createSystemTemplatePreviewVisual({
          template: baseTemplate,
          platform: previewTemplate.platform,
          summary: previewTemplate,
          signedUrls: uploadPreviewUrls,
          seedAssets: spongebobPreviewAssets(baseTemplate),
        }),
      };
    }),
  ];
}

function createGalleryTemplatePreviewModel(template: GalleryTemplateItem, onStart: (platform: ThemePlatform) => void): TemplatePreviewModel {
  if (template.kind === "system") {
    return {
      title: template.title,
      description: template.description,
      eyebrow: "Template preview",
      closeLabel: "닫기",
      androidLabel: "Android로 시작",
      iosLabel: "iOS로 시작",
      baseTemplate: template.baseTemplate,
      visual: template.visual,
      availablePlatforms: Object.keys(template.variants) as ThemePlatform[],
      rows: [
        { label: "기반", value: template.baseTemplate.name },
        { label: "저장된 플랫폼", value: Object.keys(template.variants).map((value) => (value === "android" ? "Android" : "iOS")).join(" / ") || "없음" },
        { label: "색상", value: `${template.previewTemplate.colorCount}` },
        { label: "이미지", value: `${template.previewTemplate.uploadCount}` },
      ],
      onStart,
    };
  }

  return {
    title: template.title,
    description: template.baseTemplate.previewNote,
    eyebrow: "Template preview",
    closeLabel: "닫기",
    androidLabel: "Android로 시작",
    iosLabel: "iOS로 시작",
    baseTemplate: template.baseTemplate,
    visual: template.visual,
    availablePlatforms: ["android", "ios"],
    rows: [
      { label: "채팅방 배경", value: template.visual.chatBackgroundColor },
      { label: "내 말풍선", value: template.visual.myBubbleColor },
      { label: "상대 말풍선", value: template.visual.friendBubbleColor },
      { label: "플랫폼", value: template.baseTemplate.defaults.platform === "android" ? "Android" : "iOS" },
    ],
    onStart,
  };
}

function GalleryTemplateCard({ template, onPreview }: { template: GalleryTemplateItem; onPreview: (templateId: string) => void }) {
  return (
    <button
      type="button"
      className="group grid min-h-[392px] max-w-[420px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white/92 p-4 text-left shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
      onClick={() => onPreview(template.id)}
    >
      <div className="grid gap-4">
        <TemplateMiniPreview visual={template.visual} />
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">

            {template.kind === "system" ? <span className="rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-[11px] font-black uppercase text-[var(--color-on-surface-variant)]">{Object.keys(template.variants).join(" / ")}</span> : null}
          </div>
          <strong className="font-[var(--font-display)] text-[26px] font-semibold leading-tight text-[var(--color-on-surface)]">{template.title}</strong>
          {template.description ? <span className="line-clamp-2 text-sm leading-6 text-[var(--color-on-surface-variant)]">{template.description}</span> : null}
        </div>
      </div>

      <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)]">
        템플릿 확인
        <ArrowRight className="w-4 h-4" />
      </span>
    </button>
  );
}

function TemplateGallerySkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="grid min-h-[392px] max-w-[420px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white/70 p-4 shadow-[0_16px_36px_rgba(42,103,103,0.04)]">
          <div className="grid gap-4">
            <div className="aspect-[4/3] animate-pulse rounded-[22px] bg-[var(--color-surface-low)]" />
            <div className="grid gap-2">
              <span className="h-5 w-20 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
              <span className="h-8 w-4/5 animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
              <span className="h-4 w-full animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
              <span className="h-4 w-2/3 animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
            </div>
          </div>
          <span className="mt-4 h-10 w-28 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
        </div>
      ))}
    </>
  );
}

function TemplatePreviewModal({ preview, onClose }: { preview: TemplatePreviewModel; onClose: () => void }) {
  const canStartAndroid = preview.availablePlatforms?.includes("android") ?? true;
  const canStartIos = preview.availablePlatforms?.includes("ios") ?? true;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.55)] p-4" role="dialog" aria-modal="true" aria-label={`${preview.title} preview`}>
      <section className="grid max-h-[calc(100dvh-24px)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_64px_rgba(42,103,103,0.2)] sm:max-h-[calc(100dvh-32px)] sm:rounded-[32px]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-outline-variant)] px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">{preview.eyebrow}</p>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold leading-tight text-[var(--color-on-surface)] sm:text-3xl">{preview.title}</h2>
            {preview.description ? <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-[var(--color-on-surface-variant)] sm:text-sm">{preview.description}</p> : null}
          </div>
          <button className="shrink-0 rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:bg-white sm:px-4 sm:text-sm" type="button" onClick={onClose}>
            {preview.closeLabel}
          </button>
        </header>

        <div className="grid min-h-0 gap-3 p-3 sm:grid-cols-[minmax(220px,0.82fr)_minmax(260px,1fr)] sm:p-4 lg:grid-cols-[340px_1fr]">
          <TemplatePhonePreview template={preview.baseTemplate} visual={preview.visual} />
          <div className="grid min-h-0 content-between gap-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {preview.rows.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="rounded-full bg-[var(--color-inverse-surface)] px-4 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] transition hover:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40" type="button" onClick={() => preview.onStart("android")} disabled={!canStartAndroid}>
                {preview.androidLabel}
              </button>
              <button className="rounded-full bg-[var(--color-primary-container)] px-4 py-3 text-sm font-black text-[var(--color-on-primary-container)] transition hover:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40" type="button" onClick={() => preview.onStart("ios")} disabled={!canStartIos}>
                {preview.iosLabel}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
function TemplateMiniPreview({ visual }: { visual: TemplatePreviewVisual }) {
  return (
    <div
      className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-[var(--color-outline-variant)] bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"

    >
      {/* 친구탭 프리뷰 */}
      <div className="absolute inset-0 " />
      <div className="relative grid h-full grid-cols-[0.84fr_1fr] gap-2.5 p-3">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[18px] bg-white/70 bg-contain bg-center bg-no-repeat shadow-[0_12px_26px_rgba(42,103,103,0.08)]"
          style={{ backgroundColor: visual.mainBackgroundColor, backgroundImage: visual.mainBackgroundImage ? `url(${visual.mainBackgroundImage})` : undefined }}>
          <div className="flex h-9 items-center justify-between px-3">
            <strong className="text-sm font-black text-[var(--color-on-surface)]">친구</strong>
            <div className="flex items-center gap-1.5 text-[var(--color-on-surface)]">
              <Search className="h-3.5 w-3.5" />
              <Settings className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="grid gap-2 px-3 pb-3">
            <MiniFriendRow visual={visual} width="w-[74%]" />
            <MiniFriendRow visual={visual} width="w-[92%]" />
          </div>
          <MiniTabBar visual={visual} compact />
        </div>

        <div
          className="relative grid min-h-0 content-between overflow-hidden rounded-[18px] bg-cover bg-center p-2.5 shadow-[0_12px_26px_rgba(42,103,103,0.08)]"
          style={{ backgroundColor: visual.chatBackgroundColor, backgroundImage: visual.chatBackgroundImage ? `url(${visual.chatBackgroundImage})` : undefined }}
        >
          {/* <div className="flex h-7 items-center justify-between rounded-full bg-white/84 px-2.5 text-[10px] font-black text-[var(--color-on-surface)]">
            <span>테마</span>
            <MessageCircle className="h-3.5 w-3.5" />
          </div> */}
          <div className="grid h-full w-full grid-rows-3 gap-1.5">
            <MiniBubble visual={visual} tone="friend" width="w-[72%]" />
            <MiniBubble visual={visual} tone="me" width="w-[78%]" />
            <MiniBubble visual={visual} tone="friend" width="w-[88%]" />
          </div>
          <div className="absolute bottom-1 left-2 w-[90%] grid grid-cols-[18px_minmax(0,1fr)_18px] items-center gap-1.5 rounded-full bg-white/82 p-1.5">
            <Plus className="h-3.5 w-3.5 justify-self-center text-[var(--color-on-surface-variant)]" />
            <span className="h-3 rounded-full bg-black/8" />
            <SendHorizontal className="h-3.5 w-3.5 justify-self-center text-[var(--color-on-surface-variant)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplatePhonePreview({ template, visual }: { template: ThemeTemplate; visual: TemplatePreviewVisual }) {
  return (
    <div
      className="mx-auto grid h-[min(48dvh,500px)] min-h-[250px] w-full max-w-[310px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[28px] border border-[var(--color-outline-variant)] bg-cover bg-center shadow-[0_22px_52px_rgba(42,103,103,0.14)] sm:h-[min(68dvh,540px)] sm:max-w-[330px] sm:rounded-[32px] lg:max-w-[340px]"
      style={{ backgroundColor: visual.chatBackgroundColor, backgroundImage: visual.chatBackgroundImage ? `url(${visual.chatBackgroundImage})` : undefined }}
    >
      <div className="flex h-12 items-center justify-between bg-white/90 px-4 text-xs font-black text-[var(--color-on-surface)] sm:h-14 sm:px-5 sm:text-sm">
        <span>{template.name}</span>
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4" />
          <Settings className="h-4 w-4" />
        </div>
      </div>
      <div className="grid min-h-0 content-start gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
        <div className="justify-self-center rounded-full bg-[#14343a]/18 px-5 py-1 text-xs font-bold text-white">Today</div>
        <PreviewMessage visual={visual} mine={false} text="테마 분위기를 확인합니다." />
        <PreviewMessage visual={visual} mine text="말풍선과 배경을 함께 볼 수 있어요." />
        <PreviewMessage visual={visual} mine={false} text="저장된 색상과 이미지가 반영됩니다." />
        <PreviewMessage visual={visual} mine text="이 템플릿으로 시작할게요." />
      </div>
      <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 bg-white/90 px-3 py-2">
        <Plus className="h-5 w-5 justify-self-center text-[var(--color-on-surface-variant)]" />
        <span className="rounded-full bg-[var(--color-surface-low)] px-4 py-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">사용자 입력</span>
        <Hash className="h-5 w-5 justify-self-center text-[var(--color-on-surface-variant)]" />
      </div>
    </div>
  );
}

function MiniFriendRow({ visual, width }: { visual: TemplatePreviewVisual; width: string }) {
  return (
    <div className={`grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2 ${width}`}>
      <MiniAvatar src={visual.profileImage} />
      <span className="h-4 rounded-full bg-black/10" />
    </div>
  );
}

function MiniAvatar({ src }: { src?: string }) {
  return (
    <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-container)]/55">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-3.5 w-3.5 text-[var(--color-on-primary-container)]" />}
    </span>
  );
}

function MiniTabBar({ visual, compact = false }: { visual: TemplatePreviewVisual; compact?: boolean }) {
  return (
    <div
      className={`grid grid-cols-5 items-center bg-cover bg-center ${compact ? "h-8 px-2" : "h-12 px-3"}`}
      style={{ backgroundColor: visual.tabBackgroundColor, backgroundImage: visual.tabBackgroundImage ? `url(${visual.tabBackgroundImage})` : undefined }}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={`justify-self-center rounded-full ${index === 1 ? "bg-[var(--color-primary-container)]" : "bg-black/14"} ${compact ? "h-3.5 w-3.5" : "h-5 w-5"}`} />
      ))}
    </div>
  );
}

function MiniBubble({ visual, tone, width }: { visual: TemplatePreviewVisual; tone: "me" | "friend"; width: string }) {
  const mine = tone === "me";
  const bubbleImage = mine ? visual.myBubbleImage : visual.friendBubbleImage;
  if (bubbleImage) {
    return (
      <span className={`${width} flex h-full min-h-0 items-center ${mine ? "justify-self-end justify-end" : ""}`}>
        <img src={bubbleImage} alt="" className="max-h-full w-full object-contain" />
      </span>
    );
  }

  return (
    <span
      className={`${width} h-7 rounded-[12px] bg-[length:100%_100%] bg-no-repeat ${mine ? "justify-self-end" : ""}`}
      style={{
        backgroundColor: mine ? visual.myBubbleColor : visual.friendBubbleColor,
      }}
    />
  );
}

function PreviewMessage({ visual, mine, text }: { visual: TemplatePreviewVisual; mine: boolean; text: string }) {
  const bubbleImage = mine ? visual.myBubbleImage : visual.friendBubbleImage;
  return (
    <div className={`grid gap-1.5 ${mine ? "justify-items-end" : "grid-cols-[28px_minmax(0,1fr)] items-end"}`}>
      {!mine ? <MiniAvatar src={visual.profileImage} /> : null}
      <span
        className={`max-w-[84%] rounded-[18px] bg-[length:100%_100%] bg-no-repeat px-4 py-3 text-sm font-semibold leading-5 text-[var(--color-on-surface)] ${mine ? "justify-self-end" : ""}`}
        style={{
          backgroundColor: bubbleImage ? "transparent" : mine ? visual.myBubbleColor : visual.friendBubbleColor,
          backgroundImage: bubbleImage ? `url(${bubbleImage})` : undefined,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function createBaseTemplatePreviewVisual(template: ThemeTemplate): TemplatePreviewVisual {
  const seedAssets = spongebobPreviewAssets(template);
  return {
    chatBackgroundColor: template.defaults.chatBackground,
    mainBackgroundColor: template.defaults.mainBackground,
    tabBackgroundColor: template.defaults.tabBackground,
    myBubbleColor: template.defaults.myBubble,
    friendBubbleColor: template.defaults.friendBubble,
    chatBackgroundImage: seedAssets.chatBackground,
    mainBackgroundImage: seedAssets.mainBackground,
    myBubbleImage: seedAssets.myBubble,
    friendBubbleImage: seedAssets.friendBubble,
    profileImage: seedAssets.profileImage,
  };
}

function groupSystemTemplateRecords(templates: SystemTemplateSummary[]) {
  const map = new Map<string, { id: string; variants: Partial<Record<ThemePlatform, SystemTemplateSummary>>; updatedAt: number }>();

  for (const template of templates) {
    const bundleId = template.bundleId ?? template.id;
    const current = map.get(bundleId);
    if (current) {
      current.variants[template.platform] = template;
      current.updatedAt = Math.max(current.updatedAt, template.updatedAt);
      continue;
    }
    map.set(bundleId, {
      id: bundleId,
      variants: { [template.platform]: template },
      updatedAt: template.updatedAt,
    });
  }

  return Array.from(map.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}

function spongebobPreviewAssets(template: ThemeTemplate) {
  if (template.id !== "spongebob") return {};
  return {
    mainBackground: "/template-assets/spongebob/android/theme_background_image.png",
    chatBackground: "/template-assets/spongebob/android/theme_chatroom_background_image.png",
    myBubble: "/template-assets/spongebob/android/theme_chatroom_bubble_me_01_image.9.png",
    friendBubble: "/template-assets/spongebob/android/theme_chatroom_bubble_you_01_image.9.png",
    profileImage: "/template-assets/spongebob/android/theme_profile_01_image.png",
  };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-[var(--color-surface-low)] px-4 py-3">
      <span className="block text-xs font-black uppercase text-[var(--color-on-surface-variant)]">{label}</span>
      <strong className="mt-1 block text-sm text-[var(--color-on-surface)]">{value}</strong>
    </div>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
