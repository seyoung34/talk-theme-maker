import { type Locator, type Page } from "@playwright/test";

/**
 * 템플릿 갤러리 카드.
 *
 * `TemplateCard`는 `<article>` 안에 카드 전체를 덮는 오버레이 `<button>`(`absolute inset-0 z-10`)을 둔다.
 * 그래서 카드 자체를 클릭하면 그 버튼이 눌린다.
 *
 * 예전에는 `<article>`에 `role="button"`이 붙어 있어 스펙이 `article[role="button"]`으로 찾았다.
 * 마크업이 바뀐 뒤에도 선택자가 그대로 남아 스펙이 조용히 어긋났고, 갤러리가 비어 있는 E2E 환경에서는
 * 빈 상태 분기로 빠져 한동안 드러나지도 않았다. 카드를 찾는 방법은 여기 한 곳에만 둔다.
 */
export function templateCards(page: Page): Locator {
  return page.locator("article");
}

export function templateCard(page: Page, text: string): Locator {
  return templateCards(page).filter({ hasText: text });
}
