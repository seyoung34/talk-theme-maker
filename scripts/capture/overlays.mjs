// 촬영용 화면 오버레이(자막·챕터·안전영역). `addInitScript`로 심으므로 **브라우저 안에서 단독으로
// 성립**해야 한다.
//
// ffmpeg `drawtext`가 아니라 DOM으로 그리는 이유는 둘이다. 윈도우 한글 폰트 문제를 피하고,
// 앱의 폰트를 그대로 써서 브랜드가 저절로 맞는다.

/** 인스타·틱톡 UI가 덮는 영역. 중요한 요소는 이 사이 중앙 밴드에 둔다. */
export const safeArea = { top: 0.14, bottom: 0.22 };

/**
 * `window.__capture`를 설치한다.
 *
 * 컨테이너를 **쓸 때마다 다시 확인해서 붙인다**. 한 번 만들어 두면 React 하이드레이션이
 * `<body>` 자식을 정리하면서 같이 사라진다(§2.6 4번에서 커서가 그렇게 없어졌다).
 * `<html>` 직속으로 옮기는 것은 답이 아니다 — 브라우저가 렌더하지 않는다.
 */
export function installCaptureOverlay({ safeTop, safeBottom }) {
  const ensureRoot = () => {
    let root = document.getElementById("__capture-overlay");
    if (root && root.isConnected) return root;
    root = document.createElement("div");
    root.id = "__capture-overlay";
    root.setAttribute("data-capture-overlay", "");
    root.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    document.body.appendChild(root);
    return root;
  };

  const slot = (name) => {
    const root = ensureRoot();
    let node = root.querySelector(`[data-slot="${name}"]`);
    if (!node) {
      node = document.createElement("div");
      node.dataset.slot = name;
      root.appendChild(node);
    }
    return node;
  };

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  window.__capture = {
    /** 자막. 하단 안전영역 **위**에 앉힌다 — 그 아래는 플랫폼 UI가 덮는다. */
    caption(text) {
      const node = slot("caption");
      if (!text) {
        node.innerHTML = "";
        return;
      }
      node.style.cssText = `position:absolute;left:0;right:0;bottom:${(safeBottom + 0.02) * 100}%;display:flex;justify-content:center;padding:0 6%`;
      node.innerHTML =
        `<span style="max-width:100%;box-sizing:border-box;background:rgba(12,18,28,0.82);color:#fff;` +
        `font:800 4.6vw/1.4 inherit;letter-spacing:-0.01em;padding:0.62em 1em;border-radius:0.9em;` +
        `text-align:center;word-break:keep-all;backdrop-filter:blur(6px)">${escapeHtml(text)}</span>`;
    },

    /** 씬 도입 카드. 화면 가운데를 덮으므로 안전영역과 무관하다. */
    chapter(title, description) {
      const node = slot("chapter");
      if (!title) {
        node.innerHTML = "";
        return;
      }
      node.style.cssText =
        "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
        "gap:0.5em;background:rgba(8,14,24,0.55);backdrop-filter:blur(10px);padding:0 8%;text-align:center";
      node.innerHTML =
        `<div style="color:#fff;font:900 7.4vw/1.2 inherit;letter-spacing:-0.02em">${escapeHtml(title)}</div>` +
        (description
          ? `<div style="color:rgba(255,255,255,0.82);font:700 4.2vw/1.45 inherit;word-break:keep-all">${escapeHtml(description)}</div>`
          : "");
    },

    /**
     * 누를 지점을 따라다니는 표시. 가이드 영상의 핵심이다 — 어디를 누르는지 보이지 않으면
     * 보는 사람이 자기 화면에서 같은 곳을 찾을 수 없다.
     *
     * `showActions`(screencast 전용)와 같은 역할을 DOM으로 한다. 그래야 해상도를 지키는
     * screenshot 백엔드에서도 표시가 나온다.
     *
     * **두 가지 모양을 쓴다.**
     * - `pointer`: 데스크톱. 마우스 화살표.
     * - `touch`: 모바일. 손끝 크기의 원. 폰 화면에 마우스 화살표를 그리면 실제로 존재하지 않는
     *   입력 장치를 가르치는 셈이 된다.
     *
     * 어느 쪽이든 밝은 채움 + 어두운 테두리 + 그림자로 그린다. 이 앱은 밝은 편집 화면과 어두운
     * 미리보기가 한 프레임에 같이 나오므로 한쪽 색만으로는 반드시 어딘가에서 묻힌다.
     */
    cursor({ x, y, kind = "pointer", size }) {
      const node = slot("cursor");
      const px = size ?? (kind === "touch" ? 44 : 26);
      if (node.dataset.kind !== kind) {
        node.dataset.kind = kind;
        node.style.cssText = "position:absolute;left:0;top:0;will-change:transform";
        node.innerHTML =
          kind === "touch"
            ? `<div style="width:${px}px;height:${px}px;border-radius:50%;box-sizing:border-box;` +
              `background:rgba(255,255,255,0.42);border:3px solid rgba(17,17,17,0.72);` +
              `box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`
            : `<svg width="${px}" height="${px}" viewBox="0 0 24 24" style="display:block;` +
              `filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45))">` +
              `<path d="M5 2.5 L5 19.5 L9.4 15.4 L12.2 21.4 L15.1 20 L12.3 14.2 L18.4 14.2 Z" ` +
              `fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
      }
      // 화살표는 뾰족한 끝이 지점을 가리키고, 손끝 원은 지점을 가운데 둔다.
      const offset = kind === "touch" ? px / 2 : 0;
      // transform으로 옮긴다. left/top을 쓰면 매 프레임 레이아웃이 다시 계산된다.
      node.style.transform = `translate3d(${x - offset}px, ${y - offset}px, 0)`;
    },

    cursorHide() {
      slot("cursor").innerHTML = "";
    },

    /**
     * 다음에 누를 곳을 사각형으로 감싼다. `null`이면 지운다.
     *
     * **커서와 역할이 겹치지 않는다.** 커서는 도착해야 어디인지 알 수 있고 가리키는 것이 한 점인데,
     * 박스는 커서가 출발하기 전에 미리 시선을 끌고 "이 목록 전체"처럼 영역을 가리킬 수 있다.
     *
     * 좌표는 **촬영이 클릭 직전에 잰 `boundingBox()`**다. 손으로 적지 않는 것이 요점이다 —
     * 가이드 페이지의 `EasyAnnotation`은 스크린샷 한 장에 맞춰 손으로 맞춘 상대 좌표라 편집기가
     * 바뀌면 조용히 엉뚱한 요소를 감쌌고, 실제로 그래서 스텝 4·6의 주석을 걷어냈다.
     *
     * 색은 가이드 페이지의 `EasyAnnotation` 강조와 같은 앰버다. 영상과 페이지가 같은 것을
     * 다른 색으로 가리키면 둘이 다른 뜻으로 보인다. 어두운 미리보기 위에서도 묻히지 않도록
     * 밝은 테두리 바깥에 어두운 실선을 한 겹 깐다 — 커서와 같은 이유다.
     */
    highlight(rect) {
      const node = slot("highlight");
      if (!rect) {
        node.innerHTML = "";
        return;
      }
      // 대상에 딱 붙이면 테두리가 내용과 겹쳐 읽기 나빠진다. 조금 띄운다.
      const pad = 6;
      node.style.cssText = "position:absolute;inset:0";
      node.innerHTML =
        `<div style="position:absolute;left:${rect.x - pad}px;top:${rect.y - pad}px;` +
        `width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;box-sizing:border-box;` +
        "border-radius:14px;border:3px solid #fbbf24;background:rgba(254,229,0,0.10);" +
        "box-shadow:0 0 0 1.5px rgba(17,17,17,0.45),0 0 0 7px rgba(251,191,36,0.18)," +
        '0 8px 20px rgba(0,0,0,0.22)"></div>';
    },

    /**
     * 클릭 파문. 커서만 있으면 "언제 눌렀는지"가 안 보인다.
     *
     * CSS 애니메이션으로 그린다. 배속 촬영 중에는 CDP가 이것도 함께 늦추고 인코딩이 시간축을
     * 되돌리므로, 최종 영상에서 의도한 속도로 퍼진다.
     */
    ripple(x, y) {
      const node = slot("ripple");
      if (!document.getElementById("__capture-ripple-css")) {
        const style = document.createElement("style");
        style.id = "__capture-ripple-css";
        style.textContent =
          "@keyframes __captureRipple{from{transform:translate(-50%,-50%) scale(0.35);opacity:0.9}" +
          "to{transform:translate(-50%,-50%) scale(1);opacity:0}}";
        (document.head ?? document.documentElement).appendChild(style);
      }
      const dot = document.createElement("span");
      dot.style.cssText =
        `position:absolute;left:${x}px;top:${y}px;width:56px;height:56px;border-radius:50%;` +
        "border:3px solid #2f6bbf;background:rgba(47,107,191,0.22);" +
        "animation:__captureRipple 620ms ease-out forwards";
      node.style.cssText = "position:absolute;inset:0";
      node.appendChild(dot);
      // 파문은 쌓이면 안 된다. 애니메이션이 끝난 것부터 걷어낸다.
      dot.addEventListener("animationend", () => dot.remove());
    },

    /** 안전영역 가늠자. 촬영 확인용이며 배포본에는 끄고 찍는다. */
    safeAreas(on) {
      const node = slot("safe");
      if (!on) {
        node.innerHTML = "";
        return;
      }
      node.style.cssText = "position:absolute;inset:0";
      const band = (side, ratio, label) =>
        `<div style="position:absolute;left:0;right:0;${side}:0;height:${ratio * 100}%;` +
        `background:rgba(255,0,80,0.14);border-${side === "top" ? "bottom" : "top"}:2px dashed rgba(255,0,80,0.75)">` +
        `<span style="position:absolute;${side === "top" ? "bottom" : "top"}:4px;left:8px;color:#ff0050;` +
        `font:800 3.2vw/1 inherit">${label}</span></div>`;
      node.innerHTML = band("top", safeTop, `상단 안전영역 ${Math.round(safeTop * 100)}%`) + band("bottom", safeBottom, `하단 안전영역 ${Math.round(safeBottom * 100)}%`);
    },
  };
}

/**
 * 배경·surface 토큰만 어둡게 내린다(릴스 전용).
 *
 * 화면의 90% 이상이 최고 휘도 구간에 몰려 있고 파랑이 빨강보다 4.5레벨 높다(계획서 §2.3).
 * 인스타·틱톡 압축은 밝고 평평한 면에서 밴딩이 잘 생기므로 화질에도 이득이다.
 *
 * **`filter: brightness()`를 화면 전체에 걸지 않는다.** 그러면 버튼과 브랜드 노랑까지 같이
 * 죽는다. 배경 계열 토큰만 값으로 바꿔서 대비와 브랜드 인상을 건드리지 않는다.
 * 가이드에는 절대 쓰지 않는다 — 제품 화면과 다르면 사용자가 자기 화면에서 같은 곳을 못 찾는다.
 */
export function applyToneDown(tokens) {
  const install = () => {
    const style = document.createElement("style");
    style.setAttribute("data-capture", "tone-down");
    style.textContent = `:root{${Object.entries(tokens).map(([name, value]) => `${name}:${value}`).join(";")}}`;
    (document.head ?? document.documentElement).appendChild(style);
  };
  if (document.head) install();
  else document.addEventListener("DOMContentLoaded", install, { once: true });
}

/**
 * 톤다운할 토큰의 기준값. `app/globals.css`의 `:root`와 같아야 한다.
 *
 * 배경·surface 계열만 고른다. `--color-primary-container`(브랜드 노랑)나 텍스트 토큰은 넣지 않는다.
 * 테두리로 쓰이는 `surface-high`/`highest`도 빼 둔다 — 어두워지면 선이 굵어 보인다.
 */
const toneDownBaseTokens = {
  "--color-background": "#e8f1ff",
  "--color-surface": "#ffffff",
  "--color-surface-bright": "#ffffff",
  "--color-surface-lowest": "#ffffff",
  "--color-surface-low": "#f7fbff",
  "--color-surface-container": "#eef5ff",
  "--color-surface-dim": "#e8f1ff",
  "--color-surface-variant": "#eef5ff",
};

/** `amount`만큼(0~1) 어둡게 민 토큰 값을 만든다. 색상환 위치는 유지한다. */
export function buildToneDownTokens(amount) {
  const scale = Math.max(0, Math.min(1, 1 - amount));
  const shift = (hex) => {
    const value = hex.replace("#", "");
    const channels = [0, 2, 4].map((i) => Math.round(parseInt(value.slice(i, i + 2), 16) * scale));
    return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };
  return Object.fromEntries(Object.entries(toneDownBaseTokens).map(([name, hex]) => [name, shift(hex)]));
}
