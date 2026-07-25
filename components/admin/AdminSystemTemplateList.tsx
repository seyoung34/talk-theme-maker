"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, RefreshCw, Save, SendHorizontal, Settings, Trash2, UserRound, X } from "lucide-react";
import TemplateCard from "@/components/template/TemplateCard";
import TemplateVisualPreview from "@/components/template/TemplateVisualPreview";
import { createSystemTemplatePreviewUrls, createSystemTemplatePreviewVisual, type SignedUrlCache, type TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";
import { systemTemplateRepository, type SystemTemplateStatus, type SystemTemplateSummary, type SystemTemplateVisibility } from "@/lib/theme/systemTemplates";
import { templateStartStorageKey, themeTemplates } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

type SystemTemplateBundle = {
  id: string;
  title: string;
  description?: string;
  variants: Partial<Record<ThemePlatform, SystemTemplateSummary>>;
  previewTemplate: SystemTemplateSummary;
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  tags: string[];
  visual: TemplatePreviewVisual;
  updatedAt: number;
};

export default function AdminSystemTemplateList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<SystemTemplateSummary[]>([]);
  const [uploadPreviewUrls, setUploadPreviewUrls] = useState<SignedUrlCache>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ bundle: SystemTemplateBundle; platform?: ThemePlatform } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const page = await systemTemplateRepository.listPage({ limit: 12 });
      setTemplates(page.items);
      setNextCursor(page.nextCursor);
      setUploadPreviewUrls(await createSystemTemplatePreviewUrls(page.items, uploadPreviewUrls));
    } catch (loadError) {
      console.error(loadError);
      setError("시스템 템플릿을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreTemplates = async () => {
    if (!nextCursor || isLoadingMore) return;
    try {
      setIsLoadingMore(true);
      const page = await systemTemplateRepository.listPage({ cursor: nextCursor, limit: 12 });
      setTemplates((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
      setUploadPreviewUrls(await createSystemTemplatePreviewUrls(page.items, uploadPreviewUrls));
    } catch (loadError) {
      console.error(loadError);
      setError("템플릿을 더 불러오지 못했습니다.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const bundles = useMemo(() => createBundles(templates, uploadPreviewUrls), [templates, uploadPreviewUrls]);
  const selectedBundle = bundles.find((bundle) => bundle.id === selectedBundleId) ?? null;

  useEffect(() => {
    if (!selectedBundle) return;
    let active = true;
    createSystemTemplatePreviewUrls(Object.values(selectedBundle.variants), uploadPreviewUrls, { includeDetails: true })
      .then((urls) => { if (active) setUploadPreviewUrls(urls); })
      .catch((loadError) => console.error(loadError));
    return () => { active = false; };
  }, [selectedBundleId]);

  const editTemplate = (template: SystemTemplateSummary) => {
    localStorage.setItem(
      templateStartStorageKey,
      JSON.stringify({
        templateId: template.baseTemplateId,
        platform: template.platform,
        systemTemplateId: template.id,
        systemTemplateBundleId: template.bundleId ?? template.id,
        editMode: "admin",
      }),
    );
    router.push("/admin/edit");
  };

  const createVariant = (bundle: SystemTemplateBundle, platform: ThemePlatform) => {
    const fallback = bundle.variants.android ?? bundle.variants.ios;
    localStorage.setItem(
      templateStartStorageKey,
      JSON.stringify({
        templateId: fallback?.baseTemplateId ?? "basic",
        platform,
        systemTemplateBundleId: bundle.id,
        sourceSystemTemplateId: fallback?.id,
        editMode: "admin",
      }),
    );
    router.push("/admin/edit");
  };

  const regenerateAllPreviews = async () => {
    if (isRegenerating) return;
    try {
      setIsRegenerating(true);
      setError(null);
      const all = await systemTemplateRepository.list();
      let done = 0;
      for (const template of all) {
        await systemTemplateRepository.regeneratePreviewMetadata(template.id);
        done += 1;
      }
      setNotice(`프리뷰 메타를 ${done}개 재생성했습니다.`);
      await loadTemplates();
    } catch (regenerateError) {
      console.error(regenerateError);
      setError("프리뷰 재생성에 실패했습니다.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const updatePublication = async (bundle: SystemTemplateBundle, status: SystemTemplateStatus, visibility: SystemTemplateVisibility) => {
    try {
      setError(null);
      await systemTemplateRepository.updatePublication(bundle.id, { status, visibility });
      const updatedAt = Date.now();
      setTemplates((current) => current.map((template) =>
        (template.bundleId ?? template.id) === bundle.id
          ? { ...template, status, visibility, updatedAt }
          : template,
      ));
      setNotice("게시 설정을 저장했습니다.");
    } catch (saveError) {
      console.error(saveError);
      setError("게시 설정을 저장하지 못했습니다.");
      throw saveError;
    }
  };

  const saveTags = async (bundle: SystemTemplateBundle, tags: string[]) => {
    try {
      setError(null);
      await systemTemplateRepository.updateTags(bundle.id, tags);
      const updatedAt = Date.now();
      setTemplates((current) => current.map((template) =>
        (template.bundleId ?? template.id) === bundle.id
          ? { ...template, tags, updatedAt }
          : template,
      ));
      setNotice("태그를 저장했습니다.");
    } catch (saveError) {
      console.error(saveError);
      setError("태그를 저장하지 못했습니다.");
      throw saveError;
    }
  };

  const deleteSelected = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);
      setError(null);
      const ids = deleteTarget.platform
        ? [deleteTarget.bundle.variants[deleteTarget.platform]?.id].filter((id): id is string => Boolean(id))
        : Object.values(deleteTarget.bundle.variants).map((template) => template.id);
      await Promise.all(ids.map((id) => systemTemplateRepository.delete(id)));
      setTemplates((current) => current.filter((template) => !ids.includes(template.id)));
      setNotice(deleteTarget.platform ? `${platformLabel(deleteTarget.platform)} variant를 삭제했습니다.` : "시스템 템플릿을 삭제했습니다.");
      setDeleteTarget(null);
      if (!deleteTarget.platform || Object.keys(deleteTarget.bundle.variants).length <= 1) setSelectedBundleId(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError("시스템 템플릿을 삭제하지 못했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">System templates</p>
          <h2 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">시스템 템플릿</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-2 text-xs font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)] disabled:opacity-50"
            onClick={() => void regenerateAllPreviews()}
            disabled={isRegenerating || isLoading}
            title="저장된 템플릿의 프리뷰 메타(색상·말풍선 stretch/insets)를 최신 로직으로 다시 계산합니다."
          >
            <RefreshCw className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
            {isRegenerating ? "재생성 중" : "프리뷰 재생성"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-3 py-2 text-xs font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)]"
            onClick={() => void loadTemplates()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </div>

      {notice ? <p className="rounded-[18px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</p> : null}
      {error ? <p className="rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SystemTemplateSkeletonCards count={3} />
        </div>
      ) : bundles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {bundles.map((bundle) => (
            <SystemTemplateCard key={bundle.id} bundle={bundle} onOpen={setSelectedBundleId} />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-5 text-sm font-bold text-[var(--color-on-surface-variant)]">
          저장된 시스템 템플릿이 없습니다.
        </div>
      )}

      {nextCursor && !isLoading ? (
        <button type="button" className="mx-auto min-h-11 rounded-full border border-[var(--color-outline-variant)] bg-white px-5 text-sm font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-low)] disabled:opacity-50" onClick={() => void loadMoreTemplates()} disabled={isLoadingMore}>
          {isLoadingMore ? "불러오는 중" : "템플릿 더 보기"}
        </button>
      ) : null}

      {selectedBundle ? (
        <SystemTemplateManageModal
          bundle={selectedBundle}
          onClose={() => setSelectedBundleId(null)}
          onEdit={editTemplate}
          onCreateVariant={createVariant}
          onDelete={(platform) => setDeleteTarget({ bundle: selectedBundle, platform })}
          onDeleteBundle={() => setDeleteTarget({ bundle: selectedBundle })}
          onSavePublication={(status, visibility) => updatePublication(selectedBundle, status, visibility)}
          onSaveTags={(tags) => saveTags(selectedBundle, tags)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteSystemTemplateDialog
          bundle={deleteTarget.bundle}
          platform={deleteTarget.platform}
          isDeleting={isDeleting}
          onClose={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
          onConfirm={() => void deleteSelected()}
        />
      ) : null}
    </section>
  );
}

function SystemTemplateCard({ bundle, onOpen }: { bundle: SystemTemplateBundle; onOpen: (bundleId: string) => void }) {
  return (
    <TemplateCard
      title={bundle.title}
      onOpen={() => onOpen(bundle.id)}
      openLabel={`${bundle.title} 관리`}
      className="sm:min-h-[392px]"
      mobileVisual={
        <div className="relative">
          <TemplateVisualPreview visual={bundle.visual} size="thumb" />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            <PublicationTag kind="status" value={bundle.status} compact />
            <PublicationTag kind="visibility" value={bundle.visibility} compact />
          </div>
        </div>
      }
      desktopVisual={<TemplateVisualPreview visual={bundle.visual} size="card" />}
      desktopContent={
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--color-tertiary-container)]/50 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-tertiary-container)]">System</span>
            <span className="rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-[11px] font-black uppercase text-[var(--color-on-surface-variant)]">{Object.keys(bundle.variants).join(" / ")}</span>
            <PublicationTag kind="status" value={bundle.status} />
            <PublicationTag kind="visibility" value={bundle.visibility} />
          </div>
          <strong className="font-[var(--font-display)] text-[26px] font-semibold leading-tight text-[var(--color-on-surface)]">{bundle.title}</strong>
          {bundle.description ? <span className="line-clamp-2 text-sm leading-6 text-[var(--color-on-surface-variant)]">{bundle.description}</span> : null}
        </div>
      }
      desktopFooter={
        <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)]">
          관리
          <ArrowRight className="h-4 w-4" />
        </span>
      }
    />
  );
}

function SystemTemplateSkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="grid min-h-[392px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white/70 p-4 shadow-[0_16px_36px_rgba(42,103,103,0.04)]">
          <div className="grid gap-4">
            <div className="aspect-[16/15] animate-pulse rounded-[22px] bg-[var(--color-surface-low)]" />
            <div className="grid gap-2">
              <span className="h-5 w-24 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
              <span className="h-8 w-4/5 animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
              <span className="h-4 w-full animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
              <span className="h-4 w-2/3 animate-pulse rounded-xl bg-[var(--color-surface-low)]" />
            </div>
          </div>
          <span className="mt-4 h-10 w-24 animate-pulse rounded-full bg-[var(--color-surface-low)]" />
        </div>
      ))}
    </>
  );
}

const publicationStatusOptions: { value: SystemTemplateStatus; label: string; description: string }[] = [
  { value: "draft", label: "초안", description: "작업 중인 상태로 갤러리에 노출하지 않습니다." },
  { value: "published", label: "게시됨", description: "공개 범위가 전체 공개이면 갤러리에 노출합니다." },
  { value: "archived", label: "보관", description: "운영을 종료하고 갤러리에서 숨깁니다." },
];

const publicationVisibilityOptions: { value: SystemTemplateVisibility; label: string; description: string }[] = [
  { value: "private", label: "비공개", description: "관리자 화면에서만 관리합니다." },
  { value: "public", label: "전체 공개", description: "게시된 템플릿을 일반 갤러리에 표시합니다." },
];

function PublicationOptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; description: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-black text-[var(--color-on-surface)]">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <label
              key={option.value}
              className={`grid cursor-pointer gap-1 rounded-[16px] border p-3 transition ${isSelected ? "border-[var(--color-primary)] bg-[var(--color-primary-container)]/45 shadow-[0_8px_20px_rgba(42,103,103,0.08)]" : "border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] hover:bg-white"}`}
            >
              <span className="flex items-center gap-2 text-sm font-black text-[var(--color-on-surface)]">
                <input
                  type="radio"
                  className="size-4 accent-[var(--color-primary)]"
                  name={label}
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onChange(option.value)}
                />
                {option.label}
              </span>
              <span className="pl-6 text-[11px] font-semibold leading-4 text-[var(--color-on-surface-variant)]">{option.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type PublicationTagProps = (
  | { kind: "status"; value: SystemTemplateStatus }
  | { kind: "visibility"; value: SystemTemplateVisibility }
) & { compact?: boolean };

function PublicationTag(props: PublicationTagProps) {
  const { compact = false } = props;
  const statusClasses: Record<SystemTemplateStatus, string> = {
    draft: "border-amber-200 bg-amber-50 text-amber-800",
    published: "border-emerald-200 bg-emerald-50 text-emerald-700",
    archived: "border-slate-200 bg-slate-100 text-slate-600",
  };
  const visibilityClasses: Record<SystemTemplateVisibility, string> = {
    private: "border-slate-200 bg-white text-slate-600",
    public: "border-sky-200 bg-sky-50 text-sky-700",
  };
  const className = props.kind === "status" ? statusClasses[props.value] : visibilityClasses[props.value];
  const label = props.kind === "status"
    ? publicationStatusOptions.find((option) => option.value === props.value)?.label
    : publicationVisibilityOptions.find((option) => option.value === props.value)?.label;

  return <span className={`rounded-full border font-black shadow-sm ${compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[11px]"} ${className}`}>{label}</span>;
}

function SystemTemplateManageModal({
  bundle,
  onClose,
  onEdit,
  onCreateVariant,
  onDelete,
  onDeleteBundle,
  onSavePublication,
  onSaveTags,
}: {
  bundle: SystemTemplateBundle;
  onClose: () => void;
  onEdit: (template: SystemTemplateSummary) => void;
  onCreateVariant: (bundle: SystemTemplateBundle, platform: ThemePlatform) => void;
  onDelete: (platform: ThemePlatform) => void;
  onDeleteBundle: () => void;
  onSavePublication: (status: SystemTemplateStatus, visibility: SystemTemplateVisibility) => Promise<void>;
  onSaveTags: (tags: string[]) => Promise<void>;
}) {
  const [status, setStatus] = useState(bundle.status);
  const [visibility, setVisibility] = useState(bundle.visibility);
  const [savedPublication, setSavedPublication] = useState({ status: bundle.status, visibility: bundle.visibility });
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [isSavingPublication, setIsSavingPublication] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isPublicationDirty = status !== savedPublication.status || visibility !== savedPublication.visibility;

  const [tags, setTags] = useState<string[]>(bundle.tags);
  const [savedTags, setSavedTags] = useState<string[]>(bundle.tags);
  const [tagInput, setTagInput] = useState("");
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const isTagsDirty = tags.length !== savedTags.length || tags.some((tag) => !savedTags.includes(tag));

  const addTag = (raw: string) => {
    const value = raw.trim();
    if (!value || tags.includes(value)) return;
    setTags((current) => [...current, value]);
    setTagInput("");
  };
  const removeTag = (value: string) => setTags((current) => current.filter((tag) => tag !== value));

  const saveTagsChanges = async () => {
    try {
      setIsSavingTags(true);
      setTagsError(null);
      await onSaveTags(tags);
      setSavedTags(tags);
    } catch {
      setTagsError("태그를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSavingTags(false);
    }
  };

  const savePublication = async () => {
    try {
      setIsSavingPublication(true);
      setSaveError(null);
      await onSavePublication(status, visibility);
      setSavedPublication({ status, visibility });
      setIsSaveConfirmOpen(false);
    } catch {
      setSaveError("게시 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSavingPublication(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.55)] p-4" role="dialog" aria-modal="true" aria-label={`${bundle.title} 관리`}>
      <section className="grid max-h-[calc(100dvh-24px)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_64px_rgba(42,103,103,0.2)] sm:max-h-[calc(100dvh-32px)] sm:rounded-[32px]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-outline-variant)] px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">System template</p>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold leading-tight text-[var(--color-on-surface)] sm:text-3xl">{bundle.title}</h2>
            {bundle.description ? <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-[var(--color-on-surface-variant)] sm:text-sm">{bundle.description}</p> : null}
          </div>
          <button className="shrink-0 rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:bg-white sm:px-4 sm:text-sm" type="button" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="grid min-h-0 gap-4 overflow-auto p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <TemplatePhonePreview bundle={bundle} />
          <div className="grid content-start gap-4">
            <section className="grid gap-4 rounded-[22px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--color-on-surface-variant)]">Publication</p>
                  <h3 className="mt-1 text-lg font-black text-[var(--color-on-surface)]">게시 설정</h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">두 설정이 모두 ‘게시됨’과 ‘전체 공개’일 때 일반 갤러리에 노출됩니다.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <PublicationTag kind="status" value={status} />
                  <PublicationTag kind="visibility" value={visibility} />
                </div>
              </div>

              <PublicationOptionGroup
                label="게시 상태"
                value={status}
                options={publicationStatusOptions}
                onChange={setStatus}
              />
              <PublicationOptionGroup
                label="공개 범위"
                value={visibility}
                options={publicationVisibilityOptions}
                onChange={setVisibility}
              />

              {saveError ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{saveError}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-outline-variant)] pt-4">
                <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">{isPublicationDirty ? "저장하지 않은 변경사항이 있습니다." : "게시 설정이 저장되어 있습니다."}</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-4 py-2.5 text-xs font-black text-[var(--color-inverse-on-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    setSaveError(null);
                    setIsSaveConfirmOpen(true);
                  }}
                  disabled={!isPublicationDirty}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  변경사항 저장
                </button>
              </div>
            </section>

            <section className="grid gap-4 rounded-[22px] border border-[var(--color-outline-variant)] bg-white p-4 shadow-[0_12px_28px_rgba(42,103,103,0.06)] sm:p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--color-on-surface-variant)]">Tags</p>
                <h3 className="mt-1 text-lg font-black text-[var(--color-on-surface)]">태그</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">‘default’ 태그를 붙인 템플릿이 일반 갤러리 최상단과 ‘기본 템플릿 보기’에 노출됩니다.</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {tags.length > 0 ? tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-black text-[var(--color-on-surface)]">
                    {tag}
                    <button type="button" aria-label={`${tag} 태그 제거`} className="grid size-4 place-items-center rounded-full text-[var(--color-on-surface-variant)] transition hover:bg-white hover:text-[var(--color-on-surface)]" onClick={() => removeTag(tag)}>
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                )) : <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">등록된 태그가 없습니다.</span>}
              </div>

              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.currentTarget.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(tagInput); } }}
                  placeholder="태그 입력 후 Enter (예: default)"
                  className="h-10 flex-1 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--color-info)]"
                  aria-label="새 태그"
                />
                <button type="button" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()} className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3 text-xs font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-low)] disabled:cursor-not-allowed disabled:opacity-40">
                  <Plus className="size-4" aria-hidden="true" /> 추가
                </button>
              </div>

              {tagsError ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{tagsError}</p> : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-outline-variant)] pt-4">
                <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">{isTagsDirty ? "저장하지 않은 태그 변경사항이 있습니다." : "태그가 저장되어 있습니다."}</span>
                <button type="button" onClick={() => void saveTagsChanges()} disabled={!isTagsDirty || isSavingTags} className="inline-flex items-center gap-2 rounded-full bg-[var(--color-inverse-surface)] px-4 py-2.5 text-xs font-black text-[var(--color-inverse-on-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                  <Save className="h-4 w-4" aria-hidden="true" /> {isSavingTags ? "저장 중" : "태그 저장"}
                </button>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              {(["android", "ios"] as const).map((platform) => {
                const variant = bundle.variants[platform];
                return (
                  <section key={platform} className="grid gap-3 rounded-[20px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm font-black uppercase text-[var(--color-on-surface)]">{platformLabel(platform)}</strong>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${variant ? "bg-emerald-50 text-emerald-700" : "bg-white text-[var(--color-on-surface-variant)]"}`}>{variant ? "저장됨" : "없음"}</span>
                    </div>
                    {variant ? (
                      <div className="grid gap-2 text-xs font-bold text-[var(--color-on-surface-variant)]">
                        <span>이미지: {variant.uploadCount}개</span>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">다른 플랫폼 variant에서 설정을 변환해 추가합니다.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {variant ? (
                        <>
                          <button type="button" className="rounded-full bg-[var(--color-inverse-surface)] px-4 py-2 text-xs font-black text-[var(--color-inverse-on-surface)]" onClick={() => onEdit(variant)}>
                            편집
                          </button>
                          <button type="button" className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-xs font-black text-red-700" onClick={() => onDelete(platform)}>
                            삭제
                          </button>
                        </>
                      ) : (
                        <button type="button" className="rounded-full bg-[var(--color-primary-container)] px-4 py-2 text-xs font-black text-[var(--color-on-primary-container)]" onClick={() => onCreateVariant(bundle, platform)}>
                          추가
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            <button type="button" className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100" onClick={onDeleteBundle}>
              전체 삭제
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {isSaveConfirmOpen ? (
        <PublicationSaveConfirmDialog
          bundle={bundle}
          status={status}
          visibility={visibility}
          isSaving={isSavingPublication}
          error={saveError}
          onClose={() => {
            if (!isSavingPublication) setIsSaveConfirmOpen(false);
          }}
          onConfirm={() => void savePublication()}
        />
      ) : null}
    </div>
  );
}

function TemplatePhonePreview({ bundle }: { bundle: SystemTemplateBundle }) {
  return (
    <div
      className="mx-auto grid h-[min(62dvh,540px)] min-h-[340px] w-full max-w-[340px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[32px] border border-[var(--color-outline-variant)] bg-cover bg-center shadow-[0_22px_52px_rgba(42,103,103,0.14)]"
      style={{ backgroundColor: bundle.visual.chatBackgroundColor, backgroundImage: bundle.visual.chatBackgroundImage ? `url(${bundle.visual.chatBackgroundImage})` : undefined }}
    >
      <div className="flex h-14 items-center justify-between bg-white/90 px-5 text-sm font-black text-[var(--color-on-surface)]">
        <span>{bundle.title}</span>
        <Settings className="h-4 w-4" />
      </div>
      <div className="grid min-h-0 content-start gap-4 overflow-hidden p-4">
        <PreviewMessage visual={bundle.visual} mine={false} text="관리 화면에서 템플릿을 확인합니다." />
        <PreviewMessage visual={bundle.visual} mine text="Android와 iOS를 여기서 관리해요." />
        <PreviewMessage visual={bundle.visual} mine={false} text="저장된 색상과 이미지가 반영됩니다." />
      </div>
      <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 bg-white/90 px-3 py-2">
        <Plus className="h-5 w-5 justify-self-center text-[var(--color-on-surface-variant)]" />
        <span className="rounded-full bg-[var(--color-surface-low)] px-4 py-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">관리자 입력</span>
        <SendHorizontal className="h-5 w-5 justify-self-center text-[var(--color-on-surface-variant)]" />
      </div>
    </div>
  );
}

function MiniAvatar({ src }: { src?: string }) {
  return <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-container)]/55">{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-3.5 w-3.5 text-[var(--color-on-primary-container)]" />}</span>;
}

function PreviewMessage({ visual, mine, text }: { visual: TemplatePreviewVisual; mine: boolean; text: string }) {
  const bubbleImage = mine ? visual.myBubbleImage : visual.friendBubbleImage;
  return (
    <div className={`grid gap-1.5 ${mine ? "justify-items-end" : "grid-cols-[28px_minmax(0,1fr)] items-end"}`}>
      {!mine ? <MiniAvatar src={visual.profileImage} /> : null}
      <span
        className={`max-w-[84%] rounded-[18px] bg-[length:100%_100%] bg-no-repeat px-4 py-3 text-sm font-semibold leading-5 text-[var(--color-on-surface)] ${mine ? "justify-self-end" : ""}`}
        style={{ backgroundColor: bubbleImage ? "transparent" : mine ? visual.myBubbleFillColor : visual.friendBubbleFillColor, backgroundImage: bubbleImage ? `url(${bubbleImage})` : undefined }}
      >
        {text}
      </span>
    </div>
  );
}

function PublicationSaveConfirmDialog({
  bundle,
  status,
  visibility,
  isSaving,
  error,
  onClose,
  onConfirm,
}: {
  bundle: SystemTemplateBundle;
  status: SystemTemplateStatus;
  visibility: SystemTemplateVisibility;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const willAppearInGallery = status === "published" && visibility === "public";

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.48)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="publication-save-title">
      <section className="grid w-full max-w-[480px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)] sm:p-6">
        <div className="grid gap-3">
          <span className="w-fit rounded-full bg-[var(--color-primary-container)] px-3 py-1 text-xs font-black text-[var(--color-on-primary-container)]">저장 확인</span>
          <div>
            <h3 id="publication-save-title" className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">게시 설정을 변경할까요?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]"><strong className="text-[var(--color-on-surface)]">{bundle.title}</strong>의 설정을 아래와 같이 저장합니다.</p>
          </div>
          <dl className="grid gap-2 rounded-[18px] bg-[var(--color-surface-low)] p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="font-bold text-[var(--color-on-surface-variant)]">게시 상태</dt>
              <dd><PublicationTag kind="status" value={status} /></dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-bold text-[var(--color-on-surface-variant)]">공개 범위</dt>
              <dd><PublicationTag kind="visibility" value={visibility} /></dd>
            </div>
          </dl>
          <p className={`rounded-[16px] px-4 py-3 text-sm font-black leading-5 ${willAppearInGallery ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {willAppearInGallery ? "저장하면 일반 템플릿 갤러리에 노출됩니다." : "저장하면 일반 템플릿 갤러리에서 숨겨집니다."}
          </p>
          {error ? <p className="text-sm font-bold text-red-700" role="alert">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] disabled:opacity-50" onClick={onClose} disabled={isSaving}>
            취소
          </button>
          <button type="button" className="rounded-xl bg-[var(--color-inverse-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-inverse-on-surface)] disabled:cursor-wait disabled:opacity-60" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? "저장 중..." : "확인하고 저장"}
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteSystemTemplateDialog({
  bundle,
  platform,
  isDeleting,
  onClose,
  onConfirm,
}: {
  bundle: SystemTemplateBundle;
  platform?: ThemePlatform;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const targetLabel = platform ? `${bundle.title} ${platformLabel(platform)} variant` : `${bundle.title} 전체`;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="시스템 템플릿 삭제">
      <section className="grid w-full max-w-[440px] gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="grid gap-2">
          <span className="w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">삭제 확인</span>
          <h3 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--color-on-surface)]">{targetLabel}</h3>
          <p className="text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">삭제하면 관리자 목록과 템플릿 갤러리에서 사라집니다.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#334155]" onClick={onClose} disabled={isDeleting}>
            취소
          </button>
          <button type="button" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "삭제 중.." : "삭제"}
          </button>
        </div>
      </section>
    </div>
  );
}

function createBundles(templates: SystemTemplateSummary[], uploadPreviewUrls: SignedUrlCache): SystemTemplateBundle[] {
  const map = new Map<string, { id: string; variants: Partial<Record<ThemePlatform, SystemTemplateSummary>>; updatedAt: number }>();
  for (const template of templates) {
    const bundleId = template.bundleId ?? template.id;
    const current = map.get(bundleId);
    if (current) {
      current.variants[template.platform] = template;
      current.updatedAt = Math.max(current.updatedAt, template.updatedAt);
      continue;
    }
    map.set(bundleId, { id: bundleId, variants: { [template.platform]: template }, updatedAt: template.updatedAt });
  }

  return Array.from(map.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((bundle) => {
      const previewTemplate = bundle.variants.android ?? bundle.variants.ios!;
      const baseTemplate = themeTemplates.find((template) => template.id === previewTemplate.baseTemplateId) ?? themeTemplates[0];
      return {
        id: bundle.id,
        title: previewTemplate.title,
        description: previewTemplate.description,
        variants: bundle.variants,
        previewTemplate,
        status: previewTemplate.status,
        visibility: previewTemplate.visibility,
        tags: previewTemplate.tags ?? [],
        visual: createSystemTemplatePreviewVisual({
          template: baseTemplate,
          platform: previewTemplate.platform,
          summary: previewTemplate,
          signedUrls: uploadPreviewUrls,
        }),
        updatedAt: bundle.updatedAt,
      };
    });
}

function platformLabel(platform: ThemePlatform) {
  return platform === "android" ? "Android" : "iOS";
}
