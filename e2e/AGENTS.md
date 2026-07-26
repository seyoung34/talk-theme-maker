# e2e

Playwright E2E 스위트(TEST-002). Vitest가 닿지 못하는 **여러 컴포넌트·API·브라우저 저장소를 가로지르는
흐름**만 다룬다. 순수 함수와 저장소 계약은 계속 `*.test.ts`(Vitest)가 담당한다.

```powershell
npm run test:e2e            # 빌드 → 기동 → 전체 실행
npm run test:e2e:ui         # 선택 실행·디버깅
npm run test:e2e:report     # 마지막 실행 리포트
```

## 실행 환경

`playwright.config.ts`가 **Supabase 설정을 비운 채로** 빌드·기동한다.

- 결정성: 시스템 템플릿·계정·크레딧이 원격 DB 상태를 따라 흔들리지 않는다.
- 안전: 개발자 `.env.local`은 운영 Supabase를 가리킨다. E2E가 그쪽에 쓰거나 크레딧을 소모할 경로를
  만들지 않는다.

**이 빌드는 기본 `.next`를 덮는다.** E2E를 돌린 뒤 `npm run start`로 앱을 띄우려면 `npm run build`를
다시 실행해야 한다(그러지 않으면 로그인 불가 상태로 뜬다). 별도 `distDir`로 분리해 봤지만 Next가
`next-env.d.ts`와 `tsconfig.json`을 그 경로로 다시 써서 추적 대상 파일이 실행할 때마다 뒤집혔다.

서버는 매 실행마다 새로 빌드한다. 스펙 선택자만 다듬는 동안에는 `E2E_REUSE_SERVER=1`로 건너뛸 수
있지만, **소스를 고친 뒤에는 쓰지 않는다**(이전 빌드를 검사하게 된다).

## 규칙

- 스펙은 `./fixtures/test`의 `test`를 쓴다. `@playwright/test`에서 직접 가져오지 않는다.
  공용 fixture가 `/api/session`과 `/api/theme-assets/recommended`를 비로그인 정상 응답으로 고정한다.
- 로그인이 필요한 화면은 클라이언트 컴포넌트가 `/api/*`만 읽으므로 `page.route`로 계약을 검증한다.
  **서버의 소유권·만료·권한 판정은 이 스위트의 범위가 아니다.** 라우트 핸들러 쪽에서 따로 덮는다.
- 갤러리처럼 환경에 따라 목록이 달라지는 화면은 내용을 단정하지 말고, 화면에서 읽은 값을 대조한다.
- 업로드 이미지는 `fixtures/image.ts`로 생성한다. 고정 바이너리를 두지 않는 이유는 복원된 이미지가
  올린 이미지와 **같은 바이트인지** 비교해야 하기 때문이다.
- 프로젝트는 `desktop`과 `mobile`로 나뉜다. 모바일 편집기는 레이아웃이 달라 전용 스펙
  (`mobile-editor.spec.ts`)만 `mobile`에서 돌린다.

## 스펙이 덮는 것

| 스펙 | 대상 |
|---|---|
| `public-pages.spec.ts` | 랜딩 → 갤러리 → 편집기 진입, 정책 페이지, 404 복귀 경로 |
| `editor-autosave.spec.ts` | UX-001/SQ-20~25 자동 저장·이어하기·정리, UX-002/SQ-11 조건부 이탈 경고 |
| `account-redownload.spec.ts` | UX-003/SQ-26~29 완료·만료·진행 중·iOS 이력의 복구 경로 |
| `mobile-editor.spec.ts` | 좁은 화면 편집 진입·시트 조작·업로드, 랜딩 가로 스크롤 |

`editor-autosave.spec.ts`의 바이트 비교가 이 스위트의 핵심이다. 자동 저장은 업로드한 `File`을
IndexedDB에 structured clone으로 넣는데, Vitest가 쓰는 `fake-indexeddb`는 `File`을 메타데이터만 남은
객체로 낮춘다. **이미지가 실제로 복원되는지는 실제 브라우저에서만 확인할 수 있다.**
