# Android 내보내기 413 (payload 초과) 수정 계획 — 옵션 1

실기기(배포 환경)에서 Android APK 내보내기가 **413 `FUNCTION_PAYLOAD_TOO_LARGE`** 로 실패하는 문제의
수정 계획. 옵션 1(서버에서 기본 에셋 해결)로 진행한다.

> 상태: **완료.** Android/iOS 옵션 1 구현 및 배포 실기기 검증까지 완료 — 비동기 Cloud Run Job 경로
> ([../in-progress/cloud-run-apk-builder-dev.md](../in-progress/cloud-run-apk-builder-dev.md))에서도 동일한
> `serverAsset` 참조 방식을 재사용해 413이 해소됨을 확인. 원격(시스템 템플릿) 에셋 참조화(옵션 2)는 별도 후속 과제로 남음.

## 원인 (확정)

- **413 `FUNCTION_PAYLOAD_TOO_LARGE` = Vercel 서버리스 함수의 요청 본문 한도(약 4.5MB) 초과.**
  함수에 도달하기 전에 플랫폼이 요청을 거부한다.
- 내보내기 클라이언트가 `buildAndroidThemeExportFiles`로 **테마의 전체 파일(안 바꾼 기본 drawable까지 전부)**
  을 blob으로 만들어 하나의 `multipart/form-data`로 전송한다. 정상 테마는 xxhdpi 이미지가 많아 거의 항상 초과.
- 비업로드 슬롯은 `getResolvedAssetUrl`로 나온 기본 에셋 URL(`/template-assets/...`)을
  `fetchAssetBlob`으로 다시 받아 업로드한다 (`lib/theme/android/export.ts:91-96`). 이 왕복이 payload 대부분.
- PC에서 됐던 건 `localhost` 개발 서버(본문 한도 없음)였거나 더 가벼운 테마였기 때문. 배포(Vercel)에서만 재현됨.
- 참고: 앱 자체 가드 `isExportRequestTooLarge`(`lib/theme/exportRequest.ts`)도 413을 내지만, Vercel 플랫폼
  한도가 **함수 실행 전에** 먼저 걸린다. 이번 사용자 오류는 Vercel 쪽(`FUNCTION_PAYLOAD_TOO_LARGE`).

## 핵심 원리

이미지를 **출처**로 나눠, 서버가 스스로 읽을 수 있는 것은 바이트 대신 참조만 보낸다.

| 출처 | 처리 | 이유 |
|---|---|---|
| 사용자 업로드 이미지 | 바이트 전송(현행 유지) | 서버에 없는 데이터 |
| 나인패치 말풍선(처리 결과) | 바이트 전송(현행 유지) | 캔버스 처리가 브라우저 필요, 소량 |
| 로컬 기본 에셋 `/template-assets/...` | **참조만 전송** | 서버 `public/`에 이미 존재 |
| colors.xml·strings.xml 등 텍스트 | 바이트 전송(현행 유지) | KB급이라 무관 |
| 관리자/시스템(원격) 에셋 | 1단계: 바이트 유지 | signed URL 인증 필요 → 옵션 2에서 처리 |

기본 에셋이 payload의 대부분이라, 이것만 참조로 바꿔도 일반 테마는 4.5MB 훨씬 아래로 내려간다.

## 바뀌는 파일

1. **`lib/theme/android/export.ts`** — `buildAndroidThemeExportFiles` / `resolveAndroidSlotBlob` 리팩터
   - 반환 타입을 `{ path; blob }` → `{ path; blob }` 또는 `{ path; serverAsset: string }` 유니온으로 확장.
   - 비업로드·비나인패치 이미지 슬롯에서 `getResolvedAssetUrl`이 루트-상대 로컬 경로(`/template-assets/...`)를
     주면 `fetchAssetBlob` 대신 `{ path, serverAsset: url }` 반환.
   - 사용자 업로드/나인패치/원격 에셋/텍스트는 지금처럼 blob 반환.

2. **`components/project/exportClient.ts`** — `createAndroidExportFormData`
   - manifest 엔트리를 두 형태로: 바이트 있는 것 `{ field, path }`, 참조인 것 `{ path, serverAsset }`.
   - FormData엔 blob이 있는 파일만 `file-N`으로 append.

3. **`lib/theme/android/request.ts`** — `readAndroidBuildInputFiles`
   - manifest 순회 시 `serverAsset`가 있으면 FormData 대신 서버 `public/` 파일시스템에서 바이트를 읽어
     동일한 `{ path, bytes }`로 채운다.
   - 나머지는 현행대로 FormData에서 읽음. 이후 `buildResult`/APK 조립은 무변경.

## 반드시 챙길 것 (리스크)

- **경로 보안**: `serverAsset`는 `public/template-assets/`(+ 허용 목록) 하위로만 읽도록 검증. 경로 순회(`..`)
  차단 — 임의 파일 읽기 방지.
- **폴백**: 서버가 `serverAsset` 파일을 못 찾으면 명확히 실패시키거나, 안전하게 클라이언트가 바이트도 함께
  보내는 폴백 옵션.
- **크레딧 `inputBytes`**: 지금은 업로드 바이트 기준. 서버가 읽는 기본 에셋은 집계에서 빠지므로 필요하면
  서버 측에서 합산 보정(메트릭 정확도용, 기능엔 무관).
- **원격(시스템 템플릿) 에셋**: 1단계에선 바이트 유지 → 시스템 템플릿을 무겁게 커스텀하면 여전히 클 수 있음.
  이 케이스는 옵션 2(Storage 참조)에서 마무리하도록 후속 과제로 남김.
- **iOS 동일 문제**: `createIosExportFormData`도 같은 구조라 동일 413 위험. iOS는 `@2x/@3x` 파생 이미지를
  브라우저에서 만들기 때문에, 서버에서 그대로 쓸 수 있는 기본 에셋 스케일은 참조로 보내고 리사이즈 결과만
  바이트로 전송한다.

## 검증

1. `npx tsc --noEmit`
2. 로컬 `npm run dev`에서 테마 내보내기 → APK가 이전과 동일하게 생성되는지, 네트워크 탭에서 요청 크기가
   수 MB → 수십 KB+커스텀 이미지로 줄었는지 확인.
3. 기본만 쓴 테마(업로드 0) → 이미지 바이트 거의 0으로 전송되는지.
4. 배포 프리뷰에서 실제 안드로이드 기기 재현 시나리오로 최종 확인(원래 413 나던 그 테마).

## 구현 메모

- Android 기본 에셋(`/template-assets/...`)은 FormData 파일 대신 manifest의 `serverAsset` 참조로 전송한다.
- iOS 기본 에셋(`/template-assets/...`)도 서버에서 그대로 쓸 수 있는 스케일은 `serverAsset` 참조로 전송한다.
- 서버는 `public/template-assets/` 하위 파일만 읽도록 검증한 뒤 기존 빌드 입력 `{ path, bytes }`로 변환한다.
- 사용자 업로드, 나인패치 변환 결과, 원격/시스템 템플릿 에셋, 텍스트 파일은 기존처럼 바이트를 전송한다.
- 서버가 읽은 기본 에셋 바이트도 `inputBytes`에 합산해 export job 메트릭을 유지한다.

## 다음 단계

1. 로컬/프리뷰에서 Android APK 및 iOS .ktheme 내보내기 요청 크기와 결과물 동일성 확인.
2. 배포 프리뷰에서 실기기 413 재현 시나리오 재검증.
3. 후속: 옵션 2(Storage 선업로드 + 참조)로 원격/시스템 템플릿 무거운 커스텀까지 용량 무관하게 보장.
