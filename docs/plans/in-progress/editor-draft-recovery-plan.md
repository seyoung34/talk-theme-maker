# 편집 임시저장·인증/충전 복구 계획

`/edit`에서 내보내기를 시작한 사용자가 로그인 또는 크레딧 충전을 위해 화면을 떠났다가 돌아와도,
저장하지 않은 편집값과 내보내기 설정을 잃지 않도록 한다. 이 문서의 임시저장은 재사용을 위한
“내 템플릿으로 저장”과 별개의 복구 안전장치다.

> 상태: 구현 진행 중. IndexedDB 복구 draft·resume token·크레딧 returnTo 공용 검증을 반영했고, 복구 저장소 테스트와 실제 로그인·결제 왕복 QA가 남아 있다.
> 참고: 편집기 구조·공유 상태 계약 → [../../architecture/theme-architecture.md](../../architecture/theme-architecture.md)
> 참고: `/template` → `/edit` 기본 흐름 → [../../architecture/ux-flow.md](../../architecture/ux-flow.md)

## 문제와 목표

현재 `/edit`의 색상·후보 선택·업로드 `File`·버블 보정값은 React draft 상태에 있다. 내보내기에서
로그인이 필요하면 `/login?returnTo=/edit`로, 크레딧이 부족하면 `/credits?...&returnTo=/edit`로
이동하는데, 페이지 언마운트 및 외부 결제 왕복 뒤에는 이 상태가 사라진다. 기존 `editor-session`은
템플릿 식별자와 플랫폼만 보관하므로 저장하지 않은 편집분을 복원할 수 없다.

이번 작업의 목표는 다음과 같다.

- 인증·충전 때문에 이탈한 경우 **현재 편집본을 자동 복구**한다.
- 업로드한 이미지와 이미지 편집 원본까지 포함해 내보내기에 쓸 수 있는 상태로 복원한다.
- 사용자가 고른 내보내기 형식·이름·버전도 복원해 곧바로 재시도할 수 있게 한다.
- 사용자 템플릿 목록을 임시본으로 오염시키지 않는다.
- 이미 저장한 “내 템플릿”과 시스템 템플릿의 영속화 방식·권한 경계를 바꾸지 않는다.

## 확정 UX

| 상황 | 동작 |
|---|---|
| 내보내기 API가 401을 반환 | draft를 저장 완료한 뒤 로그인 화면으로 이동한다. 로그인 완료 후 `/edit`에서 복원하고 내보내기 다이얼로그를 다시 연다. |
| 크레딧 부족에서 `충전하기` 선택 | draft를 저장 완료한 뒤 크레딧 화면으로 이동한다. PayApp 외부 결제와 복귀 후에도 같은 draft를 복원한다. |
| 인증·충전 이탈 직후 `/edit` 복귀 (`resumeToken` 일치) | 복구 draft를 적용하고 `내보내기 계속하기` 안내와 함께 export 다이얼로그를 자동으로 연다. 자동으로 파일 생성 요청은 하지 않는다. |
| token 없는 일반 `/edit` 방문 | recovery draft를 저장·읽기·제안하지 않는다. 기존 template-start/editor-session 흐름만 적용한다. |
| 복구 저장 실패 | 이탈 전에 오류를 알리고 `계속 이동`과 `편집으로 돌아가기`를 선택하게 한다. 실패를 조용히 무시한 채 이동시키지 않는다. |
| 내보내기 성공 | 해당 모드의 복구 draft를 삭제한다. |
| 사용자가 새 작업 시작 | 해당 모드의 보류 recovery draft를 삭제한다. 기존 저장 템플릿은 삭제하지 않는다. |
| 로그인/결제 중 브라우저를 닫았다가 resume URL로 재진입 | TTL 안이고 token이 일치할 때만 동일하게 복원한다. 만료된 draft는 읽기 전에 정리한다. |

복구 안내의 기본 문구는 “이전 내보내기 준비 작업을 복원했어요. 내용을 확인한 뒤 내보내세요.”로
한다. 자동 재제출은 중복 과금·중복 다운로드 위험이 있으므로 하지 않는다.

일반 편집 이탈(뒤로가기, 탭 닫기, 메뉴 이동, 새로고침)에는 recovery draft를 새로 저장하지 않는다.
recovery draft는 로그인·충전으로 이동하기 **직전**에만 만든다. 저장할 때 암호학적으로 안전한 난수
`resumeToken`을 만들고, 복귀 URL을 `/edit?resume=<resumeToken>`으로 구성한다. `/edit`은 URL token과
레코드 token이 일치할 때만 draft를 자동 적용한다. 이 조건이 없으면 IndexedDB를 읽어 복구 배너를 띄우지도
않는다. 따라서 일반 재방문에서 오래된 작업이 불쑥 나타나거나 사용자가 옛 draft에 갇히지 않는다.

## 저장소와 데이터 모델

### IndexedDB를 사용한다

`localStorage`에는 `File`/`Blob`을 저장할 수 없으므로 사용할 수 없다. 현재 사용자 템플릿도
`kakaotalk-theme-maker` IndexedDB에 `File`을 저장하고 있으므로, 같은 DB를 확장한다.

- DB version을 올리고 신규 object store `editor-recovery-drafts`를 추가한다.
- 사용자 템플릿(`user-templates`), 관리자 에셋, 시스템 템플릿 store의 키·레코드는 변경하지 않는다.
- recovery repository는 `lib/theme/project/recoveryDraft.ts`처럼 프로젝트 상태 경계에 둔다. UI 컴포넌트가
  IndexedDB를 직접 열지 않게 한다.
- `user`/`admin` 모드별로 하나의 최신 draft만 보관한다. key는 `editor-recovery:user` 또는
  `editor-recovery:admin`으로 고정한다.
- 기본 만료 시간은 **7일**로 한다. 읽기·쓰기 시 만료본을 정리하며, 스키마 버전 불일치 레코드는 폐기한다.

```ts
type EditorRecoveryDraft = {
  id: "editor-recovery:user" | "editor-recovery:admin";
  version: 1;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  resume: {
    reason: "login_required" | "insufficient_credits";
    token: string;
    reopenExportDialog: true;
  };
  editor: {
    mode: "user" | "admin";
    templateId: ThemeTemplateId;
    platform: ThemePlatform;
    activeUserTemplateId?: string;
    activeSystemTemplateId?: string;
    systemTemplateBundleId?: string;
    activeSection: ThemeSection;
    activeGroup: ThemeSlotGroup;
    selectedSlotId?: string;
  };
  draft: ThemeDraft; // uploads(File 포함), remoteUploadRefs, colors, selections, bubble edits
  // editor.mode(user/admin)와 혼동을 피하려고 export 형식은 exportMode로 명명한다.
  exportOptions: { exportMode: ExportMode; name: string; versionName: string };
};
```

> 타입 경계 주의: `ThemeDraft`는 현재 UI 훅 `components/project/hooks/useThemeDraft.ts`에 정의돼 있다.
> recovery record는 `lib/theme/project/`에 두므로 그대로 import하면 domain → UI 역방향 의존이 생긴다.
> Phase 1 착수 전에 (a) `ThemeDraft`를 `lib/theme/project`로 옮겨 공유 타입으로 승격할지, (b) 직렬화 전용
> 스키마를 `lib/theme/project`에 별도로 두고 훅 타입과 매핑할지를 확정한다.

`ThemeDraft.uploads`는 기존 사용자 템플릿 저장과 동일한 `File` 검증/정규화 규칙을 적용한다. 저장 도중
시스템 템플릿의 원격 업로드가 아직 내려받아지지 않았다면 `remoteUploadRefs`를 우선 보존하고, 이미
hydrate된 파일도 함께 저장한다. 복원 뒤 내보내기 직전의 기존 hydrate 보장은 그대로 실행한다.

## 구현 단계

### Phase 1 — 복구 repository와 단위 테스트

- [x] `lib/theme/project/recoveryDraft.ts`에 `saveRecoveryDraft`, `readRecoveryDraft`,
  `clearRecoveryDraft`, `clearExpiredRecoveryDrafts`를 만든다. 복원은 읽기 시점에 레코드를 소비하지 않으므로
  `read`(순수 읽기)와 `clear`(명시적 삭제)를 분리한다. `take`처럼 읽자마자 삭제하는 시맨틱은 쓰지 않는다.
- [x] IndexedDB upgrade를 한 곳으로 정리하고 `editor-recovery-drafts` store를 추가한다. 사용자 템플릿과
  recovery repository가 DB version/store 정의를 중복 관리하지 않게 공용 DB helper로 추출한다.
- [ ] 저장 전 `File` 및 `imageEdit.originalFile`을 사용자 템플릿과 같은 기준으로 정규화한다.
- [ ] Vitest에서 저장→읽기→삭제, 만료 폐기, mode 분리, 파일/버블 보정/내보내기 옵션 round-trip을 검증한다.

완료 기준: 이미지 파일을 포함한 draft가 새로고침 후에도 동일한 도메인 객체로 복원되고, 만료·다른 모드
레코드는 편집기에 적용되지 않는다.

### Phase 2 — 편집기 복원과 이탈 전 저장

- [x] `ProjectImporterClient`에서 현재 editor state와 `ThemeDraft`를 recovery payload로 만드는 단일 함수를
  둔다. 저장 시점의 state를 ref 또는 최신 callback으로 읽어 오래된 렌더 값을 저장하지 않게 한다.
- [x] `useEditorBootstrap`은 `searchParams.get("resume")`가 있을 때만 recovery repository를 읽는다. URL token과
  유효 레코드 token이 일치하면 editor state, draft, 활성 템플릿 맥락을 복원한다. token이 없거나 일치하지
  않으면 recovery repository를 읽지 않고 기존 `template-start`/`editor-session` 흐름을 유지한다.
  명시적 새 템플릿 시작 payload는 보류 recovery를 삭제하고 새 작업을 우선한다.
  - 리스크: 현재 bootstrap은 payload가 없으면 곧바로 `setInitialLoadState({ status: "ready" })`로 early
    return하고 20개가 넘는 setter를 의존성으로 갖는다. recovery 복원은 여기에 `exportOptions`(name/
    versionName/export mode)와 export 다이얼로그 열기 신호까지 주입해야 하므로 훅 인터페이스가 눈에 띄게
    커진다. 세터를 개별 추가하기보다 recovery 적용용 콜백/상태 묶음을 하나로 전달하는 형태를 고려한다.
- [x] 복원 성공 후에는 중복 복원을 막기 위해 recovery 레코드를 즉시 소비(delete)하지 않고 유지한다.
  성공 내보내기·명시적 폐기 때만 삭제해 새로고침/다시 로그인해도 보호한다.
- [x] `startDefaultTemplate`과 템플릿 선택으로 전달된 새 작업 payload에서 현재 모드 recovery를 명시적으로
  삭제한다. 일반 뒤로가기·탭 닫기·메뉴 이동에는 저장이나 삭제를 추가하지 않는다.
- [x] `useProjectExport`에 `resumeExportDialog(options)`를 추가한다. 기존 `openExportDialog`은 이름과 형식을
  기본값으로 초기화하므로 복원에 재사용하지 않는다. 새 API는 recovery의 `exportMode`/이름/버전을 적용해
  다이얼로그를 열고 계정 정보만 새로고침한다. 파일 생성은 사용자가 다시 `내보내기`를 눌렀을 때만 시작한다.

완료 기준: `/edit?resume=<resumeToken>`으로 복귀했을 때만 색·업로드·버블 값을 포함한 동일한 미리보기와
내보내기 옵션이 표시되고, token 없는 `/edit` 진입에는 recovery draft가 적용되지 않는다.

### Phase 3 — 로그인·크레딧·결제 흐름 연결

- [x] `useProjectExport`의 401 처리에서 직접 `router.push`하지 않고, 부모가 제공하는
  `persistRecoveryThenNavigate("login_required", url)`을 await하도록 바꾼다. helper는 recovery를 저장한 뒤
  `/edit?resume=<resumeToken>`을 `returnTo`로 넣어 이동한다.
- [x] 401(로그인)과 402(크레딧 부족)의 이동 트리거 위치가 다르다는 점에 유의한다. 현재 **401은 hook 내부에서
  `router.push`로 즉시 이동**하지만, **402는 hook이 이동하지 않고 에러를 throw**해 notice만 띄우고 실제
  `/credits` 이동은 export dialog의 `충전하기` 버튼이 담당한다. 따라서 `persistRecoveryThenNavigate`를
  hook의 401 경로와 dialog의 `충전하기` 버튼 **두 곳 모두**에 배선해야 하며, 어느 한쪽만 고치면 다른 흐름의
  draft 저장이 누락된다.
- [x] Export dialog의 로그인 버튼과 크레딧 부족 `충전하기` 버튼도 같은 helper를 사용한다.
- [ ] 로그인 경로는 변경하지 않고 회귀만 확인한다. `LoginClient`와 `/auth/callback`은 이미 내부 경로를
  허용하는 `getSafeReturnTarget`을 사용하므로 `/edit?resume=<resumeToken>`을 OAuth/email 로그인 왕복 뒤에도
  그대로 통과해야 한다.
- [x] 크레딧·PayApp의 `/edit` returnTo 게이트를 공용 validator로 추출한다. 현재 `CreditsClient`, 결제 준비
  route, `lib/billing/payapp.ts`에 검증/타입이 나뉘어 있으므로, `/edit`와 허용된
  `/edit?resume=<resumeToken>`만 통과시키는 단일 함수·타입을 `lib`에 둔다. 세 호출 지점은 이 공용 계약을
  사용해 URL이 한 경로에서만 조용히 탈락하는 회귀를 막는다.
- [ ] 저장 중에는 이탈 버튼을 비활성화하고 “편집 내용을 안전하게 보관하는 중…” 상태를 보여 중복 클릭을
  막는다.
- [x] 저장 실패 시 이동을 보류하고 오류 UI에서 `계속 이동`(복구 보장 없음) 또는 `편집 계속하기`를 제공한다.
- [ ] `/credits?returnTo=/edit?resume=<resumeToken>` → PayApp → 크레딧 결과 확인 →
  `/edit?resume=<resumeToken>`의 복귀 경로가 유지되는지 확인한다. 로그인 재요청이 중간에 끼어도
  recovery 레코드를 덮어쓰지 않는다.

완료 기준: 비로그인 내보내기와 크레딧 부족 충전 각각에서 페이지 전환·외부 결제 왕복 후 `/edit`이 작업을
복원하고, 사용자의 확인 전에는 내보내기 API를 재호출하지 않는다.

### Phase 4 — 정리, 관측, 회귀 검증

- [x] 성공 내보내기 후 recovery 삭제를 `useProjectExport`의 성공 경로(동기/비동기 Android 및 iOS)에
  공통 적용한다. 실패한 내보내기는 삭제하지 않는다.
- [ ] 복구 저장·성공 복원·저장 실패·명시적 폐기·만료 폐기를 익명 이벤트로 기록한다. 파일명, 이미지 내용,
  전화번호, 결제 ID 등 개인 정보는 이벤트에 넣지 않는다.
- [ ] 저장 용량 초과·IndexedDB 비활성화·손상 레코드 처리와 사용자 문구를 QA한다.
- [ ] 코드 주석/문서에 “내 템플릿 저장”과 “자동 복구 draft”의 보존 기간·삭제 조건 차이를 명시한다.

완료 기준: 성공한 내보내기 뒤에는 복구 draft가 남지 않고, 복구 불가 환경에서는 사용자가 데이터 손실 위험을
인지한 뒤에만 이동할 수 있으며, 기존 사용자 템플릿 저장/열기 회귀가 없다.

## 검증 계획

| 범주 | 확인 항목 |
|---|---|
| 단위 | repository 저장·읽기·TTL·삭제, `File`/이미지 편집 원본 round-trip, 모드 격리 |
| 편집기 | 색상·후보·업로드·버블 보정·선택 슬롯·내보내기 옵션의 복원 |
| 인증 | 비로그인 내보내기 → 카카오/이메일 로그인 → `/edit` 복구 → 사용자 재확인 후 내보내기 |
| 결제 | 크레딧 부족 → 충전 → PayApp 왕복 → `/edit` 복구 → 사용자 재확인 후 내보내기 |
| 오류 | IndexedDB quota/권한 오류에서 이동 보류·선택지 표시, 손상/만료 레코드 무시 |
| 회귀 | 저장 템플릿 열기·저장, 시스템 템플릿 hydrate, Android/iOS 내보내기 |

변경 파일의 성격에 맞춰 `npm test`와 `npx tsc --noEmit`을 기본으로 실행한다. UI 문구를 추가·수정하면
`npm run check:text`도 실행한다. 내보내기 경로를 수정하므로 최종 통합 단계에서는 `npm run build`와
브라우저 수동 왕복 QA를 수행한다.

## 범위 밖

- 편집 중 모든 변경을 지속적으로 자동 저장해 여러 탭/기기에서 동기화하는 기능
- 사용자 템플릿을 서버 계정에 동기화하는 기능
- 결제 성공 후 내보내기 자동 재제출
- 저장된 사용자 템플릿의 목록·공유·버전 관리 UI 변경

이 범위 밖 항목은 복구 안정화 뒤 별도 계획으로 다룬다.

## 다음 단계

1. Phase 1에서 공용 IndexedDB helper와 recovery record의 실제 타입 위치를 확정한다.
2. Phase 2에서 editor bootstrap 우선순위와 복구 다이얼로그 상태를 구현한다.
3. Phase 3에서 인증·충전 이동을 단일 recovery-aware navigation helper로 통합한다.
4. Phase 4의 실제 로그인·PayApp 왕복 QA까지 완료하면 문서 상태를 갱신하고 `plans/done/`으로 이동한다.
