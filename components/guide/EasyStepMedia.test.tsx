import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { EasyStepMediaFrame } from "@/components/guide/EasyStepMedia";
import type { EasyStepMedia } from "@/lib/guide/content";

const label = "Android 설치하고 카톡에 적용하기 화면";
const videoMedia: EasyStepMedia = { type: "video", src: "/guide/android/05-install.webm", poster: "/guide/android/05-install.webp" };
const imageMedia: EasyStepMedia = { type: "image", src: "/guide/android/01-template-gallery.webp" };

type FakeVideo = HTMLMediaElement & { _paused?: boolean };

const originalPlay = HTMLMediaElement.prototype.play;
const originalPause = HTMLMediaElement.prototype.pause;
const originalPausedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused");

let observerCallback: IntersectionObserverCallback | undefined;
let prefersReducedMotion = false;
let playBlocked = false;
let playSpy: Mock<() => void>;
let pauseSpy: Mock<() => void>;

/** IntersectionObserver 콜백을 직접 불러 스크롤 진입·이탈을 흉내 낸다. */
function intersect(isIntersecting: boolean) {
  act(() => {
    observerCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

beforeEach(() => {
  observerCallback = undefined;
  prefersReducedMotion = false;
  playBlocked = false;
  playSpy = vi.fn();
  pauseSpy = vi.fn();

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce") && prefersReducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;

  // happy-dom은 실제 재생을 하지 않으므로 paused 상태만 흉내 낸다. 자동재생이 막힌 환경은
  // play()가 거절 프라미스를 돌려주는 것으로 재현한다 — 브라우저가 실제로 하는 동작이다.
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: FakeVideo) {
      return this._paused ?? true;
    },
  });
  HTMLMediaElement.prototype.play = function (this: FakeVideo) {
    playSpy();
    if (playBlocked) return Promise.reject(new Error("autoplay blocked"));
    this._paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: FakeVideo) {
    pauseSpy();
    this._paused = true;
    this.dispatchEvent(new Event("pause"));
  };
});

afterEach(() => {
  // vitest.config.ts가 globals: false라 Testing Library의 자동 cleanup이 걸리지 않는다.
  cleanup();
  vi.unstubAllGlobals();
  HTMLMediaElement.prototype.play = originalPlay;
  HTMLMediaElement.prototype.pause = originalPause;
  if (originalPausedDescriptor) Object.defineProperty(HTMLMediaElement.prototype, "paused", originalPausedDescriptor);
});

describe("EasyStepMediaFrame", () => {
  it("이미지 스텝은 그대로 그린다", () => {
    const { container } = render(<EasyStepMediaFrame media={imageMedia} label={label} />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", imageMedia.src);
  });

  /**
   * 회귀 방지: 예전에는 영상도 `<img>`로 그렸다. 포스터가 있으면 정지 이미지만 보였고,
   * 없으면 영상 URL이 `<img src>`에 들어가 그냥 깨졌다.
   */
  it("영상 스텝은 실제 video로 그린다", () => {
    const { container } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);
    const video = container.querySelector("video");

    expect(video).toHaveAttribute("src", videoMedia.src);
    expect(video).toHaveAttribute("poster", "/guide/android/05-install.webp");
  });

  // 모바일 데이터로 여는 사람이 많다. 스텝마다 미리 받으면 페이지를 여는 것만으로 수 MB가 나간다.
  it("영상을 미리 받지 않는다", () => {
    const { container } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    expect(container.querySelector("video")).toHaveAttribute("preload", "none");
  });

  it("소리 없이 반복 재생하고 전체화면으로 튀지 않는다", () => {
    const { container } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);
    const video = container.querySelector("video") as HTMLVideoElement;

    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    // happy-dom은 playsInline IDL 속성을 구현하지 않아 마크업으로 확인한다.
    expect(video).toHaveAttribute("playsinline");
  });

  it("축소 모션 설정에서는 포스터만 보여준다", () => {
    prefersReducedMotion = true;
    const { container } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/guide/android/05-install.webp");
  });

  it("영상 로드에 실패하면 포스터로 되돌린다", () => {
    const { container } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    fireEvent.error(container.querySelector("video") as HTMLVideoElement);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/guide/android/05-install.webp");
  });

  it("화면에 들어오면 재생하고 벗어나면 멈춘다", () => {
    render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    intersect(true);
    expect(playSpy).toHaveBeenCalledTimes(1);

    intersect(false);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * 자동재생이 막혀도 포스터가 그대로 남을 뿐이라 실패로 보지 않는다. 여기서 폴백으로 넘겨
   * `<img>`를 그려 버리면 사용자가 재생 버튼으로 되살릴 방법이 사라진다.
   */
  it("자동재생이 막혀도 영상을 걷어내지 않는다", () => {
    playBlocked = true;
    const { container } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    intersect(true);

    expect(container.querySelector("video")).not.toBeNull();
  });

  it("버튼으로 멈추고 다시 재생한다", () => {
    const { getByRole } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    intersect(true);
    fireEvent.click(getByRole("button", { name: `${label} 일시정지` }));
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(getByRole("button", { name: `${label} 재생` }));
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  /**
   * 직접 멈춘 영상이 스크롤만으로 다시 켜지면, 멈추라는 조작이 통하지 않는 것과 같다.
   * 가이드는 스텝 카드가 세로로 이어져 있어 스크롤 중 진입·이탈이 계속 일어난다.
   */
  it("사용자가 멈춘 뒤에는 다시 들어와도 저절로 재생하지 않는다", () => {
    const { getByRole } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    intersect(true);
    fireEvent.click(getByRole("button", { name: `${label} 일시정지` }));

    intersect(false);
    intersect(true);

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  // 버튼을 눌렀는데도 재생이 안 되면 되살릴 방법이 없다. 그때만 포스터로 넘긴다.
  it("버튼으로 눌러도 재생이 막히면 포스터로 되돌린다", async () => {
    const { container, getByRole } = render(<EasyStepMediaFrame media={videoMedia} label={label} />);

    playBlocked = true;
    // play()의 거절은 마이크로태스크로 돌아온다. 상태 반영까지 기다린다.
    await act(async () => {
      fireEvent.click(getByRole("button", { name: `${label} 재생` }));
    });

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/guide/android/05-install.webp");
  });
});
