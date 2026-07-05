# 쉬운 가이드(이미지 중심) 기획 — 확정본

일반 사용자를 위한 스크린샷/이미지 중심 사용 가이드 기획. 현재 `/guide`의 텍스트 문서는
파워 유저용 "자세한 가이드"로 유지·보강하고, 그와 병렬로 이미지 중심 "쉬운 가이드"를 추가한다.

> 상태: 기획 확정. 스크린샷·GIF 에셋 준비 후 구현 착수.

## 확정된 방향

| 항목 | 결정 |
|---|---|
| 배치 | 별도 URL 신설 없이 **같은 `/guide` 안에서 모드 토글**(쉬운/자세한) |
| 주석 방식 | 깨끗한 스크린샷 위에 **코드 오버레이**로 화살표·하이라이트(문구 수정·다국어·반응형에 강함) |
| 적용 단계 매체 | 가장 어려운 4단계(적용)만 **GIF/짧은 무음 영상**, 나머지는 정적 스크린샷 |
| 기본 모드 | "쉬운 가이드"를 기본값으로 진입 |

## 이원화 구조

- **쉬운 가이드**(기본): 이미지/스크린샷 위주, 3~4개 큰 스텝, 스텝당 글 1~2줄, 전문용어 제거.
- **자세한 가이드**: 현재 텍스트 문서(`lib/guide/content.ts`의 `sections`). 추후 규격·트러블슈팅 보강.
- 플랫폼(Android/iOS) 탭은 현행 유지.
- URL 상태: `?platform=android&mode=easy` 형태로 공유·딥링크 가능하게(기존 `platform` 쿼리 패턴 확장).

## 쉬운 가이드 스텝 (제품 플로우와 1:1)

| 스텝 | 화면/행동 | 필요한 에셋 | 비고 |
|---|---|---|---|
| 1. 템플릿 고르기 | `/template`에서 분위기 + 플랫폼 선택 | 갤러리 스크린샷 · 카드 선택 강조 | 정적 |
| 2. 사진·색 바꾸기 | `/edit`에서 배경/프로필/말풍선 교체 → 실시간 미리보기 | 편집기 스크린샷 · 섹션 탭/슬롯/미리보기 주석 | 정적 |
| 3. 내려받기 | 내보내기 모달에서 이름/버전 확인 후 생성 | 내보내기 모달 스크린샷 · 다운로드 버튼 강조 | 정적 |
| 4. 카톡에 적용 ⚠️ | Android: APK 설치 → 설치 허용 팝업 → 테마 앱 '적용하기' / iOS: 파일 앱 → 공유 → 카카오톡 열기 | **GIF/짧은 무음 영상** | 실패율 최고 구간 |

스텝 렌더 원칙: **스크린샷 1장 + 코드 주석(화살표/원형 하이라이트) + 쉬운말 1~2줄**.

## 콘텐츠 스키마 확장 (구현 시)

기존 상세 `sections`는 그대로 두고 병렬 필드를 추가한다. `lib/guide/content.ts`:

```ts
type EasyAnnotation = {
  kind: "arrow" | "highlight" | "pin";
  // 스크린샷 기준 상대좌표(0~1), 반응형 유지
  x: number; y: number; w?: number; h?: number;
  label?: string;
};

type EasyStep = {
  title: string;        // 예: "마음에 드는 템플릿 고르기"
  caption: string;      // 1~2줄 쉬운말 설명
  media: {
    type: "image" | "video";
    src: string;        // public/guide/{platform}/...
    poster?: string;    // video일 때 정지 이미지
  };
  annotations?: EasyAnnotation[];
  hardStep?: boolean;   // ⚠️ '가장 헷갈리는 곳' 뱃지
};

// PlatformGuide에 추가
easySteps?: EasyStep[];
```

## 에셋 파이프라인

- 저장 위치: `public/guide/android/`, `public/guide/ios/` (현재 `public/guide`는 비어 있음).
- 스크린샷은 주석 없는 **깨끗한 원본**으로 저장(주석은 런타임 오버레이).
- GIF/영상은 무음·짧게(5~10초), `poster` 정지 이미지 동봉.
- 좌표 주석은 스크린샷 기준 **상대좌표(0~1)** 로 저장해 리사이즈에도 위치 유지.

## 컴포넌트 작업 (구현 시)

- `components/guide/GuideClient.tsx`에 `mode`("easy" | "detailed") 상태 추가.
- 쉬운 가이드용 스텝 렌더러 신설: 미디어 프레임 + 절대배치 주석 오버레이 + 스텝 카드.
- 디자인 톤은 이미 적용된 Sky Pop(스카이블루 + 카카오 옐로우, 필 형태, font-black 헤드라인)과 일치시킴.
- 접근성: 각 미디어에 대체 텍스트, 영상은 무음/자동재생 시 `playsinline`·컨트롤 제공.

## 다음 단계

1. (사용자) 4개 스텝용 스크린샷 + 4단계 적용 GIF/영상 준비 → `public/guide/{platform}/`.
2. (구현) `content.ts` 스키마 확장 → `GuideClient` mode 토글 + 쉬운 스텝 렌더러 → 주석 오버레이.
3. 검증: `npm run check:text`(한국어 UI 문구), `npx tsc --noEmit`.
