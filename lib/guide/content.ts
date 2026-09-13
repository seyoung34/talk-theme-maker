export type GuidePlatform = "android" | "ios";

export type GuideStep = {
  title: string;
  body: string;
  note?: string;
};

export type GuideSection = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  steps?: GuideStep[];
};

// 쉬운(이미지 중심) 가이드용 주석. 좌표는 스크린샷 기준 상대값(0~1)이라 리사이즈에도 위치가 유지된다.
export type EasyAnnotation = {
  kind: "highlight" | "pin";
  x: number;
  y: number;
  w?: number;
  h?: number;
  label?: string;
};

/**
 * 쉬운 가이드 스텝의 화면 자료.
 *
 * 영상에 `poster`를 **필수**로 둔다. 축소 모션 설정에서는 영상 대신 이 이미지만 보여주고,
 * 재생이 막히거나 실패했을 때도 같은 이미지로 되돌리기 때문이다. 없으면 두 경우 모두 빈
 * 화면이 남는다. 예전 타입은 `poster`가 선택이라 빠뜨리면 영상 URL이 `<img src>`로 들어가
 * 조용히 깨졌다.
 *
 * 영상 규격: 16:9(1920×1080). 카드가 `aspect-[16/9]` + `object-cover`라 다른 비율을 넣으면
 * 오류 없이 잘리기만 한다. 무음이므로 오디오 트랙은 넣지 않는다.
 *
 * 용량은 **클립당 1.5MB 이하**로 맞춘다. 스텝마다 영상을 달면 페이지 하나가 수 MB가 되고,
 * 가이드를 여는 사람 상당수가 테마를 적용하려는 모바일 데이터 환경이다. 렌더러가
 * `preload="none"`으로 실제로 본 스텝만 받게 하지만, 그건 상한을 대신하지 못한다.
 */
export type EasyStepMedia = ({ type: "image"; src: string } | { type: "video"; src: string; poster: string }) & {
  /**
   * CSS `aspect-ratio` 값. 기본은 데스크톱 편집기 규격인 `"16 / 9"`다.
   *
   * 카드가 `object-cover`로 그리므로 **소스 비율과 어긋나면 오류 없이 잘리기만 한다.** 세로 자료를
   * 16:9 칸에 넣으면 위아래가 통째로 사라지는데 아무도 알려주지 않는다. 그래서 자료가 자기 비율을
   * 들고 다니게 하고, 카드는 그 값을 따른다.
   */
  aspect?: string;
  /**
   * 이 화면 자료에 붙는 주석. 좌표가 0~1 상대값이라 **자료가 바뀌면 의미가 없어진다** —
   * 데스크톱에서 오른쪽 위였던 버튼이 모바일에서는 아래쪽 시트 안에 있다. 그래서 스텝이 아니라
   * 자료에 붙인다.
   */
  annotations?: EasyAnnotation[];
};

export type EasyStep = {
  title: string;
  caption: string;
  /**
   * 순서대로 따라 해야 하는 하위 동작.
   *
   * 대부분의 스텝은 동작 하나라 `caption` 한두 줄이면 끝난다. 그런데 설치·적용처럼 **순서가
   * 곧 내용인** 스텝이 있다 — 설치 허용을 건너뛰면 다음이 진행되지 않는다. 그걸 한 문단에
   * 욱여넣으면 순서가 사라지고, 화면 밖 지식이 필요한 구간에서 가장 필요한 것이 순서다.
   */
  actions?: string[];
  /** 넓은 화면(데스크톱)에서 쓰는 자료. */
  media?: EasyStepMedia;
  /**
   * 좁은 화면에서 대신 쓰는 자료. 없으면 `media`를 그대로 쓴다.
   *
   * 폰으로 가이드를 보는 사람은 대개 **폰으로 편집도 한다.** 데스크톱 편집기 화면을 390px 폭
   * 카드에 넣으면 글자를 읽을 수 없고, 읽었더라도 자기 화면에 없는 UI라 따라 할 수가 없다.
   */
  mobileMedia?: EasyStepMedia;
  /**
   * 스텝 안에 접어 두는 심화 내용.
   *
   * 말풍선의 stretch·content 영역처럼 **처음 만드는 사람에게는 필요 없지만 한 번 막히면
   * 반드시 찾게 되는** 내용이 있다. 스텝 본문에 펼쳐 두면 8스텝 전체가 무거워져 "그대로 따라
   * 하면 된다"는 인상이 깨지고, 아래 상세 섹션으로만 보내면 문맥에서 멀어져 못 찾는다.
   *
   * 접어서 그 자리에 두면 둘 다 피한다. 기본은 닫혀 있고, 필요한 사람만 편다.
   */
  details?: EasyDetail[];
  hardStep?: boolean;
};

/** 접힌 심화 항목. 제목만 보이고 펴야 본문이 나온다. */
export type EasyDetail = {
  title: string;
  body: string;
};

export type PlatformGuide = {
  label: string;
  sourceVersion: string;
  sourcePath: string;
  intro: string;
  output: string;
  sections: GuideSection[];
  easySteps?: EasyStep[];
};

export const guideContent: Record<GuidePlatform, PlatformGuide> = {
  android: {
    label: "Android",
    sourceVersion: "Apeach 26.1.0",
    sourcePath: "android-sample-theme/apeach-26.1.0-source",
    intro: "이미지와 색상을 편집한 뒤 설치 가능한 APK로 만들고, 테마 앱에서 카카오톡에 적용합니다.",
    output: "APK · APK ZIP",
    easySteps: [
      {
        title: "마음에 드는 템플릿 고르기",
        caption: "연인·캐릭터·반려동물처럼 원하는 분위기를 골라요. 처음부터 만들지 않아도 돼요.",
        media: {
          type: "video",
          src: "/guide/editor/template-gallery.mp4",
          poster: "/guide/editor/template-gallery-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/template-gallery-mobile.mp4",
          poster: "/guide/editor/template-gallery-mobile-poster.webp",
          aspect: "9 / 16",
        },
      },
      {
        title: "바꿀 화면 고르기",
        caption: "화면을 고르면 미리보기가 그 화면으로 바뀌어요. 친구 목록, 채팅방, 잠금화면을 따로따로 꾸밀 수 있어요.",
        media: {
          type: "video",
          src: "/guide/editor/choose-screen.mp4",
          poster: "/guide/editor/choose-screen-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/choose-screen-mobile.mp4",
          poster: "/guide/editor/choose-screen-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "잠금화면도 꾸밀 수 있어요",
            body:
              "잠금화면은 배경과 숫자 암호 버튼을 함께 바꿔요. 버튼은 평소 모습과 눌렀을 때 " +
              "모습이 짝을 이뤄요. 패턴으로 잠금을 쓰고 있다면 숫자 버튼은 화면에 나오지 않아요.",
          },
          {
            title: "프로필과 앱 아이콘도 있어요",
            body:
              "프로필 기본 이미지는 작고 동그랗게 잘려요. 보여주고 싶은 부분이 가운데에 오게 " +
              "골라요. 앱 아이콘은 가장자리에 여백을 둔 정사각형이 안전해요.",
          },
        ],
      },
      {
        title: "색을 골라 바꾸기",
        caption: "팔레트에서 색을 고르면 미리보기가 바로 다시 칠해져요. 마음에 들 때까지 눌러 보면 돼요.",
        media: {
          type: "video",
          src: "/guide/editor/change-color.mp4",
          poster: "/guide/editor/change-color-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/change-color-mobile.mp4",
          poster: "/guide/editor/change-color-mobile-poster.webp",
          aspect: "9 / 16",
        },
      },
      {
        title: "배경 고르기",
        caption: "‘추천 에셋’에서 마음에 드는 배경을 고르면 미리보기에 바로 보여요. 내 사진을 올릴 수도 있어요.",
        actions: [
          "‘배경’ 그룹에서 바꾸고 싶은 배경을 골라요. 메인과 채팅방을 따로 정할 수 있어요.",
          "‘추천 에셋’에 이미 고를 수 있는 배경이 있어요. 내 사진을 꼭 올리지 않아도 돼요.",
          // 모르면 못 넘어가는 지점이라 여기 적는다. 이미지가 깔려 있으면 색은 투명한 부분에만
          // 보여서, 색만 쓰려고 골랐는데 아무것도 안 바뀌는 것처럼 느껴진다.
          "배경을 색으로만 채우고 싶다면 이미지를 ‘이미지 사용 안 함’으로 먼저 바꿔요. 이미지가 깔려 있으면 색이 가려져요.",
        ],
        media: {
          type: "video",
          src: "/guide/editor/pick-background.mp4",
          poster: "/guide/editor/pick-background-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/pick-background-mobile.mp4",
          poster: "/guide/editor/pick-background-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "어떤 사진이 배경으로 잘 어울릴까요",
            body:
              "세로로 긴 화면에 맞춰 잘려요. 반복되는 무늬가 아니라면 보여주고 싶은 부분을 " +
              "가운데에 두면 안전해요. 투명한 부분이 있으면 그 자리에는 배경 색이 비쳐요.",
          },
          {
            title: "배경을 바꿨더니 다른 색도 같이 바뀌었어요",
            body:
              "메인 배경 이미지를 바꾸면 평균색과 위아래 색을 살펴 관련 색을 맞춰 줘요. " +
              "직접 고친 색은 그대로 두니 안심하세요. 추천 색은 필요할 때 다시 적용할 수 있어요.",
          },
        ],
      },
      {
        title: "탭 아이콘 바꾸기",
        caption: "아래쪽 탭 아이콘도 바꿀 수 있어요. 탭 하나에 평소 모습과 눌렀을 때 모습, 두 장이 짝을 이뤄요.",
        actions: [
          "‘채팅·탭바’ 화면에서 아이콘 그룹을 열어요.",
          "친구·채팅·Now·쇼핑·더보기처럼 바꾸고 싶은 탭을 골라요.",
          "평소 모습과 선택된 모습을 각각 넣어요. 배경이 비치는 PNG가 가장 잘 어울려요.",
        ],
        media: {
          type: "video",
          src: "/guide/editor/pick-icons.mp4",
          poster: "/guide/editor/pick-icons-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/pick-icons-mobile.mp4",
          poster: "/guide/editor/pick-icons-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "아이콘 이미지는 어떻게 준비하나요",
            body:
              "배경이 비치는 PNG가 가장 잘 어울려요. JPG도 넣을 수는 있지만 투명한 부분을 " +
              "담지 못해서 아이콘 뒤에 네모난 바탕이 남아요. 작은 그림을 크게 늘리면 흐려지니 " +
              "넉넉한 크기의 원본을 쓰세요.",
          },
        ],
      },
      {
        title: "말풍선까지 내 취향으로",
        caption: "내 말풍선과 상대 말풍선을 바꿔요. 각각 첫 말풍선과 이어지는 말풍선이 따로라 모두 네 종류예요.",
        actions: [
          "‘채팅방’ 화면에서 말풍선 그룹을 열어요.",
          "‘내 말풍선 1’은 첫 번째 말풍선, ‘내 말풍선 2’는 이어서 보내는 말풍선이에요.",
          "상대 말풍선도 같은 방식으로 두 종류를 넣어요.",
          "모서리가 늘어나거나 글자가 말풍선 밖으로 나오면 아래 ‘말풍선을 더 다듬고 싶다면’을 펼쳐 보세요.",
          "오른쪽 채팅방 미리보기로 실제로 어떻게 보이는지 확인해요.",
        ],
        // 주석 달린 정지 화면을 대신한다. 좌표 주석은 그 스크린샷에 맞춰 손으로 맞춘 값이라
        // 화면이 바뀌면 조용히 엉뚱한 곳을 가리키는데, 영상은 커서가 직접 짚어 그 문제가 없다.
        media: {
          type: "video",
          src: "/guide/editor/edit-bubble.mp4",
          poster: "/guide/editor/edit-bubble-poster.webp",
          aspect: "16 / 9",
        },
        // 모바일이 데스크톱의 갑절 길이인 것은 연출이 아니라 화면 구조다. 모바일 패널은 슬롯을
        // 고를 때마다 목록이 접혀서, 데스크톱이 네 번 누르는 일을 여덟 번 눌러야 한다.
        mobileMedia: {
          type: "video",
          src: "/guide/editor/edit-bubble-mobile.mp4",
          poster: "/guide/editor/edit-bubble-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "말풍선을 더 다듬고 싶다면",
            body:
              "말풍선은 글자 길이에 따라 늘어나야 해서, 이미지 어디를 늘릴지 알려줘야 해요. " +
              "슬롯을 고르면 나오는 ‘나만의 말풍선 만들기’에서 늘어나는 영역(stretch)과 글자가 들어갈 영역(content)을 조절할 수 있어요.",
          },
          {
            title: "모서리가 이상하게 늘어나요",
            body:
              "늘어나는 영역에 모서리가 들어가 있어서예요. 모서리는 그대로 두고 가운데의 " +
              "반복해도 티가 안 나는 부분만 늘어나게 잡으면 돼요.",
          },
          {
            title: "글자가 말풍선 밖으로 나와요",
            body:
              "글자 영역이 말풍선보다 넓게 잡혀 있어요. 말풍선 안쪽 여백을 남기고 좁히면 " +
              "긴 문장에서도 글자가 안쪽에 머물러요.",
          },
        ],
      },
      {
        title: "테마 파일 만들기",
        caption: "‘다운로드’를 누르면 앱 이름과 파일 종류를 고르는 창이 열려요. 바로 받아지는 게 아니라 서버가 잠깐 만들어 줘요.",
        actions: [
          "오른쪽 위 ‘다운로드’를 눌러요. 앱 이름과 필요한 크레딧을 확인하는 창이 열려요.",
          "파일 종류를 골라요. ‘내가 바로 설치’는 .apk, ‘카카오톡으로 공유하기 쉬운 파일’은 .zip이에요.",
          "‘테마 파일 받기’를 누르면 만든 내용을 서버로 올리기 시작해요. 올라가는 동안에는 창을 닫지 말고 그대로 두세요.",
          "창에 ‘작업 접수 완료’가 뜨면 서버가 이어서 만들어요. 그때부터는 창을 닫거나 다른 일을 해도 돼요.",
          "만든 파일은 7일 동안 보관돼요. 마이페이지에서 다시 받을 수 있어요.",
        ],
        // 영상은 창을 열어 무엇을 고르는지까지만 보여주고 취소로 닫는다. 확인 버튼은 크레딧을 쓰고
        // 실제 빌드를 시작하므로 촬영이 누를 수 없다 — 그 다음은 위 순서가 글로 적는다.
        media: {
          type: "video",
          src: "/guide/editor/export-dialog.mp4",
          poster: "/guide/editor/export-dialog-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/export-dialog-mobile.mp4",
          poster: "/guide/editor/export-dialog-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "닫기 버튼이 안 눌려요",
            body:
              "접수가 끝나기 전에는 닫기 버튼이 일부러 잠겨 있어요. 멈춘 게 아니라 만든 내용을 " +
              "서버로 올리는 중이에요. 이때 창을 닫거나 브라우저를 끄면 서버에 아무것도 남지 않아서 " +
              "처음부터 다시 해야 해요. ‘작업 접수 완료’가 뜨면 잠금이 풀려요.",
          },
        ],
      },
      {
        title: "설치하고 카톡에 적용하기",
        caption: "받은 파일을 열어 설치한 뒤, 테마 앱에서 ‘테마 적용하기’를 누르면 끝이에요. 중간에 경고가 두 번 뜨는데 둘 다 그냥 진행하면 돼요.",
        actions: [
          "APK 파일을 열어요. APK ZIP을 받았다면 먼저 압축을 풀고 안에 있는 APK를 찾아요.",
          "어떤 앱으로 열지 물으면 설치 프로그램을 고르고 ‘한 번만’을 눌러요.",
          "‘출처를 알 수 없는 앱’ 경고가 뜨면 ‘무시하고 설치’를 눌러요. 내가 만든 파일이라 괜찮아요.",
          "‘기기 보호를 위해 앱 차단됨’이 뜨면 ‘세부정보 더보기’를 펼쳐요. 펼치기 전에는 ‘확인’ 버튼만 보여요.",
          "펼쳐서 나온 ‘무시하고 설치하기’를 눌러요. ‘확인’을 누르면 설치가 취소돼요.",
          "설치가 끝나면 ‘열기’로 테마 앱을 띄우고 아래쪽 ‘테마 적용하기’를 눌러요.",
          "카카오톡 테마 설정이 열리면 새 테마를 골라 적용하고 화면을 확인해요.",
        ],
        // 가이드에서 가장 막히는 스텝이다. 막히는 곳은 설치 허용이 아니라 Play 프로텍트 차단
        // 창이다 — 접힌 상태에서는 큰 버튼이 '확인'뿐이라 차단됐다고 읽고 끝낸다.
        hardStep: true,
        // 기기마다 문구가 다를 수 있어 화면 이름 대신 눌러야 할 글자를 그대로 적었다.
        // 폰 화면을 찍은 것이라 데스크톱에서도 세로로 보여준다. `mobileMedia`를 두지 않는다.
        media: {
          type: "video",
          src: "/guide/editor/android-install-apply.mp4",
          poster: "/guide/editor/android-install-apply-poster.webp",
          aspect: "1080 / 2122",
        },
        details: [
          {
            title: "만들 때마다 앱이 하나씩 늘어나요",
            body:
              "지금은 테마를 내보낼 때마다 별도의 테마 앱으로 설치돼요. 더 쓰지 않는 테마는 " +
              "기기 설정의 앱 목록에서 하나씩 지우면 돼요.",
          },
        ],
      },
    ],
    sections: [
      {
        id: "android-troubleshooting",
        eyebrow: "01 · CHECKLIST",
        title: "문제가 생겼을 때",
        summary: "내보내기를 다시 하기 전에 아래 항목을 먼저 확인하세요.",
        steps: [
          { title: "아이콘이 흐림", body: "작은 이미지를 크게 확대한 경우입니다. 여백이 있는 고해상도 정사각형 원본으로 교체합니다." },
          { title: "말풍선 모서리가 늘어남", body: "stretch 영역이 모서리를 포함했는지 확인하고 중앙의 반복 가능한 영역만 지정합니다." },
          { title: "APK 설치가 차단됨", body: "파일을 연 브라우저 또는 파일 앱에만 설치 권한을 허용했는지 확인합니다. Play 프로텍트 창이라면 ‘세부정보 더보기’를 펼쳐야 ‘무시하고 설치하기’가 나타납니다." },
          { title: "적용 버튼이 동작하지 않음", body: "카카오톡 설치 여부를 확인하고 테마 앱을 종료한 뒤 다시 실행합니다." },
        ],
      },
    ],
  },
  ios: {
    label: "iOS",
    sourceVersion: "Apeach 25.8.0",
    sourcePath: "samples/ios/apeach-25.8.0",
    intro: "이미지와 CSS 설정을 하나의 .ktheme 패키지로 만들고, iPhone에서 카카오톡으로 열어 적용합니다.",
    output: ".ktheme · Theme ZIP",
    /*
     * iOS는 9스텝이다. Android보다 하나 많은 것은 연출이 아니라 **파일이 거치는 곳이 하나 더
     * 많기 때문**이다. Android는 APK를 받아 바로 설치하지만, iOS는 받은 파일을 카카오톡으로
     * 보내야 열 수 있다.
     *
     * ①~⑥은 **Android와 같은 클립을 쓴다.** 편집기가 플랫폼 공용이라 화면이 같고, 같은 화면을
     * 두 번 찍으면 한쪽만 낡는다. 갈리는 것은 ⑦부터다.
     *
     * ⑦⑧⑨는 실기기 스크린샷을 이어 붙인 클립이다(`scripts/capture/stills.mjs`). Safari의
     * 다운로드 메뉴와 카카오톡 앱은 촬영으로 담을 수 없다 — 촬영은 페이지 안쪽만 본다.
     */
    easySteps: [
      {
        title: "마음에 드는 템플릿 고르기",
        caption: "연인·캐릭터·반려동물처럼 원하는 분위기를 골라요. 처음부터 만들지 않아도 돼요.",
        media: {
          type: "video",
          src: "/guide/editor/template-gallery.mp4",
          poster: "/guide/editor/template-gallery-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/template-gallery-mobile.mp4",
          poster: "/guide/editor/template-gallery-mobile-poster.webp",
          aspect: "9 / 16",
        },
      },
      {
        title: "바꿀 화면 고르기",
        caption: "화면을 고르면 미리보기가 그 화면으로 바뀌어요. 친구 목록, 채팅방, 잠금화면을 따로따로 꾸밀 수 있어요.",
        media: {
          type: "video",
          src: "/guide/editor/choose-screen.mp4",
          poster: "/guide/editor/choose-screen-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/choose-screen-mobile.mp4",
          poster: "/guide/editor/choose-screen-mobile-poster.webp",
          aspect: "9 / 16",
        },
      },
      {
        title: "색을 골라 바꾸기",
        caption: "팔레트에서 색을 고르면 미리보기가 바로 다시 칠해져요. 마음에 들 때까지 눌러 보면 돼요.",
        media: {
          type: "video",
          src: "/guide/editor/change-color.mp4",
          poster: "/guide/editor/change-color-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/change-color-mobile.mp4",
          poster: "/guide/editor/change-color-mobile-poster.webp",
          aspect: "9 / 16",
        },
      },
      {
        title: "배경 고르기",
        caption: "‘추천 에셋’에서 마음에 드는 배경을 고르면 미리보기에 바로 보여요. 내 사진을 올릴 수도 있어요.",
        actions: [
          "‘배경’ 그룹에서 바꾸고 싶은 배경을 골라요. 메인과 채팅방을 따로 정할 수 있어요.",
          "‘추천 에셋’에 이미 고를 수 있는 배경이 있어요. 내 사진을 꼭 올리지 않아도 돼요.",
          "배경을 색으로만 채우고 싶다면 이미지를 ‘이미지 사용 안 함’으로 먼저 바꿔요. 이미지가 깔려 있으면 색이 가려져요.",
        ],
        media: {
          type: "video",
          src: "/guide/editor/pick-background.mp4",
          poster: "/guide/editor/pick-background-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/pick-background-mobile.mp4",
          poster: "/guide/editor/pick-background-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "사진은 얼마나 큰 걸 올려야 하나요",
            body:
              "iPhone 화면은 같은 그림을 두 배, 세 배 크기로 함께 써요. 가지고 있는 것 중 " +
              "가장 선명한 원본 하나를 올리면 필요한 크기를 알아서 만들어요.",
          },
          {
            title: "어떤 사진이 배경으로 잘 어울릴까요",
            body:
              "세로로 긴 화면에 맞춰 잘려요. 반복되는 무늬가 아니라면 보여주고 싶은 부분을 " +
              "가운데에 두면 안전해요. 투명한 부분이 있으면 그 자리에는 배경 색이 비쳐요.",
          },
          {
            title: "배경을 바꿨더니 다른 색도 같이 바뀌었어요",
            body:
              "메인 배경 이미지를 바꾸면 평균색과 위아래 색을 살펴 관련 색을 맞춰 줘요. " +
              "직접 고친 색은 그대로 두니 안심하세요. 추천 색은 필요할 때 다시 적용할 수 있어요.",
          },
        ],
      },
      {
        title: "탭 아이콘 바꾸기",
        caption: "아래쪽 탭 아이콘도 바꿀 수 있어요. 탭 하나에 평소 모습과 눌렀을 때 모습, 두 장이 짝을 이뤄요.",
        actions: [
          "‘채팅·탭바’ 화면에서 아이콘 그룹을 열어요.",
          "친구·채팅·Now·쇼핑·더보기처럼 바꾸고 싶은 탭을 골라요.",
          "평소 모습과 선택된 모습을 각각 넣어요. 배경이 비치는 PNG가 가장 잘 어울려요.",
        ],
        media: {
          type: "video",
          src: "/guide/editor/pick-icons.mp4",
          poster: "/guide/editor/pick-icons-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/pick-icons-mobile.mp4",
          poster: "/guide/editor/pick-icons-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "아이콘 이미지는 어떻게 준비하나요",
            body:
              "평소 모습과 선택된 모습을 한 쌍으로 맞춰요. 배경이 비치는 PNG가 가장 잘 어울려요. " +
              "이름만 .png로 바꾼 파일은 PNG가 아니라서 아이콘이 보이지 않을 수 있으니, " +
              "이미지 편집 도구에서 PNG로 내보낸 원본을 쓰세요.",
          },
        ],
      },
      {
        title: "말풍선까지 내 취향으로",
        caption: "내 말풍선과 상대 말풍선을 바꿔요. 각각 첫 말풍선과 이어지는 말풍선이 따로라 모두 네 종류예요.",
        actions: [
          "‘채팅방’ 화면에서 말풍선 그룹을 열어요.",
          "‘내 말풍선 1’은 첫 번째 말풍선, ‘내 말풍선 2’는 이어서 보내는 말풍선이에요.",
          "상대 말풍선도 같은 방식으로 두 종류를 넣어요.",
          "모서리가 늘어나거나 글자가 말풍선 밖으로 나오면 아래 ‘말풍선을 더 다듬고 싶다면’을 펼쳐 보세요.",
          "오른쪽 채팅방 미리보기로 실제로 어떻게 보이는지 확인해요.",
        ],
        media: {
          type: "video",
          src: "/guide/editor/edit-bubble.mp4",
          poster: "/guide/editor/edit-bubble-poster.webp",
          aspect: "16 / 9",
        },
        mobileMedia: {
          type: "video",
          src: "/guide/editor/edit-bubble-mobile.mp4",
          poster: "/guide/editor/edit-bubble-mobile-poster.webp",
          aspect: "9 / 16",
        },
        details: [
          {
            title: "말풍선을 더 다듬고 싶다면",
            body:
              "말풍선은 글자 길이에 따라 늘어나야 해서, 이미지 어디를 늘릴지 알려줘야 해요. " +
              "슬롯을 고르면 나오는 ‘나만의 말풍선 만들기’에서 늘어나는 영역(stretch)과 글자가 들어갈 영역(content)을 조절할 수 있어요.",
          },
          {
            title: "모서리가 이상하게 늘어나요",
            body:
              "늘어나는 영역에 모서리가 들어가 있어서예요. 모서리는 그대로 두고 가운데의 " +
              "반복해도 티가 안 나는 부분만 늘어나게 잡으면 돼요.",
          },
          {
            title: "글자가 말풍선 밖으로 나와요",
            body:
              "글자 영역이 말풍선보다 넓게 잡혀 있어요. 말풍선 안쪽 여백을 남기고 좁히면 " +
              "긴 문장에서도 글자가 안쪽에 머물러요.",
          },
        ],
      },
      {
        title: "테마 파일 만들기",
        caption: "‘다운로드’를 누르면 이름과 크레딧을 확인하는 창이 열려요. 바로 받아지는 게 아니라 서버가 잠깐 만들어 줘요.",
        actions: [
          "오른쪽 위 ‘다운로드’를 눌러요. 테마 이름과 필요한 크레딧을 확인하는 창이 열려요.",
          "‘다운로드 시작’을 누르면 만든 내용을 서버로 올리기 시작해요. 올라가는 동안에는 창을 닫지 말고 그대로 두세요.",
          "창에 ‘작업 접수 완료’가 뜨면 서버가 이어서 .ktheme 파일을 만들어요. 그때부터는 창을 닫거나 다른 일을 해도 돼요.",
          "만든 파일은 7일 동안 보관돼요. 그 안에는 마이페이지에서 다시 받을 수 있어요.",
        ],
        /*
         * 여기까지가 우리 화면이다. 실기기 스크린샷을 쓰는 이유는 다음 두 스텝과 형태를 맞추기
         * 위해서이기도 하지만, "생성 중" 화면이 실제 빌드를 돌려야 나오기 때문이기도 하다 —
         * 촬영이 그 버튼을 누르면 매번 크레딧이 나간다.
         *
         * 폰 화면을 찍은 것이라 데스크톱에서도 세로로 보여준다. `mobileMedia`를 따로 두지 않는다.
         */
        media: {
          type: "video",
          src: "/guide/editor/ios-make-file.mp4",
          poster: "/guide/editor/ios-make-file-poster.webp",
          aspect: "1206 / 2432",
        },
        details: [
          {
            title: "닫기 버튼이 안 눌려요",
            body:
              "접수가 끝나기 전에는 닫기 버튼이 일부러 잠겨 있어요. 멈춘 게 아니라 만든 내용을 " +
              "서버로 올리는 중이에요. 이때 창을 닫거나 브라우저를 끄면 서버에 아무것도 남지 않아서 " +
              "처음부터 다시 해야 해요. ‘작업 접수 완료’가 뜨면 잠금이 풀려요.",
          },
        ],
      },
      {
        title: "받은 파일 찾기",
        caption: "Safari가 받은 파일은 화면에 남지 않아요. 주소창 옆 ‘⋯’ 메뉴 안 ‘다운로드’에 들어 있어요.",
        actions: [
          "‘다운로드하겠습니까?’가 뜨면 ‘다운로드’를 눌러요. 이 확인을 놓치면 파일이 받아지지 않아요.",
          "받아지면 주소창 왼쪽에 아래 화살표 표시가 생겨요.",
          "주소창 오른쪽 ‘⋯’을 누르고 목록에서 ‘다운로드’를 골라요.",
          "받은 테마 파일이 보이면 눌러서 엽니다.",
          "여기서 파일을 못 찾아도 괜찮아요. 마이페이지에서 7일 안에 다시 받을 수 있어요.",
        ],
        // iOS에서 가장 막히는 곳이라 `hardStep`을 준다. 받았다는 안내는 나오는데 파일이 어디
        // 있는지는 화면에 없어서, 경로를 모르면 여기서 멈춘다.
        hardStep: true,
        media: {
          type: "video",
          src: "/guide/editor/ios-download-file.mp4",
          poster: "/guide/editor/ios-download-file-poster.webp",
          aspect: "1206 / 2432",
        },
      },
      {
        title: "카카오톡으로 보내 적용하기",
        caption: "받은 파일을 카카오톡으로 보낸 뒤 그 파일을 열면 테마를 적용할 수 있어요. 친구에게 보낼 필요 없이 ‘나에게’ 보내면 돼요.",
        actions: [
          "파일 화면 아래 ‘카카오톡’을 눌러요. 공유 목록에서 골라도 돼요.",
          "보낼 곳을 고르는 화면에서 맨 아래 ‘나에게’를 골라요.",
          "카카오톡 대화방에 온 파일의 ‘열기’를 눌러요.",
          "‘테마 적용하기’를 누르면 끝나요. ‘테마 목록보기’에서 나중에 다시 고를 수도 있어요.",
        ],
        hardStep: true,
        media: {
          type: "video",
          src: "/guide/editor/ios-apply-theme.mp4",
          poster: "/guide/editor/ios-apply-theme-poster.webp",
          aspect: "1206 / 2432",
        },
      },
    ],
    sections: [
      {
        id: "ios-troubleshooting",
        eyebrow: "01 · CHECKLIST",
        title: "문제가 생겼을 때",
        summary: "파일을 다시 전달하기 전에 패키지와 이미지 형식을 확인하세요.",
        steps: [
          { title: "공유 메뉴에 카카오톡이 없음", body: "카카오톡이 최신 상태인지 확인하고 공유 대상의 ‘더 보기’에서 카카오톡을 활성화합니다." },
          { title: "테마 파일을 열 수 없음", body: "확장자가 .ktheme인지, 압축 파일 내부가 아니라 실제 파일을 선택했는지 확인합니다." },
          { title: "일부 이미지만 보이지 않음", body: "실제 PNG 형식인지, CSS가 참조하는 기본 이름과 @2x/@3x 파일 이름이 일치하는지 확인합니다." },
          { title: "말풍선 글자가 잘림", body: "말풍선 고급 편집에서 content inset을 늘리고 다시 내보냅니다." },
        ],
      },
    ],
  },
};

export function isGuidePlatform(value: string | undefined): value is GuidePlatform {
  return value === "android" || value === "ios";
}

