"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { templateStartStorageKey, themeTemplates, type ThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform } from "@/lib/theme/types";

export default function TemplateGalleryClient() {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<ThemeTemplateId | null>(null);
  const selectedTemplate = themeTemplates.find((template) => template.id === selectedTemplateId) ?? null;

  const start = (template: ThemeTemplate, platform: ThemePlatform) => {
    localStorage.setItem(templateStartStorageKey, JSON.stringify({ templateId: template.id, platform }));
    router.push("/edit");
  };

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-5 py-6 text-[#111111]">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="grid gap-5 rounded-[30px] border border-[#d7ddd8] bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.08)] md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#5d6670]">template first</p>
            <h1 className="mt-2 text-4xl font-black">템플릿 선택</h1>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-[#5d6670]">
              원하는 테마의 기본값을 먼저 고릅니다. 템플릿과 플랫폼은 편집 화면에 들어가면 고정되고, 정해진 Android/iOS 파일 슬롯만 교체합니다.
            </p>
          </div>
          <Link className="rounded-full border border-[#d7ddd8] bg-[#f6f7f5] px-5 py-3 text-sm font-black transition hover:bg-white" href="/">
            홈
          </Link>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          {themeTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="group grid min-h-[430px] content-between rounded-[28px] border border-[#d7ddd8] bg-white p-5 text-left shadow-[0_18px_60px_rgba(17,17,17,0.07)] transition hover:-translate-y-1 hover:border-[#111111]"
              onClick={() => setSelectedTemplateId(template.id)}
            >
              <TemplateMiniPreview template={template} />
              <span>
                <span className="mb-3 inline-flex rounded-full bg-[#eeee00] px-3 py-1 text-xs font-black">미리보기 가능</span>
                <strong className="block text-3xl font-black">{template.name}</strong>
                <span className="mt-3 block text-base font-bold leading-7 text-[#5d6670]">{template.description}</span>
              </span>
              <span className="mt-5 inline-flex w-fit rounded-full bg-[#111111] px-5 py-3 text-sm font-black text-white transition group-hover:bg-[#c9ff3d] group-hover:text-[#111111]">
                템플릿 확인
              </span>
            </button>
          ))}
        </section>
      </div>

      {selectedTemplate && (
        <TemplatePreviewModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplateId(null)}
          onStart={(platform) => start(selectedTemplate, platform)}
        />
      )}
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
      className="mb-6 h-56 overflow-hidden rounded-[18px] border border-[#d7ddd8] bg-cover bg-center"
      style={{ backgroundColor: template.defaults.chatBackground, backgroundImage: assets.chatBackground ? `url(${assets.chatBackground})` : undefined }}
    >
      <div className="h-10 bg-white/86" />
      <div className="grid gap-3 p-4">
        <span className="h-9 w-32 rounded-xl bg-white bg-[length:100%_100%] bg-no-repeat" style={{ backgroundImage: assets.friendBubble ? `url(${assets.friendBubble})` : undefined }} />
        <span className="h-9 w-36 justify-self-end rounded-xl bg-[length:100%_100%] bg-no-repeat" style={{ backgroundColor: template.defaults.myBubble, backgroundImage: assets.myBubble ? `url(${assets.myBubble})` : undefined }} />
        <span className="h-9 w-48 rounded-xl bg-[length:100%_100%] bg-no-repeat" style={{ backgroundColor: template.defaults.friendBubble, backgroundImage: assets.friendBubble ? `url(${assets.friendBubble})` : undefined }} />
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
      <div className="flex h-14 items-center justify-between bg-white/90 px-5 text-sm font-black">
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
