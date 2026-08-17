"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { EasyStepMedia } from "@/lib/guide/content";

const stepMediaClassName = "h-full w-full object-cover object-top";

/**
 * 스텝 카드가 감싸는 `aspect-[16/9]` 컨테이너 안을 채우는 화면 자료.
 *
 * 정지 화면 한 장으로 끝나는 경우가 세 가지다 — 원래 이미지 스텝, 축소 모션 설정, 재생 실패.
 * 셋을 같은 `<img>` 하나로 모아 두면 분기마다 폴백을 따로 두지 않아도 되고, 정지 화면을
 * 그리는 방식이 한 곳에서만 바뀐다.
 *
 * 축소 모션 여부는 서버 렌더에서 알 수 없어 첫 렌더는 항상 영상 쪽으로 간다. `preload="none"`
 * 이라 마운트 직후 `<img>`로 바뀌기 전까지 받아오는 바이트는 없다.
 */
export function EasyStepMediaFrame({ media, label }: { media: EasyStepMedia; label: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);

  if (media.type === "video" && !prefersReducedMotion && !videoFailed) {
    return <EasyStepVideo media={media} label={label} onFail={() => setVideoFailed(true)} />;
  }

  return <img src={media.type === "video" ? media.poster : media.src} alt={label} className={stepMediaClassName} loading="lazy" />;
}

/**
 * 스텝 영상. 소리가 없고, 화면에 들어오면 재생하고 벗어나면 멈춘다.
 *
 * `preload="none"`은 모바일 데이터를 위한 것이다. 한 페이지에 스텝이 여럿이라 전부 미리 받으면
 * 페이지를 여는 것만으로 수 MB가 나간다. 가이드를 여는 사람 상당수가 테마를 적용하려고 폰을
 * 들고 있는 상황이라 그 비용이 그대로 체감된다.
 *
 * 재생이 실패하면 포스터로 되돌린다. muted 자동재생조차 막는 환경(절전 모드 등)에서 빈 검은
 * 화면을 남기는 것보다 정지 이미지가 낫고, 그 이미지만으로도 스텝 설명은 성립한다.
 */
function EasyStepVideo({ media, label, onFail }: { media: Extract<EasyStepMedia, { type: "video" }>; label: string; onFail: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // 직접 멈춘 뒤에는 스크롤로 다시 들어와도 저절로 재생하지 않는다.
  const pausedByUser = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) video.pause();
          // 자동재생이 막히면 포스터가 그대로 남는다. 실패로 보고 갈아 끼우지 않는 이유는
          // 사용자가 재생 버튼을 눌러 되살릴 수 있기 때문이다.
          else if (!pausedByUser.current) video.play().catch(() => {});
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      pausedByUser.current = true;
      video.pause();
      return;
    }
    pausedByUser.current = false;
    // 버튼을 눌렀는데도 재생이 안 되면 되살릴 방법이 없다. 그때는 포스터로 넘긴다.
    video.play().catch(onFail);
  };

  return (
    <>
      <video
        ref={videoRef}
        src={media.src}
        poster={media.poster}
        className={stepMediaClassName}
        aria-label={label}
        muted
        loop
        playsInline
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={onFail}
      />
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={`${label} ${playing ? "일시정지" : "재생"}`}
        className="absolute bottom-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-[#191600]/70 text-white backdrop-blur transition hover:bg-[#191600]/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
    </>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}
