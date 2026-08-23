"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Pause, Play } from "lucide-react";
import { useViewportMode } from "@/components/project/hooks/useViewportMode";
import type { EasyStep, EasyStepMedia } from "@/lib/guide/content";

const stepMediaClassName = "h-full w-full object-cover object-top";

/**
 * 자료가 화면 높이를 넘지 않도록 **폭을 높이로부터 거꾸로 정한다.**
 *
 * 세로 배치로 바꾸면서 자료가 카드 폭을 전부 쓴다. 그런데 비율이 고정이라 폭이 넓어지면 높이도
 * 같이 커진다 — 1216px 폭의 16:9는 684px 높이다. 노트북 화면에서는 제목이 위로 밀려 나가고
 * 무슨 단계를 보고 있는지 모르는 채 화면만 남는다.
 *
 * 그래서 폭 대신 **뷰포트 높이**를 기준으로 잡는다. 모니터가 크면 자료도 커지고, 작으면 제목과
 * 함께 보이는 크기까지 줄어든다. 가로 자료가 세로보다 여유가 적은 이유는 같은 높이에서 폭을
 * 훨씬 많이 쓰기 때문이다.
 *
 * `vh`가 아니라 `svh`인 것은 모바일 주소창이 접혔다 펴질 때 자료 크기가 출렁이지 않게 하려는
 * 것이다. 가이드를 보는 사람 상당수가 폰으로 스크롤하며 읽는다.
 */
const heightCapSvh = { landscape: 68, portrait: 72 };

function frameStyle(aspect: string | undefined) {
  const value = aspect ?? "16 / 9";
  const [width, height] = value.split("/").map((part) => Number(part.trim()));
  const ratio = Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : 16 / 9;
  const cap = ratio >= 1 ? heightCapSvh.landscape : heightCapSvh.portrait;
  // 카드가 좁으면 카드가 이기고, 화면이 낮으면 높이 제한이 이긴다.
  return { aspectRatio: value, width: `min(100%, calc(${cap}svh * ${ratio.toFixed(4)}))` };
}

/**
 * 스텝 카드의 화면 자료 칸. 비율·자료 선택·주석을 함께 책임진다.
 *
 * 셋을 한곳에 두는 이유는 **셋이 같이 움직이기 때문**이다. 좁은 화면에서 다른 자료를 고르면
 * 비율도 주석 좌표도 함께 바뀐다. 카드가 비율을 정하고 자료만 갈아 끼우는 구조였다면 세로 자료가
 * 16:9 칸에서 오류 없이 잘렸을 것이다.
 */
export function EasyStepMediaFrame({ step, label }: { step: EasyStep; label: string }) {
  const viewport = useViewportMode();
  /**
   * 편집기와 **같은 기준(1024px)** 으로 가른다. 폰으로 가이드를 보는 사람에게 보여줄 것은
   * 그 사람이 실제로 쓰게 될 편집기 화면이어야 한다. 기준이 어긋나면 화면에 없는 UI를 따라
   * 하라고 시키는 꼴이 된다.
   *
   * `pending`(마운트 전)에는 서버 렌더와 같은 선택을 해서 깜빡임을 만들지 않는다.
   */
  const media = viewport === "mobile" && step.mobileMedia ? step.mobileMedia : step.media;
  if (!media) return null;

  // `w-full`을 함께 두는 것은 폴백이다. `svh`를 모르는 브라우저는 인라인 width를 통째로 버리는데,
  // 그때 폭이 auto가 되면 안쪽 `w-full` 자료와 서로를 참조해 크기가 무너진다.
  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-2xl" style={frameStyle(media.aspect)}>
      <StepMedia media={media} label={label} />
      {media.annotations?.map((annotation, index) =>
        annotation.kind === "highlight" ? (
          <div
            key={index}
            className="pointer-events-none absolute"
            style={{
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              width: `${(annotation.w ?? 0.1) * 100}%`,
              height: `${(annotation.h ?? 0.06) * 100}%`,
            }}
          >
            <span className="absolute inset-0 rounded-[10px] border-[2.5px] border-[#fbbf24] bg-[#fee500]/10" />
            {annotation.label ? (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-[#191600] px-2.5 py-1 text-[11px] font-black text-[#fee500] shadow-sm">
                {annotation.label}
              </span>
            ) : null}
          </div>
        ) : (
          <div
            key={index}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-[#2f6bbf] px-2.5 py-1 text-[11px] font-black text-white shadow-[0_6px_16px_rgba(47,107,191,0.3)]">
              <MapPin size={12} aria-hidden="true" />
              {annotation.label}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * 이미지는 그대로 그리고, 영상은 조건이 맞을 때만 실제 `<video>`로 그린다.
 *
 * 정지 화면 한 장으로 끝나는 경우가 세 가지다 — 원래 이미지 스텝, 축소 모션 설정, 재생 실패.
 * 셋을 같은 `<img>` 하나로 모아 두면 분기마다 폴백을 따로 두지 않아도 되고, 정지 화면을
 * 그리는 방식이 한 곳에서만 바뀐다.
 *
 * 축소 모션 여부는 서버 렌더에서 알 수 없어 첫 렌더는 항상 영상 쪽으로 간다. `preload="none"`
 * 이라 마운트 직후 `<img>`로 바뀌기 전까지 받아오는 바이트는 없다.
 */
function StepMedia({ media, label }: { media: EasyStepMedia; label: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);

  if (media.type === "video" && !prefersReducedMotion && !videoFailed) {
    return <EasyStepVideo media={media} label={label} onFail={() => setVideoFailed(true)} />;
  }

  // 포스터 폴백을 영상 쪽에 따로 두지 않고 여기로 모은다. 축소 모션·재생 실패·정적 이미지가
  // 모두 "정지 화면 한 장"이라 같은 태그를 쓰는 것이 맞고, `<img>` 사용처도 하나로 유지된다.
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
