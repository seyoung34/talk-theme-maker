"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Hash, SendHorizontal, Plus, Search, Settings, UserRound } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import UserTemplateCard from "@/components/template/UserTemplateCard";
import { getResolvedAssetUrl, getResolvedColor, getSelectedUpload } from "@/lib/theme/project/state";
import { createSystemTemplatePreviewUrls, createSystemTemplatePreviewVisual, type SignedUrlCache, type TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";
import { systemTemplateRepository, type SystemTemplateSummary } from "@/lib/theme/systemTemplates";
import { getThemeSlots, templateStartStorageKey, themeTemplates, type ThemeAssetSlot, type ThemeTemplate } from "@/lib/theme/templates";
import { deleteUserTemplate, getUserTemplate, listUserTemplates, type UserTemplateRecord, type UserTemplateSummary } from "@/lib/theme/userTemplates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

type GalleryTemplateItem =
  | {
    id: string;
    kind: "base";
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
  checkpoints: string[];
  onStart: (platform: ThemePlatform) => void;
};

export default function TemplateGalleryClient() {
  const router = useRouter();
  const [selectedGalleryTemplateId, setSelectedGalleryTemplateId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplateSummary[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplateSummary[]>([]);
  const [systemUploadPreviewUrls, setSystemUploadPreviewUrls] = useState<SignedUrlCache>({});
  const [isSystemTemplatesLoading, setIsSystemTemplatesLoading] = useState(true);
  const [isLoadingMoreTemplates, setIsLoadingMoreTemplates] = useState(false);
  const [systemTemplateCursor, setSystemTemplateCursor] = useState<string>();
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUserTemplateRecord, setSelectedUserTemplateRecord] = useState<UserTemplateRecord | null>(null);
  const [userTemplatePreviewUrls, setUserTemplatePreviewUrls] = useState<Record<string, string>>({});
  const [userTemplateCardPreviewUrls, setUserTemplateCardPreviewUrls] = useState<Record<string, Record<string, string>>>({});
  const [userTemplateCardVisuals, setUserTemplateCardVisuals] = useState<Record<string, TemplatePreviewVisual>>({});
  const [isUserTemplatePreviewLoading, setIsUserTemplatePreviewLoading] = useState(false);
  const userTemplateCardPreviewUrlsRef = useRef<Record<string, Record<string, string>>>({});
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
  const userPreviewModel = selectedUserTemplateRecord ? createUserTemplatePreviewModel(selectedUserTemplateRecord, userTemplatePreviewUrls, startUserTemplate) : null;
  const previewModel = selectedGalleryTemplate ? createGalleryTemplatePreviewModel(selectedGalleryTemplate, selectedGalleryTemplate.onStart) : userPreviewModel;
  const basicGalleryTemplateId = "base:basic";
  const hasSavedTemplates = userTemplates.length > 0;

  useEffect(() => {
    if (selectedGalleryTemplate?.kind !== "system") return;
    let active = true;
    createSystemTemplatePreviewUrls([selectedGalleryTemplate.previewTemplate], systemUploadPreviewUrls, { includeDetails: true })
      .then((urls) => { if (active) setSystemUploadPreviewUrls(urls); })
      .catch((error) => console.error(error));
    return () => { active = false; };
  }, [selectedGalleryTemplateId]);

  useEffect(() => {
    return () => {
      Object.values(userTemplatePreviewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [userTemplatePreviewUrls]);

  useEffect(() => {
    return () => {
      revokeNestedObjectUrls(userTemplateCardPreviewUrlsRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadUserTemplateSummaries = async () => {
      try {
        const templates = await listUserTemplates();
        if (!active) return;
        setUserTemplates(templates);
        const records = (await Promise.all(templates.map((template) => getUserTemplate(template.id)))).filter((record): record is UserTemplateRecord => Boolean(record));
        if (!active) return;
        const nextUrls: Record<string, Record<string, string>> = {};
        const nextVisuals: Record<string, TemplatePreviewVisual> = {};
        for (const record of records) {
          const baseTemplate = themeTemplates.find((template) => template.id === record.templateId) ?? themeTemplates[0];
          const urls = createUserTemplatePreviewUrls(record);
          nextUrls[record.id] = urls;
          nextVisuals[record.id] = createUserTemplatePreviewVisual(record, baseTemplate, urls);
        }
        setUserTemplateCardPreviewUrls((current) => {
          revokeNestedObjectUrls(current);
          userTemplateCardPreviewUrlsRef.current = nextUrls;
          return nextUrls;
        });
        setUserTemplateCardVisuals(nextVisuals);
      } catch (error) {
        console.error(error);
        if (active) {
          setUserTemplates([]);
          setUserTemplateCardPreviewUrls((current) => {
            revokeNestedObjectUrls(current);
            userTemplateCardPreviewUrlsRef.current = {};
            return {};
          });
          setUserTemplateCardVisuals({});
          setNotice("내 템플릿 목록을 불러오지 못했습니다.");
        }
      }
    };

    void loadUserTemplateSummaries();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    systemTemplateRepository
      .listPage({ limit: 12, publicOnly: true })
      .then(async (page) => {
        const previewUrls = await createSystemTemplatePreviewUrls(page.items, systemUploadPreviewUrls);
        if (active) {
          setSystemTemplates(page.items);
          setSystemTemplateCursor(page.nextCursor);
          setSystemUploadPreviewUrls(previewUrls);
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setSystemTemplates([]);
          setNotice("공개 템플릿을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (active) setIsSystemTemplatesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadMoreSystemTemplates = async () => {
    if (!systemTemplateCursor || isLoadingMoreTemplates) return;
    try {
      setIsLoadingMoreTemplates(true);
      const page = await systemTemplateRepository.listPage({ cursor: systemTemplateCursor, limit: 12, publicOnly: true });
      const previewUrls = await createSystemTemplatePreviewUrls(page.items, systemUploadPreviewUrls);
      setSystemTemplates((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setSystemTemplateCursor(page.nextCursor);
      setSystemUploadPreviewUrls(previewUrls);
    } catch (error) {
      console.error(error);
      setNotice("템플릿을 더 불러오지 못했습니다.");
    } finally {
      setIsLoadingMoreTemplates(false);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const start = (template: ThemeTemplate, platform: ThemePlatform) => {
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ templateId: template.id, platform }));
    router.push("/edit");
  };

  function startUserTemplate(template: UserTemplateSummary) {
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ templateId: template.templateId, platform: template.platform, userTemplateId: template.id }));
    router.push("/edit");
  }

  const openUserTemplatePreview = async (template: UserTemplateSummary) => {
    try {
      setIsUserTemplatePreviewLoading(true);
      const record = await getUserTemplate(template.id);
      if (!record) {
        setNotice("내 템플릿을 찾지 못했습니다.");
        return;
      }
      setSelectedGalleryTemplateId(null);
      setSelectedUserTemplateRecord(record);
      setUserTemplatePreviewUrls(createUserTemplatePreviewUrls(record));
    } catch (error) {
      console.error(error);
      setNotice("내 템플릿 미리보기를 불러오지 못했습니다.");
    } finally {
      setIsUserTemplatePreviewLoading(false);
    }
  };

  const closePreview = () => {
    setSelectedGalleryTemplateId(null);
    setSelectedUserTemplateRecord(null);
    setUserTemplatePreviewUrls({});
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
      setUserTemplateCardPreviewUrls((current) => {
        const next = { ...current };
        revokeObjectUrls(next[template.id]);
        delete next[template.id];
        userTemplateCardPreviewUrlsRef.current = next;
        return next;
      });
      setUserTemplateCardVisuals((current) => {
        const next = { ...current };
        delete next[template.id];
        return next;
      });
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
        <section className="grid gap-3 border-b border-[var(--color-outline-variant)] pb-7 md:pb-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Theme maker</p>
          <h1 className="max-w-3xl font-[var(--font-display)] text-3xl font-semibold leading-tight tracking-[-0.025em] text-[var(--color-on-surface)] md:text-4xl">
            원하는 템플릿을 골라 나만의 테마로 만들어 보세요
          </h1>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)] md:text-base">
            템플릿을 선택하고 Android 또는 iOS로 시작하면 이미지와 색상을 바로 편집할 수 있습니다.
          </p>
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
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">
                이 브라우저에만 저장된 작업입니다. 직접 올린 개인 이미지는 서버에 업로드되지 않습니다.
              </p>
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
                  visual={userTemplateCardVisuals[template.id]}
                  formattedDate={formatDate(template.updatedAt)}
                  onDelete={handleDeleteUserTemplate}
                  onContinue={startUserTemplate}
                  onPreview={(template) => void openUserTemplatePreview(template)}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 rounded-[24px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <strong className="block text-lg font-black text-[var(--color-on-surface)]">저장된 템플릿이 아직 없습니다.</strong>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-on-surface-variant)]">
                  기본 템플릿으로 시작해 편집 상태를 저장하면, 다음부터는 이 브라우저에서 바로 이어서 작업할 수 있습니다.
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
            {galleryTemplates.map((template) => (
              <GalleryTemplateCard key={template.id} template={template} onPreview={setSelectedGalleryTemplateId} />
            ))}
            {isSystemTemplatesLoading ? <TemplateGallerySkeletonCards count={5} /> : null}
          </div>
          {systemTemplateCursor ? (
            <button type="button" className="mx-auto min-h-11 rounded-full border border-[var(--color-outline-variant)] bg-white px-5 text-sm font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-low)] disabled:opacity-50" onClick={() => void loadMoreSystemTemplates()} disabled={isLoadingMoreTemplates}>
              {isLoadingMoreTemplates ? "불러오는 중" : "템플릿 더 보기"}
            </button>
          ) : null}
        </section>
      </div>

      {previewModel ? (
        <TemplatePreviewModal
          preview={previewModel}
          onClose={closePreview}
        />
      ) : null}
      {isUserTemplatePreviewLoading ? <TemplatePreviewLoadingOverlay /> : null}
    </main>
  );
}

function createGalleryTemplates(systemTemplates: SystemTemplateSummary[], uploadPreviewUrls: SignedUrlCache): GalleryTemplateItem[] {
  const basicTemplate = themeTemplates.find((template) => template.id === "basic") ?? themeTemplates[0];

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
        }),
      };
    }),
  ];
}

function createUserTemplatePreviewUrls(record: UserTemplateRecord) {
  const urls: Record<string, string> = {};
  for (const entries of Object.values(record.uploads)) {
    for (const entry of entries ?? []) {
      urls[entry.id] = URL.createObjectURL(entry.file);
    }
  }
  return urls;
}

function revokeObjectUrls(urls: Record<string, string> | undefined) {
  Object.values(urls ?? {}).forEach((url) => URL.revokeObjectURL(url));
}

function revokeNestedObjectUrls(urls: Record<string, Record<string, string>>) {
  Object.values(urls).forEach(revokeObjectUrls);
}

function createUserTemplatePreviewModel(record: UserTemplateRecord, uploadPreviewUrls: Record<string, string>, onStart: (template: UserTemplateSummary) => void): TemplatePreviewModel {
  const baseTemplate = themeTemplates.find((template) => template.id === record.templateId) ?? themeTemplates[0];
  const visual = createUserTemplatePreviewVisual(record, baseTemplate, uploadPreviewUrls);
  const platformLabel = record.platform === "android" ? "Android" : "iOS";
  const summary: UserTemplateSummary = {
    id: record.id,
    name: record.name,
    templateId: record.templateId,
    platform: record.platform,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    uploadCount: Object.values(record.uploads).reduce((count, entries) => count + (entries?.length ?? 0), 0),
    colorCount: Object.values(record.colors).filter(Boolean).length,
  };

  return {
    title: record.name,
    description: "저장한 색상과 업로드 이미지를 실제 편집에 들어가기 전에 확인합니다. 개인 이미지는 이 브라우저에만 남습니다.",
    eyebrow: "내 템플릿 미리보기",
    closeLabel: "닫기",
    androidLabel: record.platform === "android" ? "Android 편집 계속하기" : "Android 사용 불가",
    iosLabel: record.platform === "ios" ? "iOS 편집 계속하기" : "iOS 사용 불가",
    baseTemplate,
    visual,
    availablePlatforms: [record.platform],
    rows: [
      { label: "플랫폼", value: platformLabel },
      { label: "이미지", value: `${summary.uploadCount}개` },
      { label: "색상", value: `${summary.colorCount}개` },
      { label: "최근 수정", value: formatDate(record.updatedAt) },
    ],
    checkpoints: [
      "저장한 이미지와 색상이 카드·채팅 미리보기에 반영됐는지 확인하세요.",
      "개인 사진은 서버가 아니라 현재 브라우저 IndexedDB에만 저장됩니다.",
      "이어 편집하면 이전 슬롯 선택, 색상, 말풍선 조정값을 유지합니다.",
    ],
    onStart: () => onStart(summary),
  };
}

function createUserTemplatePreviewVisual(record: UserTemplateRecord, template: ThemeTemplate, uploadPreviewUrls: Record<string, string>): TemplatePreviewVisual {
  const slots = getThemeSlots(record.platform);
  const templateId = template.id;

  return {
    chatBackgroundColor: resolveUserTemplateColor(slots, "chat_background_color", record, template, template.defaults.chatBackground),
    mainBackgroundColor: resolveUserTemplateColor(slots, "main_background_color", record, template, template.defaults.mainBackground),
    tabBackgroundColor: resolveUserTemplateColor(slots, "tab_background", record, template, template.defaults.tabBackground),
    myBubbleColor: resolveUserTemplateColor(slots, "chat_bubble_me_color", record, template, template.defaults.myBubble),
    friendBubbleColor: resolveUserTemplateColor(slots, "chat_bubble_you_color", record, template, template.defaults.friendBubble),
    chatBackgroundImage: resolveUserTemplateImage(slots, "chat_background", record, templateId, template, uploadPreviewUrls),
    mainBackgroundImage: resolveUserTemplateImage(slots, "main_background", record, templateId, template, uploadPreviewUrls),
    tabBackgroundImage: resolveUserTemplateImage(slots, "tab_background_image", record, templateId, template, uploadPreviewUrls),
    myBubbleImage: resolveUserTemplateImage(slots, "bubble_me_1", record, templateId, template, uploadPreviewUrls),
    friendBubbleImage: resolveUserTemplateImage(slots, "bubble_you_1", record, templateId, template, uploadPreviewUrls),
    profileImage: resolveUserTemplateImage(slots, "profile_image_1", record, templateId, template, uploadPreviewUrls),
  };
}

function resolveUserTemplateColor(slots: ThemeAssetSlot[], role: ThemeResourceRole, record: UserTemplateRecord, template: ThemeTemplate, fallback: string) {
  const slot = findSlotByRole(slots, role);
  return getResolvedColor(slot, record.colors, record.candidateSelections, template.id, template) ?? fallback;
}

function resolveUserTemplateImage(slots: ThemeAssetSlot[], role: ThemeResourceRole, record: UserTemplateRecord, templateId: ThemeTemplate["id"], template: ThemeTemplate, uploadPreviewUrls: Record<string, string>) {
  const slot = findSlotByRole(slots, role);
  const selectedUpload = getSelectedUpload(slot, record.uploads, record.candidateSelections);
  if (selectedUpload) return uploadPreviewUrls[selectedUpload.id];
  return getResolvedAssetUrl(slot, record.uploads, record.candidateSelections, templateId, template);
}

function findSlotByRole(slots: ThemeAssetSlot[], role: ThemeResourceRole) {
  return slots.find((slot) => slot.role === role);
}

function createGalleryTemplatePreviewModel(template: GalleryTemplateItem, onStart: (platform: ThemePlatform) => void): TemplatePreviewModel {
  if (template.kind === "system") {
    return {
      title: template.title,
      description: template.description ?? "운영자가 준비한 예시 테마입니다. 플랫폼을 고른 뒤 필요한 이미지와 색상만 바꿔 시작할 수 있습니다.",
      eyebrow: "공개 템플릿 미리보기",
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
      checkpoints: [
        "Android와 iOS 중 제공되는 플랫폼만 시작할 수 있습니다.",
        "템플릿 이미지는 시작 후 내 업로드 이미지로 교체할 수 있습니다.",
        "미리보기는 대표 화면 기준이며 세부 슬롯은 편집 화면에서 확인합니다.",
      ],
      onStart,
    };
  }

  return {
    title: template.title,
    description: template.baseTemplate.previewNote || "처음부터 직접 만드는 기본 템플릿입니다. 이미지를 올리지 않으면 기본 색상 중심으로 시작합니다.",
    eyebrow: "기본 템플릿 미리보기",
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
    checkpoints: [
      "불필요한 샘플 이미지 없이 색상과 직접 업로드 중심으로 시작합니다.",
      "Android/iOS 중 원하는 플랫폼을 선택해 같은 기본값에서 편집합니다.",
      "저장 전까지 업로드 이미지는 편집 세션 안에서만 유지됩니다.",
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
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${template.kind === "base" ? "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" : "bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]"}`}>
              {template.badge}
            </span>
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
  const actions = [
    canStartAndroid ? { platform: "android" as const, label: preview.androidLabel, className: "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" } : null,
    canStartIos ? { platform: "ios" as const, label: preview.iosLabel, className: "bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]" } : null,
  ].filter((action): action is { platform: ThemePlatform; label: string; className: string } => Boolean(action));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.55)] p-4" role="dialog" aria-modal="true" aria-label={`${preview.title} 미리보기`}>
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
            <div className="rounded-[18px] border border-[var(--color-outline-variant)] bg-white px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-on-surface-variant)]">확인할 것</p>
              <ul className="mt-2 grid gap-1.5 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
                {preview.checkpoints.map((item) => (
                  <li key={item} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2">
                    <span className="mt-1 size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={`grid gap-2 ${actions.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {actions.map((action) => (
                <button key={action.platform} className={`rounded-full px-4 py-3 text-sm font-black transition hover:scale-[0.98] ${action.className}`} type="button" onClick={() => preview.onStart(action.platform)}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TemplatePreviewLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.28)] p-4" role="status" aria-live="polite">
      <div className="rounded-[24px] border border-[var(--color-outline-variant)] bg-white px-5 py-4 text-sm font-black text-[var(--color-on-surface)] shadow-[0_22px_52px_rgba(42,103,103,0.18)]">
        내 템플릿 미리보기를 준비하는 중
      </div>
    </div>
  );
}
function TemplateMiniPreview({ visual }: { visual: TemplatePreviewVisual }) {
  if (visual.cardPreviewImage) {
    return <img src={visual.cardPreviewImage} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-[22px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] object-cover" />;
  }
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
        <div className="justify-self-center rounded-full bg-[#14343a]/18 px-5 py-1 text-xs font-bold text-white">오늘</div>
        <PreviewMessage visual={visual} mine={false} text="배경과 말풍선 대비를 확인합니다." />
        <PreviewMessage visual={visual} mine text="내 말풍선 색상도 함께 봅니다." />
        <PreviewMessage visual={visual} mine={false} text="프로필과 채팅 화면 분위기를 점검합니다." />
        <PreviewMessage visual={visual} mine text="문제가 없으면 편집을 시작하세요." />
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
  return {
    chatBackgroundColor: template.defaults.chatBackground,
    mainBackgroundColor: template.defaults.mainBackground,
    tabBackgroundColor: template.defaults.tabBackground,
    myBubbleColor: template.defaults.myBubble,
    friendBubbleColor: template.defaults.friendBubble,
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
