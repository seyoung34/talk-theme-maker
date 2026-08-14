"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, Eye, Gift, Hash, Info, Menu, SendHorizontal, Plus, Search, Settings, Smile, Trash2, UserPlus, UserRound, X } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import InAppBrowserNotice from "@/components/common/InAppBrowserNotice";
import BubbleCanvasPreview from "@/components/preview/BubbleCanvasPreview";
import TemplateCard from "@/components/template/TemplateCard";
import TemplateVisualPreview from "@/components/template/TemplateVisualPreview";
import { bakeUserTemplateCardThumbnail } from "@/components/template/userTemplateCardThumbnail";
import { getResolvedAssetUrl, getResolvedColor, getSelectedCandidate, getSelectedUpload } from "@/lib/theme/project/state";
import { resolvePlatformPreviewColor } from "@/lib/theme/project/platformColor";
import { buildTabIconUrls, createSystemTemplatePreviewUrls, createSystemTemplatePreviewVisual, getCorePreviewImageUrls, type SignedUrlCache, type TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";
import { systemTemplateRepository, type SystemTemplateSummary } from "@/lib/theme/systemTemplates";
import { isDefaultSystemTemplate } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, templateStartStorageKey, themeTemplates, type ThemeAssetSlot, type ThemeTemplate } from "@/lib/theme/templates";
import { describeAutosaveDraft, readAutosaveDraft, type EditorAutosaveDraft } from "@/lib/theme/project/autosaveDraft";
import { deleteUserTemplate, getUserTemplate, listUserTemplateRecords, toUserTemplateSummary, type UserTemplateRecord, type UserTemplateSummary } from "@/lib/theme/userTemplates";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";
import type { ThemeStartPayload } from "@/lib/theme/templates";

type GalleryTemplateItem =
  | {
    id: string;
    kind: "base";
    title: string;
    description?: string;
    baseTemplate: ThemeTemplate;
    visual: TemplatePreviewVisual;
  }
  | {
    id: string;
    kind: "system";
    title: string;
    description?: string;
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
  visual: TemplatePreviewVisual;
  availablePlatforms?: ThemePlatform[];
  note?: string;
  onStart: (platform: ThemePlatform) => void;
  onDelete?: () => void;
  deleteLabel?: string;
};

type PendingTemplateStart = {
  payload: ThemeStartPayload;
  analytics: { templateKey: string; templateSource: "base" | "system" | "user"; platform: ThemePlatform };
};

export default function TemplateGalleryClient() {
  const router = useRouter();
  const [selectedGalleryTemplateId, setSelectedGalleryTemplateId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplateSummary[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplateSummary[]>([]);
  const [systemUploadPreviewUrls, setSystemUploadPreviewUrls] = useState<SignedUrlCache>({});
  // 상세 에셋을 다 받아 둔 템플릿의 id. 이 값이 열려 있는 템플릿과 같을 때만 실제 프리뷰를 그린다.
  const [detailPreviewReadyId, setDetailPreviewReadyId] = useState<string | null>(null);
  const [isSystemTemplatesLoading, setIsSystemTemplatesLoading] = useState(true);
  const [isLoadingMoreTemplates, setIsLoadingMoreTemplates] = useState(false);
  const [systemTemplateCursor, setSystemTemplateCursor] = useState<string>();
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUserTemplateRecord, setSelectedUserTemplateRecord] = useState<UserTemplateRecord | null>(null);
  const [userTemplatePreviewUrls, setUserTemplatePreviewUrls] = useState<Record<string, string>>({});
  const [userTemplateCardPreviewUrls, setUserTemplateCardPreviewUrls] = useState<Record<string, Record<string, string>>>({});
  const [userTemplateCardVisuals, setUserTemplateCardVisuals] = useState<Record<string, TemplatePreviewVisual>>({});
  const [isUserTemplatePreviewLoading, setIsUserTemplatePreviewLoading] = useState(false);
  const [isUserTemplateInfoOpen, setIsUserTemplateInfoOpen] = useState(false);
  const [recentWork, setRecentWork] = useState<EditorAutosaveDraft | null>(null);
  const [isRecentWorkResolved, setIsRecentWorkResolved] = useState(false);
  const [recentWorkVisual, setRecentWorkVisual] = useState<TemplatePreviewVisual | null>(null);
  const [pendingTemplateStart, setPendingTemplateStart] = useState<PendingTemplateStart | null>(null);
  const userTemplateCardPreviewUrlsRef = useRef<Record<string, Record<string, string>>>({});
  // 내 템플릿/최근 작업 카드에 갤러리 카드와 같은 완성도의 합성 썸네일을 붙이기 위해 구운 blob URL.
  // id는 userTemplateCardVisuals와 같은 키(템플릿 id 또는 "최근 작업"의 record.id)를 쓴다.
  const userTemplateCardThumbnailUrlsRef = useRef<Record<string, string>>({});
  const viewedTemplateRef = useRef<string | null>(null);
  const galleryTemplates = createGalleryTemplates(systemTemplates, systemUploadPreviewUrls, !isSystemTemplatesLoading).map((item) => ({
    ...item,
    onStart: (platform: ThemePlatform) => {
      if (item.kind === "system") {
        const variant = item.variants[platform];
        if (variant) startSystemTemplateWithPlatform(variant, platform);
      } else {
        start(item.baseTemplate, platform);
      }
    },
  }));
  const selectedGalleryTemplate = galleryTemplates.find((template) => template.id === selectedGalleryTemplateId) ?? null;
  const userPreviewModel = selectedUserTemplateRecord ? createUserTemplatePreviewModel(selectedUserTemplateRecord, userTemplatePreviewUrls, startUserTemplate, handleDeleteUserTemplate) : null;
  const previewModel = selectedGalleryTemplate ? createGalleryTemplatePreviewModel(selectedGalleryTemplate, selectedGalleryTemplate.onStart) : userPreviewModel;
  const hasPersonalItems = Boolean(recentWork) || userTemplates.length > 0;

  // 카드 목록은 cardPreviewPath만 받아 두므로, 모달을 열면 채팅 배경·말풍선 같은 상세 에셋의
  // 서명 URL을 그때 발급한다. 그 사이 프리뷰를 그리면 URL이 없는 슬롯이 base 템플릿 기본
  // 에셋으로 떨어져 어피치가 잠깐 스친다. URL을 받고 핵심 이미지를 브라우저에 올린 뒤에야
  // 준비됨으로 표시하고, 그전에는 스켈레톤을 보여 준다.
  useEffect(() => {
    const selected = selectedGalleryTemplate;
    if (selected?.kind !== "system") return;
    let active = true;
    setDetailPreviewReadyId(null);

    void (async () => {
      try {
        const urls = await createSystemTemplatePreviewUrls([selected.previewTemplate], systemUploadPreviewUrls, { includeDetails: true });
        if (!active) return;
        setSystemUploadPreviewUrls(urls);
        const visual = createSystemTemplatePreviewVisual({
          template: selected.baseTemplate,
          platform: selected.previewTemplate.platform,
          summary: selected.previewTemplate,
          signedUrls: urls,
        });
        await preloadPreviewImages(getCorePreviewImageUrls(visual));
      } catch (error) {
        // 이미지를 못 받아도 프리뷰 자체는 열려야 한다. 색상과 받은 것만으로 그린다.
        console.error(error);
      } finally {
        if (active) setDetailPreviewReadyId(selected.id);
      }
    })();

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
    return () => {
      revokeObjectUrls(userTemplateCardThumbnailUrlsRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let previewUrls: Record<string, string> = {};
    void readAutosaveDraft("user")
      .then((record) => {
        if (!active || !record) return;
        const previewRecord = autosaveToUserTemplateRecord(record);
        previewUrls = createUserTemplatePreviewUrls(previewRecord);
        const baseTemplate = themeTemplates.find((template) => template.id === previewRecord.templateId) ?? themeTemplates[0];
        setRecentWork(record);
        setRecentWorkVisual(createUserTemplatePreviewVisual(previewRecord, baseTemplate, previewUrls));
        // CSS 목업을 먼저 보여 준 뒤, 갤러리 카드와 같은 합성 썸네일을 구워지는 대로 얹는다.
        void bakeUserTemplateCardThumbnail(previewRecord).then((objectUrl) => {
          if (!active || !objectUrl) return;
          userTemplateCardThumbnailUrlsRef.current[previewRecord.id] = objectUrl;
          setRecentWorkVisual((current) => (current ? { ...current, cardPreviewImage: objectUrl } : current));
        });
      })
      .catch((error) => {
        console.error(error);
        if (active) setNotice("최근 작업을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setIsRecentWorkResolved(true);
      });
    return () => {
      active = false;
      revokeObjectUrls(previewUrls);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadUserTemplateSummaries = async () => {
      try {
        // 목록 요약과 카드 렌더가 같은 레코드를 쓴다. 한 번만 읽고 요약을 파생시킨다.
        const records = await listUserTemplateRecords();
        if (!active) return;
        setUserTemplates(records.map(toUserTemplateSummary));
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
        revokeObjectUrls(userTemplateCardThumbnailUrlsRef.current);
        userTemplateCardThumbnailUrlsRef.current = {};
        // CSS 목업을 먼저 보여 준 뒤, 갤러리 카드와 같은 합성 썸네일을 구워지는 대로 하나씩 얹는다.
        void Promise.all(
          records.map(async (record) => {
            const objectUrl = await bakeUserTemplateCardThumbnail(record);
            if (!active || !objectUrl) return;
            userTemplateCardThumbnailUrlsRef.current[record.id] = objectUrl;
            setUserTemplateCardVisuals((current) => (current[record.id] ? { ...current, [record.id]: { ...current[record.id], cardPreviewImage: objectUrl } } : current));
          }),
        );
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

  const launchTemplateStart = (startRequest: PendingTemplateStart, autosaveAction?: ThemeStartPayload["autosaveAction"]) => {
    const { analytics, payload } = startRequest;
    trackAnalyticsEvent("template_started", {
      template_key: analytics.templateKey,
      template_source: analytics.templateSource,
      platform: analytics.platform,
    });
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ ...payload, ...(autosaveAction ? { autosaveAction } : {}) }));
    router.push("/edit");
  };

  const requestTemplateStart = (startRequest: PendingTemplateStart) => {
    if (recentWork) {
      setPendingTemplateStart(startRequest);
      return;
    }
    launchTemplateStart(startRequest);
  };

  const start = (template: ThemeTemplate, platform: ThemePlatform) => {
    requestTemplateStart({
      payload: { templateId: template.id, platform },
      analytics: { templateKey: template.id, templateSource: "base", platform },
    });
  };

  function startUserTemplate(template: UserTemplateSummary) {
    requestTemplateStart({
      payload: { templateId: template.templateId, platform: template.platform, userTemplateId: template.id },
      analytics: { templateKey: "user_template", templateSource: "user", platform: template.platform },
    });
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
    requestTemplateStart({
      payload: { templateId: template.baseTemplateId, platform, systemTemplateId: template.id, systemTemplateBundleId: template.bundleId ?? template.id, editMode: "user" },
      analytics: { templateKey: `system:${template.bundleId ?? template.id}`, templateSource: "system", platform },
    });
  };

  const continueRecentWork = () => {
    if (!recentWork) return;
    launchTemplateStart({
      payload: {
        templateId: recentWork.source.templateId,
        platform: recentWork.source.platform,
        userTemplateId: recentWork.source.activeUserTemplate?.id,
        systemTemplateId: recentWork.source.activeSystemTemplate?.id,
        systemTemplateBundleId: recentWork.source.systemTemplateBundleId ?? recentWork.source.activeSystemTemplate?.bundleId,
        editMode: "user",
      },
      analytics: { templateKey: "recent_work", templateSource: "user", platform: recentWork.source.platform },
    }, "resume");
  };

  const startSelectedTemplate = () => {
    if (!pendingTemplateStart) return;
    launchTemplateStart(pendingTemplateStart, "replace");
  };

  const cancelTemplateStart = () => {
    setPendingTemplateStart(null);
    closePreview();
  };

  useEffect(() => {
    if (selectedGalleryTemplate) {
      const platform = selectedGalleryTemplate.kind === "system" ? selectedGalleryTemplate.previewTemplate.platform : undefined;
      const key = `${selectedGalleryTemplate.kind}:${selectedGalleryTemplate.id}:${platform ?? "not_selected"}`;
      if (viewedTemplateRef.current === key) return;
      viewedTemplateRef.current = key;
      const templateKey = selectedGalleryTemplate.kind === "system" ? `system:${selectedGalleryTemplate.bundleId}` : selectedGalleryTemplate.baseTemplate.id;
      trackAnalyticsEvent("template_viewed", { template_key: templateKey, template_source: selectedGalleryTemplate.kind, ...(platform ? { platform } : {}) });
    } else {
      viewedTemplateRef.current = null;
    }
  }, [selectedGalleryTemplate]);

  useEffect(() => {
    if (selectedUserTemplateRecord) {
      const key = `user:${selectedUserTemplateRecord.id}:${selectedUserTemplateRecord.platform}`;
      if (viewedTemplateRef.current === key) return;
      viewedTemplateRef.current = key;
      trackAnalyticsEvent("template_viewed", { template_key: "user_template", template_source: "user", platform: selectedUserTemplateRecord.platform });
    }
  }, [selectedUserTemplateRecord]);

  async function handleDeleteUserTemplate(template: UserTemplateSummary) {
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
      const thumbnailUrl = userTemplateCardThumbnailUrlsRef.current[template.id];
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
        delete userTemplateCardThumbnailUrlsRef.current[template.id];
      }
      closePreview();
      setNotice("내 템플릿을 삭제했습니다.");
    } catch (error) {
      console.error(error);
      setNotice("템플릿을 삭제하지 못했습니다.");
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_18%,#ffffff_44%,#f7fbff_72%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      {/* 랜딩과 동일한 결의 단일 배경 레이어 */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute left-[-9rem] top-[4%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.38),transparent_68%)] blur-3xl" />
        <div className="absolute right-[-9rem] top-[10%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(254,229,0,0.14),transparent_70%)] blur-3xl" />
        <div className="absolute left-[-8rem] bottom-[6%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.28),transparent_70%)] blur-3xl" />
      </div>
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

        <InAppBrowserNotice ready={isRecentWorkResolved} hasRecentWork={Boolean(recentWork)} />


        {notice ? (
          <div className="rounded-[18px] border border-[var(--color-outline-variant)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-on-surface-variant)] shadow-[0_12px_28px_rgba(42,103,103,0.06)]">
            {notice}
          </div>
        ) : null}

        <section className={`grid rounded-[32px] border border-[var(--color-outline-variant)] ${hasPersonalItems ? "gap-5 bg-white/92 p-5 shadow-[0_18px_48px_rgba(42,103,103,0.08)] md:p-6" : "gap-3 bg-white/70 p-4 md:p-5"}`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mt-2 flex items-center gap-1.5">
                <h2 className="font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">내 템플릿</h2>
                <button
                  type="button"
                  aria-label="내 템플릿 안내"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-outline-variant)] bg-white text-[var(--color-on-surface-variant)] sm:hidden"
                  onClick={() => setIsUserTemplateInfoOpen(true)}
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 hidden max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)] sm:block">
                편집 상태와 직접 올린 이미지는 이 브라우저에 저장됩니다. 내보내기를 시작하면 파일 생성에 필요한 데이터가 서버로 일시 전송됩니다.
              </p>
            </div>
            {hasPersonalItems ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-low)] px-3 py-2 text-xs font-bold text-[var(--color-on-surface-variant)]">
                <Clock3 className="w-4 h-4" />
                최근 수정순
              </div>
            ) : null}
          </div>

          {hasPersonalItems ? (
            <div className="grid grid-flow-col auto-cols-[calc(50%-0.25rem)] snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:auto-cols-[300px] sm:gap-3">
              {recentWork ? (
                <TemplateCard
                  title="최근 작업"
                  onOpen={continueRecentWork}
                  openLabel="최근 작업 계속하기"
                  className="snap-start border-[#93c5fd] bg-[#eff6ff]"
                  mobileVisual={recentWorkVisual ? <TemplateVisualPreview visual={recentWorkVisual} size="thumb" /> : <div className="aspect-[16/15] rounded-[12px] bg-[#dbeafe]" />}
                  desktopVisual={recentWorkVisual ? <TemplateVisualPreview visual={recentWorkVisual} size="card" /> : <div className="aspect-[16/15] rounded-[20px] bg-[#dbeafe]" />}
                  desktopContent={<RecentWorkDesktopContent record={recentWork} />}
                  desktopFooter={
                    <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-[#2563eb] px-4 py-2.5 text-sm font-black text-white">
                      계속 편집
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  }
                />
              ) : null}
              {userTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  title={template.name}
                  onOpen={() => void openUserTemplatePreview(template)}
                  openLabel={`${template.name} 템플릿 확인`}
                  className="snap-start"
                  mobileVisual={
                    userTemplateCardVisuals[template.id] ? (
                      <TemplateVisualPreview visual={userTemplateCardVisuals[template.id]} size="thumb" />
                    ) : (
                      <div className="aspect-[16/15] animate-pulse rounded-[12px] bg-[var(--color-surface-low)]" />
                    )
                  }
                  desktopVisual={<UserTemplateDesktopVisual template={template} visual={userTemplateCardVisuals[template.id]} />}
                  desktopContent={<UserTemplateDesktopContent template={template} />}
                  desktopFooter={
                    <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)]">
                      템플릿 확인
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold text-[var(--color-on-surface-variant)]">
              아직 저장된 템플릿이 없어요.
              <button
                type="button"
                className="inline-flex items-center gap-1 font-black text-[var(--color-on-surface)] underline-offset-4 hover:underline"
                onClick={() => setSelectedGalleryTemplateId((galleryTemplates.find(isDefaultGalleryItem) ?? galleryTemplates[0])?.id ?? null)}
              >
                템플릿 보기
                <ArrowRight className="size-4" />
              </button>
            </p>
          )}
        </section>

        {/* ===========템플릿 갤러리=========== */}
        <section className="grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">템플릿 갤러리</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3 xl:gap-4">
            {galleryTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                title={template.title}
                onOpen={() => setSelectedGalleryTemplateId(template.id)}
                openLabel={`${template.title} 열기`}
                mobileVisual={<TemplateVisualPreview visual={template.visual} size="thumb" />}
                desktopVisual={<TemplateVisualPreview visual={template.visual} size="card" />}
                desktopContent={<GalleryTemplateDesktopContent template={template} />}
                desktopFooter={<GalleryTemplateDesktopFooter template={template} />}
              />
            ))}
            {isSystemTemplatesLoading ? <TemplateGallerySkeletonCards count={5} /> : null}
          </div>
          {!isSystemTemplatesLoading && galleryTemplates.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--color-outline-variant)] bg-white/70 px-5 py-10 text-center">
              <p className="text-sm font-black text-[var(--color-on-surface)]">현재 공개된 시스템 템플릿이 없습니다.</p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">새 템플릿이 등록되면 이곳에 표시됩니다.</p>
            </div>
          ) : null}
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
          // 내 템플릿은 파일이 이미 손에 있어 기다릴 게 없다. 시스템 템플릿만 상세 에셋을 기다린다.
          isPreviewLoading={selectedGalleryTemplate?.kind === "system" && detailPreviewReadyId !== selectedGalleryTemplate.id}
          onClose={closePreview}
        />
      ) : null}
      {isUserTemplatePreviewLoading ? <TemplatePreviewLoadingOverlay /> : null}
      {isUserTemplateInfoOpen ? <UserTemplateInfoModal onClose={() => setIsUserTemplateInfoOpen(false)} /> : null}
      {pendingTemplateStart && recentWork ? (
        <RecentWorkConflictDialog
          record={recentWork}
          onContinueRecent={continueRecentWork}
          onStartSelected={startSelectedTemplate}
          onCancel={cancelTemplateStart}
        />
      ) : null}
    </main>
  );
}

function createGalleryTemplates(systemTemplates: SystemTemplateSummary[], uploadPreviewUrls: SignedUrlCache, isLoaded: boolean): GalleryTemplateItem[] {
  const basicTemplate = themeTemplates.find((template) => template.id === "basic") ?? themeTemplates[0];

  const systemItems: GalleryTemplateItem[] = groupSystemTemplateRecords(systemTemplates).map((bundle) => {
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
  });

  // 유저용 기본(default 태그) 템플릿을 목록 최상단으로 올린다. 정렬은 안정적이라
  // 나머지 항목은 기존 순서(최근 수정순)를 유지한다.
  systemItems.sort((a, b) => Number(isDefaultGalleryItem(b)) - Number(isDefaultGalleryItem(a)));

  // 코드 base 템플릿은 시스템 템플릿을 구성하는 내부 기준값일 뿐 갤러리 상품이 아니다.
  // 공개 시스템 템플릿이 없으면 빈 상태를 보여주며 base를 사용자용 카드로 대체 노출하지 않는다.
  return isLoaded ? systemItems : [];
}

function isDefaultGalleryItem(item: GalleryTemplateItem): boolean {
  return item.kind === "system" && isDefaultSystemTemplate(item.previewTemplate.tags);
}

/**
 * 이미지를 브라우저에 올려 둔다. 어떤 이유로든 실패하면 그냥 넘어간다.
 *
 * 한 장이 404나 만료로 실패했다고 모달 전체를 붙잡아 둘 이유는 없다. 그 슬롯만 비어 보이고
 * 나머지는 정상으로 뜨는 편이 낫다. decode()는 디코딩까지 끝내므로 첫 페인트가 밀리지 않는다.
 */
function preloadPreviewImages(urls: string[]) {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => {
            void image.decode().then(() => resolve(), () => resolve());
          };
          image.onerror = () => resolve();
          image.src = url;
        }),
    ),
  );
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

function autosaveToUserTemplateRecord(record: EditorAutosaveDraft): UserTemplateRecord {
  return {
    id: record.id,
    name: "최근 작업",
    templateId: record.source.templateId,
    platform: record.source.platform,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    colors: record.draft.colors,
    uploads: record.draft.uploads,
    candidateSelections: record.draft.candidateSelections,
    bubbleEdits: {
      geometry: record.draft.bubbleGeometry,
      markers: record.draft.bubbleMarkers,
      insets: record.draft.bubbleInsets,
      stretch: record.draft.bubbleStretch,
      flipX: record.draft.bubbleFlipX ?? {},
    },
    bubbleDesigns: record.draft.bubbleDesigns,
    bubbleDecorationSources: record.draft.bubbleDecorationSources,
  };
}

function createUserTemplatePreviewModel(record: UserTemplateRecord, uploadPreviewUrls: Record<string, string>, onStart: (template: UserTemplateSummary) => void, onDelete: (template: UserTemplateSummary) => void): TemplatePreviewModel {
  const baseTemplate = themeTemplates.find((template) => template.id === record.templateId) ?? themeTemplates[0];
  const visual = createUserTemplatePreviewVisual(record, baseTemplate, uploadPreviewUrls);
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
    description: "저장한 색상과 업로드 이미지를 실제 편집에 들어가기 전에 확인합니다. 편집 데이터는 현재 브라우저에 저장됩니다.",
    eyebrow: "내 템플릿 미리보기",
    closeLabel: "닫기",
    androidLabel: record.platform === "android" ? "Android 편집 계속하기" : "Android 사용 불가",
    iosLabel: record.platform === "ios" ? "iOS 편집 계속하기" : "iOS 사용 불가",
    visual,
    availablePlatforms: [record.platform],
    note: "내보내기를 시작하면 파일 생성에 필요한 이미지와 설정이 서버로 일시 전송됩니다.",
    onStart: () => onStart(summary),
    onDelete: () => onDelete(summary),
    deleteLabel: "삭제",
  };
}

function createUserTemplatePreviewVisual(record: UserTemplateRecord, template: ThemeTemplate, uploadPreviewUrls: Record<string, string>): TemplatePreviewVisual {
  const slots = getThemeSlots(record.platform);
  const templateId = template.id;

  return {
    platform: record.platform,
    chatBackgroundColor: resolveUserTemplateColor(slots, "chat_background_color", record, template, template.defaults.chatBackground),
    mainBackgroundColor: resolveUserTemplateColor(slots, "main_background_color", record, template, template.defaults.mainBackground),
    tabBackgroundColor: resolveUserTemplateColor(slots, "tab_background", record, template, template.defaults.tabBackground),
    myBubbleTextColor: resolveUserTemplateColor(slots, "chat_bubble_me_color", record, template, template.defaults.mainTitle),
    friendBubbleTextColor: resolveUserTemplateColor(slots, "chat_bubble_you_color", record, template, template.defaults.mainTitle),
    myBubbleFillColor: template.defaults.myBubble,
    friendBubbleFillColor: template.defaults.friendBubble,
    chatBackgroundImage: resolveUserTemplateImage(slots, "chat_background", record, templateId, template, uploadPreviewUrls),
    mainBackgroundImage: resolveUserTemplateImage(slots, "main_background", record, templateId, template, uploadPreviewUrls),
    tabBackgroundImage: resolveUserTemplateImage(slots, "tab_background_image", record, templateId, template, uploadPreviewUrls),
    myBubbleImage: resolveUserTemplateImage(slots, "bubble_me_1", record, templateId, template, uploadPreviewUrls),
    friendBubbleImage: resolveUserTemplateImage(slots, "bubble_you_1", record, templateId, template, uploadPreviewUrls),
    myBubbleGeometry: record.bubbleEdits.geometry[findSlotByRole(slots, "bubble_me_1")?.id ?? ""],
    myBubbleStretch: record.bubbleEdits.stretch[findSlotByRole(slots, "bubble_me_1")?.id ?? ""],
    myBubbleInsets: record.bubbleEdits.insets[findSlotByRole(slots, "bubble_me_1")?.id ?? ""],
    myBubbleMarkers: record.bubbleEdits.markers[findSlotByRole(slots, "bubble_me_1")?.id ?? ""],
    friendBubbleGeometry: record.bubbleEdits.geometry[findSlotByRole(slots, "bubble_you_1")?.id ?? ""],
    friendBubbleStretch: record.bubbleEdits.stretch[findSlotByRole(slots, "bubble_you_1")?.id ?? ""],
    friendBubbleInsets: record.bubbleEdits.insets[findSlotByRole(slots, "bubble_you_1")?.id ?? ""],
    friendBubbleMarkers: record.bubbleEdits.markers[findSlotByRole(slots, "bubble_you_1")?.id ?? ""],
    profileImage: resolveUserTemplateImage(slots, "profile_image_1", record, templateId, template, uploadPreviewUrls),
    mainHeaderColor: resolveUserTemplateColor(slots, "main_header_color", record, template, template.defaults.mainHeader),
    mainHeaderForegroundColor: resolveUserTemplateColor(slots, "main_header_foreground_color", record, template, template.defaults.mainTitle),
    bodyCellColor: resolveUserTemplateColor(slots, "main_body_cell_color", record, template, template.defaults.mainBackground),
    titleColor: resolveUserTemplateColor(slots, "main_title_color", record, template, template.defaults.mainTitle),
    descriptionColor: resolveUserTemplateColor(slots, "main_description_color", record, template, template.defaults.mainBody),
    sectionTitleColor: resolveUserTemplateColor(slots, "main_section_title_color", record, template, template.defaults.mainTitle),
    bodyCellBorderColor: resolveUserTemplateColor(slots, "main_body_cell_border_color", record, template, template.defaults.mainBody),
    unreadColor: resolveUserTemplateColor(slots, "chat_unread_count_color", record, template, template.accent),
    profileImage2: resolveUserTemplateImage(slots, "profile_image_2", record, templateId, template, uploadPreviewUrls),
    profileImage3: resolveUserTemplateImage(slots, "profile_image_3", record, templateId, template, uploadPreviewUrls),
    profileImageFull: resolveUserTemplateImage(slots, "profile_image_full_1", record, templateId, template, uploadPreviewUrls),
    tabIcons: buildTabIconUrls((role) => resolveUserTemplateImage(slots, role, record, templateId, template, uploadPreviewUrls)),
  };
}

function resolveUserTemplateColor(slots: ThemeAssetSlot[], role: ThemeResourceRole, record: UserTemplateRecord, template: ThemeTemplate, fallback: string) {
  const resolve = (readRole: ThemeResourceRole) => {
    const slot = findSlotByRole(slots, readRole);
    return getResolvedColor(slot, record.colors, record.candidateSelections, template.id, template, slots);
  };
  return resolvePlatformPreviewColor(resolve, role, fallback, record.platform);
}

function resolveUserTemplateImage(slots: ThemeAssetSlot[], role: ThemeResourceRole, record: UserTemplateRecord, templateId: ThemeTemplate["id"], template: ThemeTemplate, uploadPreviewUrls: Record<string, string>) {
  const slot = findSlotByRole(slots, role);
  const selectedUpload = getSelectedUpload(slot, record.uploads, record.candidateSelections, slots);
  if (selectedUpload) return uploadPreviewUrls[selectedUpload.id];
  return getSelectedCandidate(slot, record.candidateSelections, templateId, template)?.previewUrl ?? getResolvedAssetUrl(slot, record.uploads, record.candidateSelections, templateId, template, slots);
}

function findSlotByRole(slots: ThemeAssetSlot[], role: ThemeResourceRole) {
  return slots.find((slot) => slot.role === role);
}

//템플릿 프리뷰 정보들
function createGalleryTemplatePreviewModel(template: GalleryTemplateItem, onStart: (platform: ThemePlatform) => void): TemplatePreviewModel {
  if (template.kind === "system") {
    return {
      title: template.title,
      description: template.description ?? "플랫폼을 고른 뒤 필요한 이미지와 색상만 바꿔 시작할 수 있습니다.",
      eyebrow: "공개 템플릿 미리보기",
      closeLabel: "닫기",
      androidLabel: "Android로 시작",
      iosLabel: "iOS로 시작",
      visual: template.visual,
      availablePlatforms: Object.keys(template.variants) as ThemePlatform[],
      note: "템플릿 이미지는 시작 후 내 업로드 이미지로 자유롭게 교체할 수 있습니다.",
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
    visual: template.visual,
    availablePlatforms: ["android", "ios"],
    note: "불필요한 샘플 이미지 없이 색상과 직접 업로드 중심으로 시작합니다.",
    onStart,
  };
}

function getGalleryPlatforms(template: GalleryTemplateItem): ThemePlatform[] {
  return template.kind === "system" ? (Object.keys(template.variants) as ThemePlatform[]) : ["android", "ios"];
}

function GalleryTemplateDesktopContent({ template }: { template: GalleryTemplateItem }) {
  return (
    <div className="grid gap-1">
      <strong className="font-[var(--font-display)] text-[22px] font-semibold leading-tight text-[var(--color-on-surface)]">{template.title}</strong>
      {template.description ? <span className="line-clamp-1 text-xs leading-5 text-[var(--color-on-surface-variant)]">{template.description}</span> : null}
    </div>
  );
}

// 하단 행: 플랫폼 태그(좌) + 확인 버튼(우)을 한 줄에 배치
function GalleryTemplateDesktopFooter({ template }: { template: GalleryTemplateItem }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {getGalleryPlatforms(template).map((platform) => (
          <span key={platform} className="rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-[11px] font-black uppercase text-[var(--color-on-surface-variant)]">
            {platform === "android" ? "Android" : "iOS"}
          </span>
        ))}
      </div>
      <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)]">
        템플릿 확인
        <ArrowRight className="w-4 h-4" />
      </span>
    </div>
  );
}

function UserTemplateDesktopVisual({ template, visual }: { template: UserTemplateSummary; visual?: TemplatePreviewVisual }) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-3">
      {visual ? <TemplateVisualPreview visual={visual} size="card" /> : <UserMiniPreviewSkeleton />}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-surface-variant)] shadow-sm">
        <Eye className="size-3" aria-hidden="true" />
        {visual ? "저장본 미리보기" : "준비 중"}
      </span>
      <span className="absolute right-3 top-3 rounded-full bg-[var(--color-inverse-surface)] px-2.5 py-1 text-[11px] font-black text-[var(--color-inverse-on-surface)]">
        {template.platform === "android" ? "Android" : "iOS"}
      </span>
    </div>
  );
}

function UserTemplateDesktopContent({ template }: { template: UserTemplateSummary }) {
  return (
    <div className="min-w-0">
      <strong className="block truncate text-lg font-black text-[var(--color-on-surface)]">{template.name}</strong>
      <p className="mt-1 text-sm leading-6 text-[var(--color-on-surface-variant)]">최근 수정 {formatDate(template.updatedAt)}</p>
    </div>
  );
}

function RecentWorkDesktopContent({ record }: { record: EditorAutosaveDraft }) {
  const summary = describeAutosaveDraft(record);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <strong className="truncate text-lg font-black text-[var(--color-on-surface)]">최근 작업</strong>
        <span className="shrink-0 rounded-full bg-[#dbeafe] px-2.5 py-1 text-[11px] font-black text-[#1d4ed8]">자동 저장</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--color-on-surface-variant)]">{record.source.templateName}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--color-on-surface-variant)]">
        최근 수정 {formatDate(record.updatedAt)} · 이미지 {summary.uploadCount} · 색상 {summary.colorCount}
      </p>
    </div>
  );
}

function UserMiniPreviewSkeleton() {
  return (
    <div className="grid aspect-[16/15] grid-cols-[0.8fr_1fr] gap-2">
      <div className="grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[18px] bg-white shadow-[0_10px_24px_rgba(42,103,103,0.08)]">
        <div className="flex items-center justify-between h-8 px-3">
          <span className="w-12 h-3 rounded-full bg-black/12" />
          <span className="grid rounded-full size-4 place-items-center bg-black/10" />
        </div>
        <div className="grid content-start gap-2 px-3 py-2">
          <span className="h-7 animate-pulse rounded-full bg-[var(--color-primary-container)]/70" />
          <span className="w-3/4 h-4 rounded-full animate-pulse bg-black/10" />
          <span className="w-5/6 h-4 rounded-full animate-pulse bg-black/10" />
        </div>
        <div className="grid items-center grid-cols-5 px-2 h-7 bg-white/90">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} className={`mx-auto rounded-full ${index === 1 ? "size-4 bg-[var(--color-primary-container)]" : "size-3 bg-black/15"}`} />
          ))}
        </div>
      </div>
      <div className="grid content-between overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,var(--color-secondary-container),white)] p-2 shadow-[0_10px_24px_rgba(42,103,103,0.08)]">
        <span className="w-20 h-6 rounded-full bg-white/80" />
        <div className="grid gap-2">
          <span className="h-8 w-4/5 animate-pulse rounded-[14px] bg-white" />
          <span className="h-8 w-3/4 justify-self-end animate-pulse rounded-[14px] bg-[var(--color-primary-container)]" />
          <span className="h-8 w-5/6 animate-pulse rounded-[14px] bg-white" />
        </div>
      </div>
    </div>
  );
}

function TemplateGallerySkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="grid min-h-0 content-between gap-2 overflow-hidden rounded-[16px] border border-[var(--color-outline-variant)] bg-white/70 p-2 shadow-[0_16px_36px_rgba(42,103,103,0.04)] sm:min-h-[360px] sm:gap-4 sm:rounded-[28px] sm:p-4">
          <div className="grid gap-1.5 sm:hidden">
            <div className="aspect-[16/15] animate-pulse rounded-[12px] bg-[var(--color-surface-low)]" />
            <div className="flex items-center justify-between gap-2">
              <span className="h-4 w-2/3 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
              <span className="size-6 shrink-0 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
            </div>
          </div>
          <div className="hidden sm:grid sm:gap-4">
            <div className="aspect-[16/15] animate-pulse rounded-[22px] bg-[var(--color-surface-low)]" />
            <div className="grid gap-2">
              <span className="h-5 w-20 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
              <span className="h-8 w-4/5 animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
              <span className="h-4 w-full animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
              <span className="h-4 w-2/3 animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
            </div>
          </div>
          <span className="mt-4 hidden h-10 w-28 animate-pulse rounded-full bg-[var(--color-surface-low)] sm:block" />
        </div>
      ))}
    </>
  );
}

// 템플릿 미리보기
type PreviewScreenId = "friends" | "chats" | "chatroom" | "profile";

const previewScreens: Array<{ id: PreviewScreenId; label: string }> = [
  { id: "friends", label: "친구" },
  { id: "chats", label: "채팅목록" },
  { id: "chatroom", label: "채팅방" },
  { id: "profile", label: "프로필" },
];

/**
 * 화면을 넘기는 좌우 버튼.
 *
 * 배경도 테두리도 두지 않는다. 화살표 자체가 바탕색과 충분히 대비되므로 판을 깔지 않아도 읽히고,
 * 프리뷰 옆에서 시선을 덜 가져간다. hover는 배경 대신 글자색을 진하게 해서 알린다.
 *
 * 보이는 것은 아이콘뿐이지만 클릭 영역은 그대로 32px(sm 이상 36px)이다.
 */
const screenStepButtonClassName =
  "grid size-8 shrink-0 place-items-center rounded-full text-[var(--color-on-surface-variant)] transition hover:text-[var(--color-on-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-on-surface)] sm:size-9";

function TemplatePreviewModal({ preview, isPreviewLoading = false, onClose }: { preview: TemplatePreviewModel; isPreviewLoading?: boolean; onClose: () => void }) {
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const activeScreen = previewScreens[activeScreenIndex];
  const goToPrevScreen = () => setActiveScreenIndex((current) => (current - 1 + previewScreens.length) % previewScreens.length);
  const goToNextScreen = () => setActiveScreenIndex((current) => (current + 1) % previewScreens.length);
  const canStartAndroid = preview.availablePlatforms?.includes("android") ?? true;
  const canStartIos = preview.availablePlatforms?.includes("ios") ?? true;
  const actions = [
    canStartAndroid ? { platform: "android" as const, label: preview.androidLabel, className: "bg-[var(--color-inverse-surface)] text-[var(--color-inverse-on-surface)]" } : null,
    canStartIos ? { platform: "ios" as const, label: preview.iosLabel, className: "bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]" } : null,
  ].filter((action): action is { platform: ThemePlatform; label: string; className: string } => Boolean(action));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.55)] p-4" role="dialog" aria-modal="true" aria-label={`${preview.title} 미리보기`}>
      <section className="grid h-[min(92dvh,780px)] w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_64px_rgba(42,103,103,0.2)] sm:rounded-[32px]">
        <header className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold leading-tight text-[var(--color-on-surface)] sm:text-3xl">{preview.title}</h2>
            {/*
              좁은 화면에서는 설명을 접는다. 프리뷰 자체가 이미 무엇인지 보여 주는데 두 줄을 더 쓰면
              정작 볼 것이 그만큼 밀린다. `hidden sm:block`이 아니라 `max-sm:hidden`을 쓰는 이유는
              `line-clamp-2`가 `display: -webkit-box`라, sm에서 `block`을 덮어쓰면 줄 제한이 풀리기 때문이다.
            */}
            {preview.description ? <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-[var(--color-on-surface-variant)] max-sm:hidden sm:text-sm">{preview.description}</p> : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {preview.onDelete ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-2 text-xs font-black text-[var(--color-error)] transition hover:bg-[var(--color-error-container)] sm:px-4 sm:text-sm"
                type="button"
                onClick={preview.onDelete}
              >
                <Trash2 className="w-4 h-4" />
                {preview.deleteLabel ?? "삭제"}
              </button>
            ) : null}
            <button
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-[var(--color-on-surface-variant)] transition hover:bg-[var(--color-surface-low)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-on-surface)]"
              type="button"
              onClick={onClose}
              aria-label={preview.closeLabel}
            >
              <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 gap-4 overflow-auto p-3 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-5">
          <div className="grid content-start min-h-0 gap-3 pt-1 justify-items-center">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                aria-label="이전 화면"
                className={screenStepButtonClassName}
                onClick={goToPrevScreen}
              >
                <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden="true" />
              </button>

              <ModalScreenFrame>
                {isPreviewLoading ? <ScreenPreviewSkeleton /> : (
                  <>
                    {activeScreen.id === "friends" ? <FriendsScreenPreview visual={preview.visual} /> : null}
                    {activeScreen.id === "chats" ? <ChatsScreenPreview visual={preview.visual} /> : null}
                    {activeScreen.id === "chatroom" ? <ChatroomScreenPreview visual={preview.visual} /> : null}
                    {activeScreen.id === "profile" ? <ProfileScreenPreview visual={preview.visual} /> : null}
                  </>
                )}
              </ModalScreenFrame>

              <button
                type="button"
                aria-label="다음 화면"
                className={screenStepButtonClassName}
                onClick={goToNextScreen}
              >
                <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-2" aria-live="polite">
              <span className="text-sm font-black text-[var(--color-on-surface)]">{activeScreen.label}</span>
              <div className="flex items-center gap-1">
                {previewScreens.map((screen, index) => (
                  <span
                    key={screen.id}
                    className={`size-1.5 rounded-full ${index === activeScreenIndex ? "bg-[var(--color-inverse-surface)]" : "bg-[var(--color-outline-variant)]"}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>

            {/* {preview.note ? <p className="max-w-[280px] text-center text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{preview.note}</p> : null} */}
          </div>

          <div className="grid content-start min-h-0 grid-cols-2 gap-2 sm:grid-cols-1">
            {actions.map((action) => (
              <button key={action.platform} className={`whitespace-nowrap rounded-full px-2.5 py-3 text-[12px] font-black transition hover:scale-[0.98] sm:px-4 sm:text-sm ${action.className}`} type="button" onClick={() => preview.onStart(action.platform)}>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * 상세 에셋을 받는 동안 폰 화면 자리를 지킨다.
 *
 * 헤더·목록·하단 탭바의 골격은 실제 프리뷰와 같은 자리에 두어, 준비가 끝나고 바뀔 때
 * 레이아웃이 튀지 않게 한다. 색은 전부 중립 회색이다. 여기서 템플릿 색을 미리 칠하면
 * 기본 에셋을 보여 주지 않으려던 이유가 그대로 되살아난다.
 */
function ScreenPreviewSkeleton() {
  // `animate-pulse`의 투명도 변화는 옅은 회색 위에서 거의 보이지 않아 멈춘 화면과 구분되지 않는다.
  // 밝은 띠가 지나가는 `skeleton-shimmer`(globals.css)로 로딩 중임을 분명히 한다.
  const blockClassName = "skeleton-shimmer bg-black/10";

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--color-surface-low)]" role="status" aria-label="미리보기를 준비하는 중입니다">
      <div className="flex items-center justify-between px-4 h-11">
        <span className={`w-16 h-3 rounded-full ${blockClassName}`} />
        <span className={`rounded-full size-5 ${blockClassName}`} />
      </div>
      <div className="grid content-start gap-3 px-4 py-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <span className={`rounded-full size-9 shrink-0 ${blockClassName}`} />
            <span className={`flex-1 h-4 rounded-full ${blockClassName}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 items-center gap-3 px-4 h-14 border-t border-[var(--color-outline-variant)]">
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className={`mx-auto rounded-lg size-6 ${blockClassName}`} />
        ))}
      </div>
    </div>
  );
}

function ModalScreenFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative aspect-9/19.5 h-[min(calc(74vw*19.5/9),62dvh,540px)] w-auto shrink-0 overflow-hidden rounded-[32px] border border-[var(--color-outline-variant)] bg-white shadow-[0_18px_40px_rgba(42,103,103,0.12)]">
      {children}
    </div>
  );
}

function ScreenAvatar({ src, sizeClass = "size-10" }: { src?: string; sizeClass?: string }) {
  return (
    <span className={`grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-container)]/55`}>
      {src ? <img src={src} alt="" className="object-cover w-full h-full" /> : <UserRound className="size-1/2 text-[var(--color-on-primary-container)]" aria-hidden="true" />}
    </span>
  );
}

// 광고 예시 배너 (테마와 무관)
function PreviewAdBanner() {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[10px] bg-[#f1f3f5] px-2 py-1.5" aria-label="카카오톡 광고 예시 영역">
      <span className="grid h-8 w-11 place-items-center rounded-md bg-[#e2e5e9] text-[8px] font-bold tracking-[0.08em] text-[#868e96]" aria-hidden="true">AD</span>
      <span className="min-w-0">
        <strong className="block truncate text-[9.5px] font-semibold text-[#343a40]">카카오톡 채널의 새로운 소식</strong>
        <span className="mt-0.5 block truncate text-[8px] font-medium text-[#868e96]">테마와 무관한 광고 예시 영역입니다.</span>
      </span>
    </div>
  );
}

// 하단 탭바 (테마 실제 탭 아이콘 반영)
type PreviewTabKey = "friends" | "chats" | "now" | "shopping" | "more";

function PreviewTabBar({ visual, active }: { visual: TemplatePreviewVisual; active: PreviewTabKey }) {
  const icons = visual.tabIcons ?? {};
  const tabs: Array<{ key: PreviewTabKey; label: string; icon?: string; badge?: string }> = [
    { key: "friends", label: "친구", icon: active === "friends" ? icons.friendsFocused ?? icons.friends : icons.friends, badge: "12" },
    { key: "chats", label: "채팅", icon: active === "chats" ? icons.chatsFocused ?? icons.chats : icons.chats, badge: "8" },
    { key: "now", label: "Now", icon: active === "now" ? icons.nowFocused ?? icons.now : icons.now },
    { key: "shopping", label: "쇼핑", icon: active === "shopping" ? icons.shoppingFocused ?? icons.shopping : icons.shopping },
    { key: "more", label: "더보기", icon: active === "more" ? icons.moreFocused ?? icons.more : icons.more },
  ];
  return (
    <div
      className="grid grid-cols-5 items-center border-t border-black/5 bg-cover bg-center px-1 pb-1.5 pt-1"
      style={{ backgroundColor: visual.tabBackgroundColor, backgroundImage: visual.tabBackgroundImage ? `url(${visual.tabBackgroundImage})` : undefined }}
    >
      {tabs.map((tab) => (
        <div key={tab.key} className="grid justify-items-center gap-0.5">
          <span className="relative grid size-5 place-items-center">
            {tab.icon ? (
              <img src={tab.icon} alt="" className="object-contain w-full h-full" style={{ opacity: active === tab.key ? 1 : 0.55 }} />
            ) : (
              <span className="size-3.5 rounded-[5px] bg-black/15" style={{ opacity: active === tab.key ? 0.85 : 0.4 }} aria-hidden="true" />
            )}
            {tab.badge ? (
              <span className="absolute -right-1 -top-1 grid h-2.5 min-w-2.5 place-items-center rounded-full px-0.5 text-[6px] font-black leading-none text-white" style={{ backgroundColor: visual.unreadColor }}>
                {tab.badge}
              </span>
            ) : null}
          </span>
          <span className={`text-[7.5px] ${active === tab.key ? "font-black text-[var(--color-on-surface)]" : "font-semibold text-[var(--color-on-surface-variant)]"}`}>{tab.label}</span>
        </div>
      ))}
    </div>
  );
}

const friendBirthdayRows = [
  { name: "수아", sub: "오늘도 좋은 하루 ☺️" },
  { name: "정하늘", sub: "새 프로필로 바꿨어요" },
  { name: "이준서", sub: "여행 다녀왔습니다" },
];

// 친구메인탭
function FriendsScreenPreview({ visual }: { visual: TemplatePreviewVisual }) {
  const avatars = [visual.profileImage, visual.profileImage2 ?? visual.profileImage, visual.profileImage3 ?? visual.profileImage];
  return (
    <div
      className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-cover bg-center"
      style={{ backgroundColor: visual.mainBackgroundColor, backgroundImage: visual.mainBackgroundImage ? `url(${visual.mainBackgroundImage})` : undefined }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: visual.mainHeaderColor, color: visual.mainHeaderForegroundColor }}>
        <ScreenAvatar src={avatars[0]} sizeClass="size-6" />
        <strong className="flex-1 text-[12px] font-bold">내 프로필</strong>
        <div className="flex items-center gap-2">
          <Search className="size-3.5" aria-hidden="true" />
          <UserPlus className="size-3.5" aria-hidden="true" />
          <Gift className="size-3.5" aria-hidden="true" />
          <Settings className="size-3.5" aria-hidden="true" />
        </div>
      </div>

      <div className="grid content-start gap-2 px-3 py-2 overflow-hidden">
        <div className="flex gap-1.5">
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ backgroundColor: visual.titleColor, color: visual.mainBackgroundColor }}>친구</span>
          <span className="rounded-full border border-black/10 px-2.5 py-1 text-[10px] font-bold" style={{ color: visual.titleColor }}>추천</span>
        </div>

        <PreviewAdBanner />

        <span className="px-0.5 text-[11px] font-bold" style={{ color: visual.sectionTitleColor }}>업데이트 프로필 12</span>
        <div className="grid grid-cols-5 gap-1 px-0.5">
          {["내 프로필", "수아", "하늘", "준서", "서연"].map((name, index) => (
            <div key={name} className="grid min-w-0 gap-1 justify-items-center">
              <div className="relative">
                <ScreenAvatar src={avatars[index % avatars.length]} sizeClass="size-8" />
                {index > 0 ? <span className="absolute -top-0.5 left-1 size-1.5 rounded-full bg-[#ff7246]" aria-hidden="true" /> : null}
              </div>
              <span className="block w-full truncate text-center text-[7px] font-medium leading-[1.1]" style={{ color: visual.descriptionColor }}>{name}</span>
            </div>
          ))}
        </div>

        <span className="my-0.5 block h-px w-full" style={{ backgroundColor: visual.bodyCellBorderColor, opacity: 0.35 }} aria-hidden="true" />

        <span className="px-0.5 text-[11px] font-bold" style={{ color: visual.sectionTitleColor }}>생일인 친구 4</span>
        {friendBirthdayRows.map((row, index) => (
          <div key={row.name} className="flex items-center gap-2.5 px-0.5 py-0.5">
            <ScreenAvatar src={avatars[index % avatars.length]} sizeClass="size-9" />
            <div className="min-w-0">
              <strong className="block truncate text-[12px] font-bold leading-tight" style={{ color: visual.titleColor }}>{row.name}</strong>
              <span className="block truncate text-[10px] font-medium leading-tight" style={{ color: visual.descriptionColor }}>{row.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <PreviewTabBar visual={visual} active="friends" />
    </div>
  );
}

const chatListPreviewRows = [
  { name: "수아", message: "콜! 이따 6시에 보자 ㅎㅎ", time: "09:40", unread: 2 },
  { name: "가족 단톡방", message: "엄마: 저녁 몇 시에 올 거야?", time: "어제", unread: 5 },
  { name: "정하늘", message: "그 사진 봤어?? 완전 웃기다 ㅋㅋㅋ", time: "어제", unread: 0 },
  { name: "이준서", message: "내일 회의 자료 공유할게요", time: "화요일", unread: 0 },
];

// 채팅목록탭
function ChatsScreenPreview({ visual }: { visual: TemplatePreviewVisual }) {
  const avatars = [visual.profileImage, visual.profileImage2 ?? visual.profileImage, visual.profileImage3 ?? visual.profileImage];
  return (
    <div
      className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-cover bg-center"
      style={{ backgroundColor: visual.mainBackgroundColor, backgroundImage: visual.mainBackgroundImage ? `url(${visual.mainBackgroundImage})` : undefined }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: visual.mainHeaderColor, color: visual.mainHeaderForegroundColor }}>
        <strong className="flex-1 text-[13px] font-bold">채팅</strong>
        <Search className="size-3.5" aria-hidden="true" />
        <Plus className="size-3.5" aria-hidden="true" />
      </div>

      <div className="grid content-start gap-2 px-3 py-2 overflow-hidden">
        <PreviewAdBanner />
        {chatListPreviewRows.map((row, index) => (
          <div key={row.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 py-0.5">
            <ScreenAvatar src={avatars[index % avatars.length]} sizeClass="size-9" />
            <div className="min-w-0">
              <strong className="block truncate text-[12px] font-bold leading-tight" style={{ color: visual.titleColor }}>{row.name}</strong>
              <span className="block truncate text-[10px] font-medium leading-tight" style={{ color: visual.descriptionColor }}>{row.message}</span>
            </div>
            <div className="grid gap-1 justify-items-end">
              <span className="text-[8.5px] font-medium" style={{ color: visual.descriptionColor, opacity: 0.85 }}>{row.time}</span>
              {row.unread > 0 ? (
                <span className="grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[8px] font-black leading-none text-white" style={{ backgroundColor: visual.unreadColor }}>{row.unread}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <PreviewTabBar visual={visual} active="chats" />
    </div>
  );
}

// 연속 메시지 두 쌍(you_1→you_2, me_1→me_2)으로 구성해 bubble_me_1/2, bubble_you_1/2 네 슬롯이
// 모두 보이게 한다. variant 2는 "_2"(연속 메시지 변형) 에셋을 쓴다.
const chatroomPreviewMessages: Array<{ mine: boolean; variant: 1 | 2; text: string; time: string }> = [
  { mine: false, variant: 1, text: "오늘 저녁 뭐 먹지 ㅋㅋ", time: "5:41" },
  { mine: false, variant: 2, text: "떡볶이 어때?", time: "5:41" },
  { mine: true, variant: 1, text: "콜 좋아 ㅎㅎ", time: "5:42" },
  { mine: true, variant: 2, text: "6시에 보자!", time: "5:42" },
];

// 채팅방
function ChatroomScreenPreview({ visual }: { visual: TemplatePreviewVisual }) {
  return (
    <div
      className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-cover bg-center"
      style={{ backgroundColor: visual.chatBackgroundColor, backgroundImage: visual.chatBackgroundImage ? `url(${visual.chatBackgroundImage})` : undefined }}
    >
      <div className="flex items-center gap-2 rounded-t-[31px] bg-black/5 px-3 py-2.5 text-[var(--color-on-surface)] backdrop-blur-sm">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <strong className="flex-1 truncate text-[12px] font-bold">수아</strong>
        <Search className="size-3.5" aria-hidden="true" />
        <Menu className="size-3.5" aria-hidden="true" />
      </div>

      <div className="grid content-end gap-2 px-3 py-3 overflow-hidden">
        {chatroomPreviewMessages.map((message, index) => (
          <ChatroomBubble key={index} visual={visual} mine={message.mine} variant={message.variant} text={message.text} time={message.time} />
        ))}
      </div>

      <div className="flex items-center gap-1.5 rounded-b-[31px] bg-white/85 px-2.5 py-2 backdrop-blur-sm">
        <Plus className="size-3.5 shrink-0 text-[#868e96]" aria-hidden="true" />
        <span className="flex-1 truncate rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-[#868e96] shadow-sm">메시지 입력</span>
        <Smile className="size-3.5 shrink-0 text-[#868e96]" aria-hidden="true" />
        <span className="grid rounded-full size-6 shrink-0 place-items-center" style={{ backgroundColor: visual.unreadColor }}>
          <SendHorizontal className="text-white size-3" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function ChatroomBubble({ visual, mine, variant, text, time }: { visual: TemplatePreviewVisual; mine: boolean; variant: 1 | 2; text: string; time: string }) {
  const image = variant === 2 ? (mine ? visual.myBubbleImage2 : visual.friendBubbleImage2) : mine ? visual.myBubbleImage : visual.friendBubbleImage;
  const geometry = variant === 2 ? (mine ? visual.myBubbleGeometry2 : visual.friendBubbleGeometry2) : mine ? visual.myBubbleGeometry : visual.friendBubbleGeometry;
  const stretch = variant === 2 ? (mine ? visual.myBubbleStretch2 : visual.friendBubbleStretch2) : mine ? visual.myBubbleStretch : visual.friendBubbleStretch;
  const insets = variant === 2 ? (mine ? visual.myBubbleInsets2 : visual.friendBubbleInsets2) : mine ? visual.myBubbleInsets : visual.friendBubbleInsets;
  const markers = variant === 2 ? (mine ? visual.myBubbleMarkers2 : visual.friendBubbleMarkers2) : mine ? visual.myBubbleMarkers : visual.friendBubbleMarkers;
  const textColor = mine ? visual.myBubbleTextColor : visual.friendBubbleTextColor;
  const fillColor = mine ? visual.myBubbleFillColor : visual.friendBubbleFillColor;
  const edit = geometry || stretch || insets || markers ? { geometry, stretch, insets, markers } : undefined;
  return (
    <div className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine ? <ScreenAvatar src={visual.profileImage} sizeClass="size-6" /> : null}
      {mine ? <span className="mb-0.5 text-[7px] font-medium text-[var(--color-on-surface-variant)]">{time}</span> : null}
      {image ? (
        <BubbleCanvasPreview imageUrl={image} platform={visual.platform} slot={mine ? "me" : "you"} edit={edit} text={text} textColor={textColor} fillColor={fillColor} scale={0.24} className="shrink-0" />
      ) : (
        <span
          className={`max-w-[68%] px-2.5 py-1.5 text-[11px] font-medium leading-snug ${mine ? "rounded-[14px] rounded-br-[4px]" : "rounded-[14px] rounded-bl-[4px]"}`}
          style={{ backgroundColor: fillColor, color: textColor }}
        >
          {text}
        </span>
      )}
      {!mine ? <span className="mb-0.5 text-[7px] font-medium text-[var(--color-on-surface-variant)]">{time}</span> : null}
    </div>
  );
}

// 기본 프로필 사진
function ProfileScreenPreview({ visual }: { visual: TemplatePreviewVisual }) {
  const heroImage = visual.profileImageFull ?? visual.profileImage;
  const extras = Array.from(new Set([visual.profileImage, visual.profileImage2, visual.profileImage3].filter((src): src is string => Boolean(src))));

  return (
    <div
      className="grid h-full grid-rows-[minmax(0,1fr)_auto] bg-cover bg-center"
      style={{ backgroundColor: visual.mainBackgroundColor, backgroundImage: visual.mainBackgroundImage ? `url(${visual.mainBackgroundImage})` : undefined }}
    >
      <div className="grid content-center gap-3 px-6 justify-items-center">
        <ScreenAvatar src={heroImage} sizeClass="size-28" />
        <strong className="text-[13px] font-bold" style={{ color: visual.titleColor }}>내 프로필</strong>
        <p className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: visual.descriptionColor }}>기본 프로필 사진</p>
      </div>
      {extras.length > 0 ? (
        <div className="flex items-center justify-center gap-2.5 px-6 pb-6">
          {extras.map((src) => (
            <ScreenAvatar key={src} src={src} sizeClass="size-10" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RecentWorkConflictDialog({
  record,
  onContinueRecent,
  onStartSelected,
  onCancel,
}: {
  record: EditorAutosaveDraft;
  onContinueRecent: () => void;
  onStartSelected: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[color:rgba(27,28,25,0.58)] p-4" role="dialog" aria-modal="true" aria-labelledby="recent-work-conflict-title">
      <section className="relative w-full max-w-lg rounded-[28px] bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.28)] sm:p-6">
        <button
          type="button"
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full text-[var(--color-on-surface-variant)] transition hover:bg-[#eff6ff] hover:text-[#1d4ed8] active:bg-[#dbeafe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:right-5 sm:top-5"
          onClick={onCancel}
          aria-label="최근 작업 선택 닫기"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <span className="inline-flex rounded-full bg-[#dbeafe] px-3 py-1.5 text-xs font-black text-[#1d4ed8]">자동 저장 · {formatDate(record.updatedAt)}</span>
        <h2 id="recent-work-conflict-title" className="mt-4 pr-10 text-xl font-black text-[var(--color-on-surface)]">최근 작업이 남아 있습니다</h2>
        <p className="mt-2 pr-4 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">
          선택한 템플릿으로 시작하면, 새 편집기에서 내용을 처음 바꿀 때 최근 작업이 교체됩니다.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" className="min-h-14 rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-black leading-5 text-[#0f172a] transition hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#1d4ed8] active:border-[#93c5fd] active:bg-[#dbeafe] active:text-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]" onClick={onContinueRecent}>
            최근 작업 계속하기
          </button>
          <button type="button" className="min-h-14 rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-black leading-5 text-[#0f172a] transition hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#1d4ed8] active:border-[#93c5fd] active:bg-[#dbeafe] active:text-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]" onClick={onStartSelected}>
            선택한 템플릿으로 시작
          </button>
        </div>
      </section>
    </div>
  );
}

function UserTemplateInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.55)] p-4" role="dialog" aria-modal="true" aria-label="내 템플릿 안내" onClick={onClose}>
      <div className="max-w-sm rounded-[24px] bg-white p-5 shadow-[0_28px_64px_rgba(42,103,103,0.2)]" onClick={(event) => event.stopPropagation()}>
        <strong className="block text-lg font-black text-[var(--color-on-surface)]">내 템플릿 안내</strong>
        <p className="mt-2 text-sm leading-6 text-[var(--color-on-surface-variant)]">
          편집 상태와 직접 올린 이미지는 이 브라우저에 저장됩니다. 내보내기를 시작하면 파일 생성에 필요한 데이터가 서버로 일시 전송됩니다.
        </p>
        <button
          type="button"
          className="mt-4 w-full rounded-full bg-[var(--color-inverse-surface)] px-4 py-2.5 text-sm font-black text-[var(--color-inverse-on-surface)]"
          onClick={onClose}
        >
          확인
        </button>
      </div>
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

// 템플릿 미리보기 폰 프리뷰
function TemplatePhonePreview({ template, visual }: { template: ThemeTemplate; visual: TemplatePreviewVisual }) {
  return (
    <div
      className="mx-auto grid h-[min(48dvh,500px)] min-h-[250px] w-full max-w-[310px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[28px] border border-[var(--color-outline-variant)] bg-cover bg-center shadow-[0_22px_52px_rgba(42,103,103,0.14)] sm:h-[min(68dvh,540px)] sm:max-w-[330px] sm:rounded-[32px] lg:max-w-[340px]"
      style={{ backgroundColor: visual.chatBackgroundColor, backgroundImage: visual.chatBackgroundImage ? `url(${visual.chatBackgroundImage})` : undefined }}
    >
      <div className="flex h-12 items-center justify-between bg-white/60 px-4 text-xs font-black text-[var(--color-on-surface)] sm:h-14 sm:px-5 sm:text-sm">
        <span>{template.name}</span>
        <div className="flex items-center gap-3">
          <Search className="w-4 h-4" />
          <Settings className="w-4 h-4" />
        </div>
      </div>
      <div className="grid content-start min-h-0 gap-3 p-3 overflow-hidden sm:gap-4 sm:p-4">
        <div className="justify-self-center rounded-full bg-[#14343a]/18 px-5 py-1 text-xs font-bold text-white">오늘</div>
        <PreviewMessage visual={visual} mine={false} text=".." />
        <PreviewMessage visual={visual} mine text="안녕" />
        <PreviewMessage visual={visual} mine={false} text=".." />
        <PreviewMessage visual={visual} mine text=".." />
      </div>
      <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 bg-white/90 px-3 py-2">
        <Plus className="h-5 w-5 justify-self-center text-[var(--color-on-surface-variant)]" />
        <span className="rounded-full bg-[var(--color-surface-low)] px-4 py-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">사용자 입력</span>
        <Hash className="h-5 w-5 justify-self-center text-[var(--color-on-surface-variant)]" />
      </div>
    </div>
  );
}

function MiniAvatar({ src }: { src?: string }) {
  return (
    <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-container)]/55">
      {src ? <img src={src} alt="" className="object-cover w-full h-full" /> : <UserRound className="h-3.5 w-3.5 text-[var(--color-on-primary-container)]" />}
    </span>
  );
}

function PreviewMessage({ visual, mine, text }: { visual: TemplatePreviewVisual; mine: boolean; text: string }) {
  const bubbleImage = mine ? visual.myBubbleImage : visual.friendBubbleImage;
  const geometry = mine ? visual.myBubbleGeometry : visual.friendBubbleGeometry;
  const stretch = mine ? visual.myBubbleStretch : visual.friendBubbleStretch;
  const insets = mine ? visual.myBubbleInsets : visual.friendBubbleInsets;
  const markers = mine ? visual.myBubbleMarkers : visual.friendBubbleMarkers;
  const textColor = mine ? visual.myBubbleTextColor : visual.friendBubbleTextColor;
  const fillColor = mine ? visual.myBubbleFillColor : visual.friendBubbleFillColor;
  const edit = geometry || stretch || insets || markers ? { geometry, stretch, insets, markers } : undefined;
  return (
    <div className={`grid gap-1.5 ${mine ? "justify-items-end" : "grid-cols-[28px_minmax(0,1fr)] items-end"}`}>
      {!mine ? <MiniAvatar src={visual.profileImage} /> : null}
      {bubbleImage ? (
        <BubbleCanvasPreview imageUrl={bubbleImage} platform={visual.platform} slot={mine ? "me" : "you"} edit={edit} text={text} textColor={textColor} fillColor={fillColor} scale={0.3} className={mine ? "justify-self-end" : ""} />
      ) : (
        <span
          className={`min-h-[46px] min-w-[100px] max-w-[84%] rounded-[18px] px-6 py-4 text-sm font-semibold leading-5 ${mine ? "justify-self-end" : ""}`}
          style={{ backgroundColor: fillColor, color: textColor }}
        >
          {text}
        </span>
      )}
    </div>
  );
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

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
