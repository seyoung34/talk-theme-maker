import type { Metadata } from "next";

/**
 * 검색·공유 메타데이터의 단일 출처.
 *
 * canonical과 sitemap은 절대 URL을 만들어야 하는데, 잘못된 도메인이 박히면 색인이 통째로 어긋난다.
 * `NEXT_PUBLIC_*`은 **빌드 시점에 인라인**되므로, 배포 빌드가 개발자의 `.env.local`을 물고 돌면
 * `http://localhost:3000`이 그대로 운영에 나간다. 틀린 canonical은 없는 canonical보다 나쁘다.
 *
 * 그래서 개발 호스트는 공개 URL 생성에서 제외한다. 로컬·E2E 빌드에서는 canonical·og:url·sitemap이
 * 아예 나오지 않으며, 그 자체가 "이 빌드는 운영 설정이 아니다"라는 신호다.
 *
 * 운영 도메인은 `https://talktheme.shop`(non-www)이고 trailing slash는 쓰지 않는다.
 * 실제 배포 확인 2026-07-27: `/guide/` → 308 → `/guide`.
 */
const developmentHosts = new Set(["localhost", "127.0.0.1"]);

function resolvePublicOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (developmentHosts.has(parsed.hostname)) return null;
  return parsed.origin;
}

/** 공개 절대 URL을 만들 수 있는 origin. 운영 설정이 아니면 `null`이다. */
export const publicSiteOrigin = resolvePublicOrigin();

export const siteName = "TalkTheme";

export const siteTitleDefault = "TalkTheme — 내 사진으로 만드는 카카오톡 테마";

/**
 * 검색결과 스니펫과 공유 카드에 그대로 나가는 문구다.
 *
 * 네이버 서치어드바이저가 80자 이내를 권한다. 이전 문구는 그 한도를 넘었고, 뒷문장이
 * `Android APK`·`iOS 테마 파일` 같은 용어를 써서 일반 사용자에게 와닿지 않았다.
 * 무엇을 할 수 있는지 한 문장으로만 말한다.
 */
export const siteDescription = "좋아하는 사진과 최애로 나만의 카카오톡 테마를 만들어 보세요.";

export const metadataBaseUrl = publicSiteOrigin ? new URL(publicSiteOrigin) : undefined;

/**
 * 검색엔진 소유확인 토큰.
 *
 * Search Console·서치어드바이저에 사이트를 등록해야 "어떤 검색어로 몇 번 노출됐는지"를 볼 수 있고
 * sitemap을 직접 제출할 수 있다. 등록의 첫 단계가 소유확인이다.
 *
 * **네이버 토큰은 환경변수가 아니라 소스에 둔다.** 빌드 변수로 두면 두 겹의 함정을 지난다.
 * ① 이 앱은 Cloudflare Worker에서 요청마다 렌더되는데 Workers Builds의 빌드 변수는 런타임
 * 환경에 없다. `NEXT_PUBLIC_` 접두사가 붙어 빌드 시점에 문자열로 치환돼야만 살아남는다.
 * ② 접두사를 붙여도 빌드 캐시가 이전 컴파일 결과(값이 `undefined`인)를 재사용한다.
 * 환경변수 값만 바뀌는 것은 webpack 캐시를 무효화하지 못한다. 실제로 두 번 연속 조용히 실패했다.
 *
 * 이 값은 비밀이 아니고(HTML에 그대로 노출된다) 도메인이 바뀌지 않는 한 고정이라, 소스에 두면
 * 위 경로가 통째로 사라진다. 환경마다 달라야 하는 `NEXT_PUBLIC_SITE_URL`과는 성격이 다르다.
 *
 * 구글은 Cloudflare DNS TXT 레코드로 도메인 속성을 확인했다(2026-07-27). 아래 환경변수는
 * 나중에 URL 접두어 속성이 필요해질 때를 위한 자리로만 남겨 둔다.
 */
const naverSiteVerificationToken = "e7f694cbb4f4468394e37661ad17dc08e8344596";

function normalizeVerificationToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const googleSiteVerification = normalizeVerificationToken(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION);
export const naverSiteVerification = naverSiteVerificationToken;

/** 값이 하나도 없으면 `undefined`를 돌려 metadata에 빈 `verification` 키가 생기지 않게 한다. */
export function createVerificationMetadata(): Metadata["verification"] {
  const other = naverSiteVerification ? { "naver-site-verification": naverSiteVerification } : undefined;
  if (!googleSiteVerification && !other) return undefined;
  return {
    ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
    ...(other ? { other } : {}),
  };
}

/**
 * 색인 대상 공개 페이지. sitemap과 각 페이지 canonical이 같은 목록을 쓴다.
 * 개인화·인증·관리자 화면은 여기 넣지 않고 `createPrivatePageMetadata`로 막는다.
 */
export const indexablePaths = [
  { path: "/", changeFrequency: "weekly" as const, priority: 1 },
  { path: "/template", changeFrequency: "daily" as const, priority: 0.9 },
  { path: "/guide", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/support", changeFrequency: "monthly" as const, priority: 0.4 },
  // 상세는 넣지 않는다. 개별 공지가 늘어날 때마다 sitemap을 다시 계산해야 하고, 목록에서
  // 모두 링크되므로 크롤러가 도달하는 데 문제가 없다.
  { path: "/notice", changeFrequency: "weekly" as const, priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/refund", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/copyright", changeFrequency: "yearly" as const, priority: 0.3 },
];

/**
 * 크롤링 자체를 막을 경로. 인증 경계가 권위이고 이건 크롤 예산 낭비를 줄이는 보조 장치다.
 * 공개 가능하지만 색인만 막고 싶은 화면은 disallow가 아니라 `noindex`를 쓴다.
 * 크롤링을 막으면 검색엔진이 그 페이지의 `noindex`를 읽지 못한다.
 *
 * `/admin-login`은 인증 없이 열리는 HTML 화면이라 여기 넣지 않고 `noindex`로 막는다.
 */
export const disallowedCrawlPaths = ["/api/", "/admin/", "/dev/", "/auth/"];

export function absoluteUrl(path: string): string | undefined {
  if (!publicSiteOrigin) return undefined;
  return new URL(path, publicSiteOrigin).toString();
}

type PublicPageMetadataOptions = {
  /** 접미사 없는 순수 제목. 루트 layout의 `%s | TalkTheme` 템플릿을 탄다. */
  title: string;
  description: string;
  path: string;
  /** 랜딩처럼 접미사가 겹치면 안 되는 완성형 제목. */
  absoluteTitle?: string;
};

/**
 * 공개 페이지 메타데이터를 한 곳에서 만든다.
 *
 * 페이지마다 `title`만 덮으면 Open Graph는 루트의 값을 그대로 물려받아 모든 공유 카드가 같아진다.
 * 카카오톡·인스타 DM 공유가 주요 유입 경로라 이게 그대로 손실이 된다. 제목·설명·URL을 함께 맞춘다.
 */
export function createPublicPageMetadata({ title, description, path, absoluteTitle }: PublicPageMetadataOptions): Metadata {
  const shareTitle = absoluteTitle ?? `${title} | ${siteName}`;
  const url = absoluteUrl(path);

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    ...(url ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type: "website",
      siteName,
      locale: "ko_KR",
      title: shareTitle,
      description,
      ...(url ? { url } : {}),
    },
    twitter: { card: "summary_large_image", title: shareTitle, description },
  };
}

/**
 * 개인화·인증 화면. 색인은 막되 크롤링은 막지 않는다.
 * robots.txt로 크롤링까지 막으면 검색엔진이 이 `noindex`를 읽지 못한다.
 */
export function createPrivatePageMetadata(title: string, description: string): Metadata {
  return { title, description, robots: { index: false, follow: false } };
}
