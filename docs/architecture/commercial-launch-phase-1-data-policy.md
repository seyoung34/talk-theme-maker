# 상업 출시 Phase 1 데이터 처리·정책 운영 기준

> 상태: 2026-07-14 기준 코드와 운영 Supabase migration 반영 완료. 사업자 정보 입력, 정책 법률 검토, GCS 샘플 객체의 기한 경과 삭제 실측은 출시 전 확인이 필요하다.
> 원본: 이 저장소의 `docs/architecture/commercial-launch-phase-1-data-policy.md`
> 백업: Obsidian Vault `projects/kakaotalk-theme-maker/commercial-launch/commercial-launch-phase-1-data-policy.md`

## 목적

편집·저장·인증·결제·분석·내보내기 과정에서 어떤 데이터가 어디로 이동하고 얼마나 남는지 코드와 운영 설정을 기준으로 기록한다. 사용자 화면, 정책 문서, 실제 처리 흐름이 서로 모순되지 않게 유지하는 것이 목적이다.

## 데이터 흐름과 보관 기준

| 기능 | 처리 주체 | 전송·처리 데이터 | 저장 위치 | 보관·삭제 기준 |
|---|---|---|---|---|
| 편집 | 사용자 브라우저 | 색상, 슬롯 선택, 업로드 이미지, 말풍선 보정값 | 메모리와 브라우저 IndexedDB | 사용자가 삭제하거나 브라우저 데이터를 지울 때 삭제 |
| 내 템플릿 저장 | 사용자 브라우저 | 현재 프로젝트 상태와 업로드 이미지 | 브라우저 IndexedDB | 템플릿 삭제 또는 브라우저 데이터 삭제 시 삭제. 계정 자동 동기화 없음 |
| iOS 내보내기 | TalkTheme 서버 | 결과물 생성에 필요한 프로젝트 상태와 이미지 | 요청 처리 메모리, Supabase 내보내기 이력 | 결과 파일은 응답으로 전달하며 계정에는 상태·형식·소요 시간 등 이력만 저장 |
| Android 비동기 내보내기 | TalkTheme 서버, Google Cloud Storage, Cloud Run Job | 프로젝트 ZIP, 빌드 입력·결과 파일 | 비공개 GCS 입력·출력 버킷, Supabase 내보내기 이력 | 입력 객체 1일, 출력 객체 7일 후 lifecycle 삭제. 서명 URL은 단기 유효 |
| 인증 | Supabase Auth, Kakao 또는 이메일 제공자 | 이메일, 로그인 제공자, 제공자가 전달한 프로필 정보 | Supabase Auth와 관련 프로필 데이터 | 탈퇴·삭제 요청과 법정 보존 의무에 따라 처리 |
| 가입 정책 동의 | TalkTheme, Supabase | 사용자 ID, 정책 종류, 정책 버전, 동의 시각, 가입 경로 | `user_policy_consents` | 감사 증빙이므로 추가 전용으로 보관. 본인 조회만 허용 |
| 결제 | TalkTheme, PayApp | 상품, 금액, 주문 식별자, 결제 요청 휴대폰번호 | PayApp, Supabase `payments` | 휴대폰번호는 PayApp 전송에만 사용하고 결제 테이블에 별도 저장하지 않음. 결제 원장은 관계 법령과 환불 운영 기준에 따라 보관 |
| 분석 | 사용자 브라우저, Google Analytics 4 | 동의 이후 페이지, 제품 이용 이벤트, 브라우저·기기 및 온라인 식별 정보 | 브라우저 동의 상태, GA4 | 기본 거부. 사용자가 쿠키 설정에서 철회하면 이후 전송 중단 |

## 구현 기준

### 사용자 안내와 정책 경로

- 편집과 ‘내 템플릿’ 저장은 브라우저에서 처리한다.
- 내보내기를 시작할 때만 결과 생성에 필요한 이미지와 설정을 서버로 일시 전송한다고 갤러리, 저장 다이얼로그, 내보내기 다이얼로그에 안내한다.
- `/terms`, `/privacy`, `/refund`, `/support`, `/copyright`를 전역 footer에서 제공한다.
- 결제 화면은 개인정보 처리방침, 이용약관, 환불 안내, 고객지원으로 바로 이동할 수 있어야 한다.
- 분석 쿠키 배너와 설정 창은 개인정보 처리방침으로 연결한다.

관련 코드:

- `components/template/TemplateGalleryClient.tsx`
- `components/project/dialogs/SaveTemplateDialog.tsx`
- `components/project/dialogs/ExportDialog.tsx`
- `components/billing/CreditsClient.tsx`
- `components/layout/SiteFooter.tsx`
- `components/analytics/AnalyticsProvider.tsx`
- `lib/policies/documents.ts`

### 회원가입 동의 증빙

- 이메일·카카오 회원가입 모두 이용약관과 개인정보 처리방침의 개별 필수 체크를 통과해야 가입을 시작할 수 있다.
- 현재 정책 버전은 이용약관과 개인정보 처리방침 모두 `2026-07-14`다.
- 인증 완료 뒤 `user_policy_consents`에 `user_id`, `policy_type`, `policy_version`, `accepted_at`, `source`를 추가한다.
- 테이블은 RLS를 활성화하고 본인 행만 조회·추가할 수 있다. 수정·삭제 권한은 부여하지 않는다.
- 정책 본문이 실질적으로 바뀌면 버전을 갱신하고 재동의 흐름을 별도 구현해야 한다.

관련 코드:

- `components/auth/LoginClient.tsx`
- `app/auth/callback/route.ts`
- `lib/policies/consent.ts`
- `supabase/migrations/20260713154640_add_user_policy_consents.sql`

### PayApp 원문 최소화

`payments.raw_payload`에는 PayApp 원문 전체를 저장하지 않는다. 다음 allowlist 값만 최대 500자로 저장하고, 응답에 포함된 필드명 목록은 값 없이 `received_fields`로 남긴다.

- 상태: `pay_state`, `state`
- 거래 확인: `price`, `goodname`, `mul_no`
- 오류 확인: `errorCode`, `errcode`, `errorMessage`, `errormsg`

전화번호와 이메일 패턴이 허용 필드의 메시지에 섞이면 각각 `[PHONE_REDACTED]`, `[EMAIL_REDACTED]`로 치환한다. `recvphone`, `userid`, `linkkey`, `linkval`, `var1`, `var2`의 값은 저장하지 않는다.

관련 코드:

- `lib/billing/payapp.ts`
- `app/api/billing/payapp/prepare/route.ts`
- `app/api/billing/payapp/feedback/route.ts`
- `lib/billing/payapp.test.ts`

## GCS lifecycle 확인 기록

2026-07-14 운영 버킷을 `gcloud storage buckets describe`로 읽기 전용 확인했다.

| 버킷 | 리전 | 확인된 규칙 |
|---|---|---|
| `kt-theme-build-input` | `ASIA-NORTHEAST3` | 객체 age 1일에 Delete |
| `kt-theme-build-output` | `ASIA-NORTHEAST3` | 객체 age 7일에 Delete |

설정 존재는 확인했지만, 이번 변경 이후 생성한 표식 샘플 객체가 각 기한을 지난 뒤 실제 사라지는지는 아직 실측하지 않았다. 입력은 2일 뒤, 출력은 8일 뒤 객체 부재를 확인해 날짜와 결과를 이 문서에 추가해야 한다. 사용자 파일명이나 내용을 검증 로그에 남기지 않는다.

## 배포 환경에 입력할 공개 운영 정보

다음 값은 `.env.example`에 정의되어 있다. 상호·대표자·사업자등록번호·주소·현재 문의처는 `lib/policies/publicConfig.ts`의 공개 기본값으로도 등록하며, 환경변수가 있으면 환경변수 값을 우선 사용한다. 통신판매업 신고번호와 운영 시간처럼 아직 확정되지 않은 항목은 “운영 정보 확정 후 공개”로 표시한다.

- `NEXT_PUBLIC_BUSINESS_NAME`
- `NEXT_PUBLIC_BUSINESS_REPRESENTATIVE`
- `NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER`
- `NEXT_PUBLIC_ECOMMERCE_REGISTRATION_NUMBER`
- `NEXT_PUBLIC_BUSINESS_ADDRESS`
- `NEXT_PUBLIC_SUPPORT_EMAIL`
- `NEXT_PUBLIC_SUPPORT_PHONE`
- `NEXT_PUBLIC_SUPPORT_HOURS`
- `NEXT_PUBLIC_PRIVACY_CONTACT_NAME`
- `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`
- `NEXT_PUBLIC_PRIVACY_CONTACT_PHONE`

현재 공개 기본값은 사업자등록증에서 확인한 토비토비·이세영·사업자등록번호·사업장 주소와 사용자가 지정한 개인정보 문의 이메일·전화번호다. 생년월일은 공개·저장하지 않는다. `/privacy`의 개인정보 문의 이메일·전화번호는 전용 환경변수가 없을 때 고객지원 이메일·전화번호를 대신 사용한다.

개인정보 처리방침 문안에는 현재 코드와 인프라에서 확인한 회원·동의·크레딧·결제·내보내기·로컬 편집·분석 데이터 흐름, 법정 거래 기록 보존기간, 파기 절차, 이용자 권리, 안전성 확보조치와 쿠키 정보를 반영했다. 다음 값은 코드만으로 확정할 수 없으므로 실제 운영 설정과 계약을 기준으로 출시 전에 문안에 반영해야 한다.

- Google Analytics 4 속성의 사용자·이벤트 데이터 보유기간
- 호스팅·보안 로그의 실제 보유기간
- 이메일 발송 사업자명과 해당 사업자의 처리·국외 이전 조건
- Google Analytics 4와 이메일 발송 서비스의 국외 이전 수령자·국가·시점·방법·항목·목적·보유기간·거부 방법
- 실제 PayApp 판매자 계약의 결제 정보 보유·이용 조건이 ㈜유디아이디의 최신 처리방침과 일치하는지 여부

## 출시 전 남은 확인

- [x] 운영 사업자·대표자·등록번호·주소·고객지원 이메일·전화번호를 공개 기본값으로 입력한다.
- [x] 개인정보 보호책임자, 개인정보 문의 이메일·전화번호를 공개 기본값으로 입력한다.
- [ ] 통신판매업 신고번호와 고객지원 운영 시간을 확정해 입력한다.
- [x] 만 14세 미만 가입 제한 migration을 운영 Supabase에 적용하고 `age_14` 허용 제약·RLS·열 권한을 확인한다. 운영 migration 버전은 `20260713170848`이다.
- [ ] 이메일·카카오 실제 신규 가입에서 `age_14` 확인 이력이 저장되는지 각각 검증한다.
- [ ] 분석·로그 보유기간, 이메일 발송 사업자와 국외 이전 상세를 실제 운영 설정·계약 기준으로 확정해 개인정보 처리방침에 반영한다.
- [ ] 개인정보 요청, 권리침해 신고, 환불 문의가 실제 고객지원 수단으로 도착하는지 확인한다.
- [ ] 약관·개인정보 처리방침·환불 안내를 실제 사업 형태와 관계 법령 기준으로 전문가 검토한다.
- [x] 운영 Supabase에 동의 이력 migration을 적용하고 RLS·최소 권한·롤백 upsert smoke test를 확인한다. 운영 migration 버전은 `20260713154640`이다.
- [ ] 이메일·카카오 실제 가입을 각각 한 건씩 완료해 동의 이력 저장 결과를 확인한다.
- [ ] GCS 입력·출력 샘플 객체의 lifecycle 기한 경과 후 실제 삭제를 확인한다.
- [ ] PayApp 테스트 또는 최소 금액 결제로 `raw_payload`에 허용 값만 남는지 확인한다.

## 변경 시 함께 확인할 항목

- 정책 문구를 바꾸면 `lib/policies/documents.ts`와 정책 버전, 회원 재동의 필요 여부를 함께 검토한다.
- GCS 보관 기간을 바꾸면 lifecycle, 개인정보 처리방침, 이 문서의 표를 같은 변경에서 수정한다.
- PayApp 응답 필드를 추가 저장하려면 목적과 보관 필요성을 먼저 기록하고 테스트 allowlist를 갱신한다.
- 브라우저 프로젝트를 계정에 동기화하는 기능을 추가하면 “로컬 우선” 안내와 데이터 흐름표를 다시 작성한다.
