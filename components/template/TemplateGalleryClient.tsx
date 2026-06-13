"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Search } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import UserTemplateCard from "@/components/template/UserTemplateCard";
import { localSystemTemplateRepository, type SystemTemplateSummary } from "@/lib/theme/systemTemplates";
import { templateStartStorageKey, themeTemplates, type ThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import { deleteUserTemplate, listUserTemplates, type UserTemplateSummary } from "@/lib/theme/userTemplates";
import type { ThemePlatform } from "@/lib/theme/types";

export default function TemplateGalleryClient() {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<ThemeTemplateId | null>(null);
  const [selectedSystemTemplateId, setSelectedSystemTemplateId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplateSummary[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplateSummary[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedTemplate = themeTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedSystemTemplate = systemTemplates.find((template) => template.id === selectedSystemTemplateId) ?? null;
  const baseTemplates = themeTemplates.filter((template) => template.id === "basic");
  const seedSystemTemplates = themeTemplates.filter((template) => template.id === "spongebob");
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
    localSystemTemplateRepository
      .list()
      .then((templates) => {
        if (active) setSystemTemplates(templates);
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          setSystemTemplates([]);
          setNotice("System templates could not be loaded.");
        }
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
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ templateId: template.baseTemplateId, platform, systemTemplateId: template.id, editMode: "user" }));
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
                onClick={() => setSelectedTemplateId(baseTemplates[0]?.id ?? null)}
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
              <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">System Templates</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {seedSystemTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="group grid min-h-[356px] max-w-[420px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white/92 p-4 text-left shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <div className="grid gap-4">
                  <TemplateMiniPreview template={template} />
                  <div className="grid gap-2">
                    <span className="inline-flex w-fit rounded-full bg-[var(--color-tertiary-container)]/50 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-tertiary-container)]">System seed</span>
                    <strong className="font-[var(--font-display)] text-[28px] font-semibold leading-tight text-[var(--color-on-surface)]">{template.name}</strong>
                    <span className="line-clamp-2 text-sm leading-6 text-[var(--color-on-surface-variant)]">{template.description}</span>
                  </div>
                </div>

                <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)]">
                  Template preview
                  <ArrowRight className="w-4 h-4" />
                </span>
              </button>
            ))}

            {systemTemplates.map((template) => (
              <SystemTemplateCard key={template.id} template={template} onPreview={setSelectedSystemTemplateId} />
            ))}
          </div>
        </section>

        <section className="grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>

              <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">기본 템플릿</h2>

            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {baseTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="group grid min-h-[356px] max-w-[420px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white/92 p-4 text-left shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]"
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <div className="grid gap-4">
                  <TemplateMiniPreview template={template} />
                  <div className="grid gap-2">
                    <span className="inline-flex w-fit rounded-full bg-[var(--color-tertiary-container)]/50 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-tertiary-container)]">
                      미리보기 가능
                    </span>
                    <strong className="font-[var(--font-display)] text-[28px] font-semibold leading-tight text-[var(--color-on-surface)]">{template.name}</strong>
                    <span className="line-clamp-2 text-sm leading-6 text-[var(--color-on-surface-variant)]">{template.description}</span>
                  </div>
                </div>

                <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-on-primary-container)]">
                  템플릿 확인
                  <ArrowRight className="w-4 h-4" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {selectedTemplate ? (
        <TemplatePreviewModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplateId(null)}
          onStart={(platform) => start(selectedTemplate, platform)}
        />
      ) : null}
      {selectedSystemTemplate ? (
        <SystemTemplatePreviewModal
          template={selectedSystemTemplate}
          onClose={() => setSelectedSystemTemplateId(null)}
          onStart={(platform) => startSystemTemplateWithPlatform(selectedSystemTemplate, platform)}
        />
      ) : null}
    </main>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] bg-[var(--color-surface-low)] px-4 py-3">
      <span className="text-sm font-semibold text-[var(--color-on-surface-variant)]">{label}</span>
      <strong className="text-sm font-black text-[var(--color-on-surface)]">{value}</strong>
    </div>
  );
}

function SystemTemplateCard({ template, onPreview }: { template: SystemTemplateSummary; onPreview: (templateId: string) => void }) {
  return (
    <article className="grid min-h-[244px] max-w-[420px] content-between rounded-[28px] border border-[var(--color-outline-variant)] bg-white/92 p-4 shadow-[0_16px_36px_rgba(42,103,103,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(42,103,103,0.12)]">
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex w-fit rounded-full bg-[var(--color-tertiary-container)]/50 px-2.5 py-1 text-[11px] font-black text-[var(--color-on-tertiary-container)]">System</span>
          <span className="rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-[11px] font-black uppercase text-[var(--color-on-surface-variant)]">{template.platform}</span>
        </div>
        <div className="grid gap-2">
          <strong className="font-[var(--font-display)] text-[26px] font-semibold leading-tight text-[var(--color-on-surface)]">{template.title}</strong>
          {template.description ? <span className="line-clamp-2 text-sm leading-6 text-[var(--color-on-surface-variant)]">{template.description}</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatusRow label="Colors" value={`${template.colorCount}`} />
          <StatusRow label="Uploads" value={`${template.uploadCount}`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--color-surface-low)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-on-surface-variant)]">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-white px-4 py-2.5 text-sm font-black text-[var(--color-on-surface)] transition hover:bg-[var(--color-primary-container)] hover:text-[var(--color-on-primary-container)]"
        onClick={() => onPreview(template.id)}
      >
        Template preview
        <ArrowRight className="w-4 h-4" />
      </button>
    </article>
  );
}

function SystemTemplatePreviewModal({
  template,
  onClose,
  onStart,
}: {
  template: SystemTemplateSummary;
  onClose: () => void;
  onStart: (platform: ThemePlatform) => void;
}) {
  const baseTemplate = themeTemplates.find((item) => item.id === template.baseTemplateId) ?? themeTemplates[0];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.55)] p-4" role="dialog" aria-modal="true" aria-label={`${template.title} preview`}>
      <section className="grid max-h-[calc(100dvh-24px)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_64px_rgba(42,103,103,0.2)] sm:max-h-[calc(100dvh-32px)] sm:rounded-[32px]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-outline-variant)] px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">System template preview</p>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold leading-tight text-[var(--color-on-surface)] sm:text-3xl">{template.title}</h2>
            {template.description ? <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-[var(--color-on-surface-variant)] sm:text-sm">{template.description}</p> : null}
          </div>
          <button className="shrink-0 rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:bg-white sm:px-4 sm:text-sm" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="grid min-h-0 gap-3 p-3 sm:grid-cols-[minmax(220px,0.82fr)_minmax(260px,1fr)] sm:p-4 lg:grid-cols-[340px_1fr]">
          <TemplatePhonePreview template={baseTemplate} />
          <div className="grid min-h-0 content-between gap-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <InfoRow label="Base" value={template.baseTemplateId} />
              <InfoRow label="Saved platform" value={template.platform === "android" ? "Android" : "iOS"} />
              <InfoRow label="Colors" value={`${template.colorCount}`} />
              <InfoRow label="Uploads" value={`${template.uploadCount}`} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="rounded-full bg-[var(--color-inverse-surface)] px-4 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] transition hover:scale-[0.98]" type="button" onClick={() => onStart("android")}>
                Android start
              </button>
              <button className="rounded-full bg-[var(--color-primary-container)] px-4 py-3 text-sm font-black text-[var(--color-on-primary-container)] transition hover:scale-[0.98]" type="button" onClick={() => onStart("ios")}>
                iOS start
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TemplatePreviewModal({
  template,
  onClose,
  onStart,
}: {
  template: ThemeTemplate;
  onClose: () => void;
  onStart: (platform: ThemePlatform) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:rgba(27,28,25,0.55)] p-4" role="dialog" aria-modal="true" aria-label={`${template.name} 미리보기`}>
      <section className="grid max-h-[calc(100dvh-24px)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_64px_rgba(42,103,103,0.2)] sm:max-h-[calc(100dvh-32px)] sm:rounded-[32px]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-outline-variant)] px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Template preview</p>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold leading-tight text-[var(--color-on-surface)] sm:text-3xl">{template.name}</h2>
            <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-[var(--color-on-surface-variant)] sm:text-sm">{template.previewNote}</p>
          </div>
          <button className="shrink-0 rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] px-3 py-2 text-xs font-black text-[var(--color-on-surface-variant)] transition hover:bg-white sm:px-4 sm:text-sm" type="button" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="grid min-h-0 gap-3 p-3 sm:grid-cols-[minmax(220px,0.82fr)_minmax(260px,1fr)] sm:p-4 lg:grid-cols-[340px_1fr]">
          <TemplatePhonePreview template={template} />
          <div className="grid min-h-0 content-between gap-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <InfoRow label="기본 채팅방 배경" value={template.defaults.chatBackground} />
              <InfoRow label="내 말풍선 색" value={template.defaults.myBubble} />
              <InfoRow label="상대 말풍선 색" value={template.defaults.friendBubble} />
              <InfoRow label="기본 시작 플랫폼" value={template.defaults.platform === "android" ? "Android" : "iOS"} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="rounded-full bg-[var(--color-inverse-surface)] px-4 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] transition hover:scale-[0.98]" type="button" onClick={() => onStart("android")}>
                Android로 시작
              </button>
              <button className="rounded-full bg-[var(--color-primary-container)] px-4 py-3 text-sm font-black text-[var(--color-on-primary-container)] transition hover:scale-[0.98]" type="button" onClick={() => onStart("ios")}>
                iOS로 시작
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TemplateMiniPreview({ template }: { template: ThemeTemplate }) {
  const assets = spongebobPreviewAssets(template);
  return (
    <div
      className="aspect-[4/3] overflow-hidden rounded-[22px] border border-[var(--color-outline-variant)] bg-cover bg-center shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
      style={{ backgroundColor: template.defaults.chatBackground, backgroundImage: assets.chatBackground ? `url(${assets.chatBackground})` : undefined }}
    >
      <div className="h-8 bg-white/86" />
      <div className="grid gap-2.5 p-3">
        <span className="h-7 w-24 rounded-xl bg-white bg-[length:100%_100%] bg-no-repeat" style={{ backgroundImage: assets.friendBubble ? `url(${assets.friendBubble})` : undefined }} />
        <span className="h-7 w-28 justify-self-end rounded-xl bg-[length:100%_100%] bg-no-repeat" style={{ backgroundColor: template.defaults.myBubble, backgroundImage: assets.myBubble ? `url(${assets.myBubble})` : undefined }} />
        <span className="h-7 w-36 rounded-xl bg-[length:100%_100%] bg-no-repeat" style={{ backgroundColor: template.defaults.friendBubble, backgroundImage: assets.friendBubble ? `url(${assets.friendBubble})` : undefined }} />
      </div>
    </div>
  );
}

function TemplatePhonePreview({ template }: { template: ThemeTemplate }) {
  const assets = spongebobPreviewAssets(template);
  return (
    <div
      className="mx-auto grid h-[min(48dvh,500px)] min-h-[250px] w-full max-w-[310px] content-start overflow-hidden rounded-[28px] border border-[var(--color-outline-variant)] bg-cover bg-center shadow-[0_22px_52px_rgba(42,103,103,0.14)] sm:h-[min(68dvh,540px)] sm:max-w-[330px] sm:rounded-[32px] lg:max-w-[340px]"
      style={{ backgroundColor: template.defaults.chatBackground, backgroundImage: assets.chatBackground ? `url(${assets.chatBackground})` : undefined }}
    >
      <div className="flex h-12 items-center justify-between px-4 text-xs font-black bg-white/90 sm:h-14 sm:px-5 sm:text-sm">
        <span>테마 미리보기</span>
        <span className="text-xs text-[var(--color-on-surface-variant)]">{template.name}</span>
      </div>
      <div className="grid gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="justify-self-center rounded-full bg-[#14343a]/18 px-5 py-1 text-xs font-bold text-white">Today</div>
        <span className="max-w-[80%] rounded-xl bg-white bg-[length:100%_100%] bg-no-repeat px-4 py-3 text-sm" style={{ backgroundImage: assets.friendBubble ? `url(${assets.friendBubble})` : undefined }}>
          상대 말풍선
        </span>
        <span className="max-w-[80%] justify-self-end rounded-xl bg-[length:100%_100%] bg-no-repeat px-4 py-3 text-sm" style={{ backgroundColor: template.defaults.myBubble, backgroundImage: assets.myBubble ? `url(${assets.myBubble})` : undefined }}>
          내 말풍선
        </span>
        <span className="max-w-[82%] rounded-xl bg-[length:100%_100%] bg-no-repeat px-4 py-3 text-sm" style={{ backgroundColor: template.defaults.friendBubble, backgroundImage: assets.friendBubble ? `url(${assets.friendBubble})` : undefined }}>
          템플릿 기본값으로 시작합니다.
        </span>
      </div>
    </div>
  );
}

function spongebobPreviewAssets(template: ThemeTemplate) {
  if (template.id !== "spongebob") return {};
  return {
    chatBackground: "/template-assets/spongebob/android/theme_chatroom_background_image.png",
    myBubble: "/template-assets/spongebob/android/theme_chatroom_bubble_me_01_image.9.png",
    friendBubble: "/template-assets/spongebob/android/theme_chatroom_bubble_you_01_image.9.png",
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
