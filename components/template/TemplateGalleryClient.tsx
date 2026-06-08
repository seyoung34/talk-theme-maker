"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import { templateStartStorageKey, themeTemplates, type ThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import { deleteUserTemplate, listUserTemplates, type UserTemplateSummary } from "@/lib/theme/userTemplates";
import type { ThemePlatform } from "@/lib/theme/types";

export default function TemplateGalleryClient() {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<ThemeTemplateId | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplateSummary[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedTemplate = themeTemplates.find((template) => template.id === selectedTemplateId) ?? null;

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
    <main className="min-h-screen bg-[#f7f8f5] text-[#111111]">
      <SiteHeader currentPath="/template" />

      <div className="grid gap-5 px-5 py-6 mx-auto max-w-7xl md:px-8 md:py-8">

        <section className="grid gap-4 px-5 py-2 md:px-6 ">
          <h1 className="mt-2 text-3xl font-black text-[#111111] md:text-4xl uppercase">template</h1>
          {notice ? (
            <div className="rounded-[16px] border border-[#d7ddd8] bg-[#f6f7f5] px-4 py-3 text-sm font-bold text-[#334155]">
              {notice}
            </div>
          ) : null}
        </section>

        {userTemplates.length > 0 ? (
          <section className="grid gap-4 rounded-[28px] border border-[#d7ddd8] bg-white px-5 py-5 shadow-[0_18px_60px_rgba(17,17,17,0.05)] md:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#5d6670]"></p>
                <h2 className="mt-1 text-2xl font-black text-[#111111]">내 템플릿</h2>
              </div>
            </div>

            <div className="grid gap-3 overflow-x-auto sm:grid-cols-2 xl:grid-cols-4">
              {userTemplates.map((template) => (
                <article
                  key={template.id}
                  className="grid min-h-[176px] content-between rounded-[20px] border border-[#d7ddd8] bg-[#f6f7f5] p-4 transition hover:border-[#111111] hover:bg-white"
                >
                  <div className="grid gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-base font-black text-[#111111]">{template.name}</strong>
                        <span className="mt-1 block text-xs font-bold text-[#5d6670]">
                          업로드 {template.uploadCount}개 · 색상 {template.colorCount}개
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`${template.name} 삭제`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#d7ddd8] bg-white text-[#5d6670] transition hover:border-[#ef4444] hover:text-[#b91c1c]"
                        onClick={(event) => handleDeleteUserTemplate(event, template)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#5d6670]">
                      <span className="rounded-full bg-white px-2.5 py-1">{template.platform === "android" ? "Android" : "iOS"}</span>
                      <span>{formatDate(template.updatedAt)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inline-flex w-fit rounded-full bg-white px-3.5 py-2 text-xs font-black border border-black/50 text-black hover:bg-[]"
                    onClick={() => startUserTemplate(template)}
                  >
                    편집 계속하기
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {themeTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="group grid min-h-[308px] content-between rounded-[24px] border border-[#d7ddd8] bg-white p-4 text-left shadow-[0_16px_42px_rgba(17,17,17,0.06)] transition hover:-translate-y-1 hover:border-[#111111]"
              onClick={() => setSelectedTemplateId(template.id)}
            >
              <div className="grid gap-4">
                <TemplateMiniPreview template={template} />
                <div>
                  <span className="mb-2 inline-flex rounded-full bg-[#eeee00] px-2.5 py-1 text-[11px] font-black">미리보기 가능</span>
                  <strong className="block text-2xl font-black text-[#111111]">{template.name}</strong>
                  <span className="mt-2 line-clamp-2 block text-sm font-semibold leading-6 text-[#5d6670]">{template.description}</span>
                </div>
              </div>

              <span className="mt-4 inline-flex w-fit rounded-full bg-[#111111] px-4 py-2.5 text-sm font-black text-white transition group-hover:bg-[#c9ff3d] group-hover:text-[#111111]">
                템플릿 확인
              </span>
            </button>
          ))}
        </section>
      </div>

      {selectedTemplate ? (
        <TemplatePreviewModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplateId(null)}
          onStart={(platform) => start(selectedTemplate, platform)}
        />
      ) : null}
    </main>
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#111111]/50 p-4" role="dialog" aria-modal="true" aria-label={`${template.name} 미리보기`}>
      <section className="grid max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[30px] bg-white shadow-2xl shadow-[#111111]/35">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d7ddd8] px-6 py-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#5d6670]">Template preview</p>
            <h2 className="mt-1 text-3xl font-black">{template.name}</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-[#5d6670]">{template.previewNote}</p>
          </div>
          <button className="rounded-full border border-[#d7ddd8] bg-[#f6f7f5] px-4 py-2 text-sm font-black text-[#5d6670] transition hover:bg-white" type="button" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="grid gap-6 p-6 lg:grid-cols-[380px_1fr]">
          <TemplatePhonePreview template={template} />
          <div className="grid content-between gap-4">
            <div className="grid gap-3">
              <InfoRow label="기본 채팅방 배경" value={template.defaults.chatBackground} />
              <InfoRow label="내 말풍선 색" value={template.defaults.myBubble} />
              <InfoRow label="상대 말풍선 색" value={template.defaults.friendBubble} />
              <InfoRow label="기본 시작 플랫폼" value={template.defaults.platform === "android" ? "Android" : "iOS"} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="rounded-full bg-[#111111] px-5 py-4 text-sm font-black text-white transition hover:scale-[0.98]" type="button" onClick={() => onStart("android")}>
                Android로 시작
              </button>
              <button className="rounded-full bg-[#c9ff3d] px-5 py-4 text-sm font-black text-[#111111] transition hover:scale-[0.98]" type="button" onClick={() => onStart("ios")}>
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
      className="h-40 overflow-hidden rounded-[18px] border border-[#d7ddd8] bg-cover bg-center"
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
      className="mx-auto grid h-[620px] w-full max-w-[350px] content-start overflow-hidden rounded-[32px] border border-[#d7ddd8] bg-cover bg-center shadow-2xl shadow-[#111111]/16"
      style={{ backgroundColor: template.defaults.chatBackground, backgroundImage: assets.chatBackground ? `url(${assets.chatBackground})` : undefined }}
    >
      <div className="flex items-center justify-between px-5 text-sm font-black h-14 bg-white/90">
        <span>테마 미리보기</span>
        <span className="text-xs text-[#5d6670]">{template.name}</span>
      </div>
      <div className="grid gap-4 p-4">
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
    <div className="rounded-[18px] bg-[#f6f7f5] px-4 py-3">
      <span className="block text-xs font-black uppercase text-[#5d6670]">{label}</span>
      <strong className="mt-1 block text-sm text-[#111111]">{value}</strong>
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
