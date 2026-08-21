import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { EasyStepMediaFrame } from "@/components/guide/EasyStepMedia";
import type { EasyStep, EasyStepMedia } from "@/lib/guide/content";

const label = "Android 설치하고 카톡에 적용하기 화면";
const videoMedia: EasyStepMedia = { type: "video", src: "/guide/android/05-install.webm", poster: "/guide/android/05-install.webp" };
const imageMedia: EasyStepMedia = { type: "image", src: "/guide/android/01-template-gallery.webp" };

/** 카드가 넘기는 스텝 모양. 테스트가 보는 것은 media 계열뿐이라 나머지는 고정한다. */
function step(media?: EasyStepMedia, mobileMedia?: EasyStepMedia): EasyStep {
  return { title: "설치하고 카톡에 적용하기", caption: "…", media, mobileMedia };
}

type FakeVideo = HTMLMediaElement & { _paused?: boolean };

const originalPlay = HTMLMediaElement.prototype.play;
const originalPause = HTMLMediaElement.prototype.pause;
const originalPausedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused");

let observerCallback: IntersectionObserverCallback | undefined;
let prefersReducedMotion = false;
/** `useViewportMode`가 보는 값. 편집기와 같은 1024px 기준이다. */
let isDesktop = true;
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
  isDesktop = true;
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
    matches: query.includes("prefers-reduced-motion: reduce")
      ? prefersReducedMotion
      : query.includes("min-width: 1024px")
        ? isDesktop
        : false,
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

describe("EasyStepMediaFrame - 자료 선택", () => {
  /**
   * 폰으로 가이드를 보는 사람은 대개 폰으로 편집도 한다. 데스크톱 편집기 화면을 보여 주면
   * 자기 화면에 없는 UI를 따라 하라고 시키는 셈이 된다.
   */
  it("좁은 화면에서는 모바일 자료를 쓴다", () => {
    isDesktop = false;
    const mobile: EasyStepMedia = { type: "image", src: "/guide/android/01-mobile.webp" };
    const { container } = render(<EasyStepMediaFrame step={step(imageMedia, mobile)} label={label} />);

    expect(container.querySelector("img")).toHaveAttribute("src", "/guide/android/01-mobile.webp");
  });

  it("넓은 화면에서는 데스크톱 자료를 쓴다", () => {
    const mobile: EasyStepMedia = { type: "image", src: "/guide/android/01-mobile.webp" };
    const { container } = render(<EasyStepMediaFrame step={step(imageMedia, mobile)} label={label} />);

    expect(container.querySelector("img")).toHaveAttribute("src", imageMedia.src);
  });

  it("모바일 자료가 없으면 좁은 화면에서도 기본 자료를 쓴다", () => {
    isDesktop = false;
    const { container } = render(<EasyStepMediaFrame step={step(imageMedia)} label={label} />);

    expect(container.querySelector("img")).toHaveAttribute("src", imageMedia.src);
  });

  /**
   * 회귀 방지: 칸이 `aspect-[16/9]`로 고정이던 시절에는 세로 자료를 넣으면 위아래가 잘렸다.
   * `object-cover`라 오류도 나지 않아 프레임을 열어 보기 전에는 알 수 없었다.
   */
  it("자료가 들고 있는 비율을 칸에 적용한다", () => {
    isDesktop = false;
    const mobile: EasyStepMedia = { type: "image", src: "/guide/android/01-mobile.webp", aspect: "9 / 16" };
    const { container } = render(<EasyStepMediaFrame step={step(imageMedia, mobile)} label={label} />);

    expect(container.firstElementChild).toHaveStyle({ aspectRatio: "9 / 16" });
  });

  it("비율을 적지 않으면 데스크톱 규격 16:9로 둔다", () => {
    const { container } = render(<EasyStepMediaFrame step={step(imageMedia)} label={label} />);

    expect(container.firstElementChild).toHaveStyle({ aspectRatio: "16 / 9" });
  });

  // 주석 좌표는 0~1 상대값이라 자료가 바뀌면 의미가 없어진다. 그래서 자료에 붙어 있어야 한다.
  it("주석은 지금 그리는 자료의 것을 쓴다", () => {
    isDesktop = false;
    const desktop: EasyStepMedia = { ...imageMedia, annotations: [{ kind: "pin", x: 0.9, y: 0.3, label: "데스크톱 표시" }] };
    const mobile: EasyStepMedia = { type: "image", src: "/m.webp", annotations: [{ kind: "pin", x: 0.5, y: 0.8, label: "모바일 표시" }] };
    const { queryByText } = render(<EasyStepMediaFrame step={step(desktop, mobile)} label={label} />);

    expect(queryByText("모바일 표시")).not.toBeNull();
    expect(queryByText("데스크톱 표시")).toBeNull();
  });

  it("자료가 아예 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<EasyStepMediaFrame step={step()} label={label} />);

    expect(container.firstElementChild).toBeNull();
  });
});

describe("EasyStepMediaFrame - 재생", () => {
  it("이미지 스텝은 그대로 그린다", () => {
    const { container } = render(<EasyStepMediaFrame step={step(imageMedia)} label={label} />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", imageMedia.src);
  });

  /**
   * 회귀 방지: 예전에는 영상도 `<img>`로 그렸다. 포스터가 있으면 정지 이미지만 보였고,
   * 없으면 영상 URL이 `<img src>`에 들어가 그냥 깨졌다.
   */
  it("영상 스텝은 실제 video로 그린다", () => {
    const { container } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);
    const video = container.querySelector("video");

    expect(video).toHaveAttribute("src", videoMedia.src);
    expect(video).toHaveAttribute("poster", "/guide/android/05-install.webp");
  });

  // 모바일 데이터로 여는 사람이 많다. 스텝마다 미리 받으면 페이지를 여는 것만으로 수 MB가 나간다.
  it("영상을 미리 받지 않는다", () => {
    const { container } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

    expect(container.querySelector("video")).toHaveAttribute("preload", "none");
  });

  it("소리 없이 반복 재생하고 전체화면으로 튀지 않는다", () => {
    const { container } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);
    const video = container.querySelector("video") as HTMLVideoElement;

    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    // happy-dom은 playsInline IDL 속성을 구현하지 않아 마크업으로 확인한다.
    expect(video).toHaveAttribute("playsinline");
  });

  it("축소 모션 설정에서는 포스터만 보여준다", () => {
    prefersReducedMotion = true;
    const { container } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/guide/android/05-install.webp");
  });

  it("영상 로드에 실패하면 포스터로 되돌린다", () => {
    const { container } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

    fireEvent.error(container.querySelector("video") as HTMLVideoElement);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/guide/android/05-install.webp");
  });

  it("화면에 들어오면 재생하고 벗어나면 멈춘다", () => {
    render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

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
    const { container } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

    intersect(true);

    expect(container.querySelector("video")).not.toBeNull();
  });

  it("버튼으로 멈추고 다시 재생한다", () => {
    const { getByRole } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

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
    const { getByRole } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

    intersect(true);
    fireEvent.click(getByRole("button", { name: `${label} 일시정지` }));

    intersect(false);
    intersect(true);

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  // 버튼을 눌렀는데도 재생이 안 되면 되살릴 방법이 없다. 그때만 포스터로 넘긴다.
  it("버튼으로 눌러도 재생이 막히면 포스터로 되돌린다", async () => {
    const { container, getByRole } = render(<EasyStepMediaFrame step={step(videoMedia)} label={label} />);

    playBlocked = true;
    // play()의 거절은 마이크로태스크로 돌아온다. 상태 반영까지 기다린다.
    await act(async () => {
      fireEvent.click(getByRole("button", { name: `${label} 재생` }));
    });

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", "/guide/android/05-install.webp");
  });
});
