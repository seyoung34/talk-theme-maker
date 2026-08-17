# scripts/capture

웹 편집기 화면을 영상으로 찍는 러너. 가이드 영상과 홍보 릴스가 같은 골격을 쓴다.

```powershell
# 기본: Supabase를 비운 채로 빌드하고 기동해서 찍는다 (몇 분 걸린다)
node scripts/capture/run.mjs --profile=guide

# 이미 서버가 떠 있으면 그걸 쓴다 (반복 실행할 때)
node scripts/capture/run.mjs --profile=guide --server=http://127.0.0.1:3311 --scenes=editor-tour
```

| 인자 | 뜻 |
|---|---|
| `--profile=guide\|reel` | 촬영 규격. 기본 `guide` |
| `--scenes=a,b` | 찍을 씬. 기본은 mock 환경에서도 도는 구성 |
| `--server=<url>` | 이미 떠 있는 서버 사용. 빌드·기동을 건너뛴다 |
| `--out=<dir>` | 출력 경로. 기본 `E:\TalkTheme-자료\촬영본\<profile>` |
| `--no-build` | 빌드를 건너뛴다. **아래 주의 참고** |

## 왜 Supabase를 비우고 찍나

`playwright.config.ts`가 E2E에서 하는 것과 같다. 크레딧이 소모되지 않고, 같은 명령이 같은 화면을
낸다. 운영 Supabase에 붙여 찍지 않는다.

`NEXT_PUBLIC_*`은 **빌드 시점에 번들로 구워진다.** 기동할 때만 비워서는 소용이 없다.
`--no-build`가 위험한 이유가 이것이다 — 이전 빌드에 개발자의 운영 키가 들어 있을 수 있다.

## 해상도 상한 (실측)

뷰포트 1280×720 / `deviceScaleFactor` 1.5에서 네 모서리 색으로 판정한 결과다.

| 경로 | 결과 |
|---|---|
| `page.screenshot()` | 1920×1080, 정상 |
| `recordVideo({ size })` | 1920×1080 컨테이너, 좌상단만 그리고 나머지 `#808080` |
| `page.screencast({ size })` | 위와 같음 |
| `page.screencast`, `size` == 뷰포트 | 꽉 참 |

**screencast의 실해상도는 뷰포트 CSS 픽셀이다.** `size`는 컨테이너만 키우고 `deviceScaleFactor`는
무시한다. `size`를 생략하면 Playwright가 800px 상자로 줄이므로(1280×720 → 800×450) 뷰포트와 같은
값으로 반드시 준다.

그래서 문서 규격 1920×1080은 지금 백엔드로 도달할 수 없고, manifest의 `meetsSpec`이 그 사실을
드러낸다. `page.screenshot()` 루프 백엔드(Phase B2)가 생기면 프로필의 `backend`만 바꾸면 된다.

## 촬영 함정

러너가 자동으로 처리한다. 씬마다 다시 구현하지 않는다.

| 함정 | 대응 |
|---|---|
| 분석 동의 배너가 하단을 덮는다 | 동의값을 미리 `denied`로 심고 CSS로도 지운다 |
| 거부하면 쿠키 설정 버튼이 좌하단에 **상주**한다 | 같은 CSS가 함께 지운다 |
| Next dev 표시등(`nextjs-portal`) | CSS로 지운다 |
| 스크롤바가 회색 띠로 찍힌다 | 폭 0. 스크롤은 그대로 동작한다 |
| 편집기 진입 토스트 | `ctx.dismissNotices()`로 닫는다 |
| 주입한 커서가 렌더되지 않는다 | `screencast.showActions()`를 쓴다 — 브라우저 바깥에서 그린다 |
| `article[role="button"]`이 0개를 잡아 클릭이 조용히 건너뛰어진다 | 갤러리 씬이 카드 0개면 **던진다** |
| 카드 클릭은 상세 모달만 연다 | 갤러리 씬이 "Android로 시작"을 한 번 더 누른다 |

**씬이 끝날 때마다 `assertCleanChrome`이 위 장식이 실제로 안 보이는지 확인하고 던진다.**
이 함정들의 공통점은 조용히 실패한다는 것이다 — 배너가 찍혀도 촬영은 끝까지 돌고, 다 만든 뒤에야
프레임에서 발견된다.

## 구조

| 파일 | 역할 |
|---|---|
| `run.mjs` | CLI. 인자 파싱, 서버 빌드·기동 |
| `runner.mjs` | 브라우저 기동, 함정 대응, 씬 실행, 경계 시각, manifest |
| `profiles.mjs` | 규격(뷰포트·백엔드·출력). 해상도 값은 전부 실측 근거를 주석에 둔다 |
| `pageSetup.mjs` | 페이지에 주입하는 함수. 브라우저 안에서 단독 성립해야 한다 |
| `encode.mjs` | ffmpeg 탐색·실측·mp4/webp 변환 |
| `scenes/` | 씬 모듈과 레지스트리 |

`scenes/shared.mjs`는 `e2e/fixtures/*.ts`와 **같은 화면을 가리키는 코드가 두 벌**이다. 스크립트가
`.mjs`라 TypeScript fixture를 그대로 가져올 수 없어서다. 편집기 마크업을 바꾸면 두 곳을 함께 고친다.

## ffmpeg

정식 빌드가 필요하다. Playwright 번들 빌드는 축소판이라 mp4·webp·색보정을 만들지 못한다.

```powershell
winget install Gyan.FFmpeg
```

설치한 그 셸에서는 PATH에 잡히지 않는다. **새 터미널을 열어야** 보인다.
`encode.mjs`는 PATH에 없으면 winget 설치 경로를 직접 찾고, 그래도 없으면 위 안내와 함께 던진다.

## manifest

캡처가 끝나면 `capture-manifest.json`을 남긴다. 합성(Remotion) 쪽은 이 파일만 읽는다.

`measured`는 프로필이 **의도한** 값이 아니라 `clips[].path`가 가리키는 그 파일을 실제로 잰 값이다.
백엔드가 뷰포트에 묶여 있어 의도와 결과가 갈리는데, 거기에 의도한 값을 적으면 manifest가 거짓말을
하게 된다.
