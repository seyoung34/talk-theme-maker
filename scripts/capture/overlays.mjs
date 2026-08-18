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
