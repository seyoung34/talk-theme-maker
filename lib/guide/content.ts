export type GuidePlatform = "android" | "ios";

export type GuideMode = "easy" | "detailed";

export type GuideStep = {
  title: string;
  body: string;
  note?: string;
};

export type GuideSpecification = {
  subject: string;
  value: string;
  description: string;
};

export type GuideSection = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  steps?: GuideStep[];
  specifications?: GuideSpecification[];
  caution?: string;
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
  hardStep?: boolean;
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
      },
      {
        title: "말풍선까지 내 취향으로",
        caption: "내 말풍선과 상대 말풍선을 바꿔요. 각각 첫 말풍선과 이어지는 말풍선이 따로라 모두 네 종류예요.",
        actions: [
          "‘채팅방’ 화면에서 말풍선 그룹을 열어요.",
          "‘내 말풍선 1’은 첫 번째 말풍선, ‘내 말풍선 2’는 이어서 보내는 말풍선이에요.",
          "상대 말풍선도 같은 방식으로 두 종류를 넣어요.",
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
      },
      {
        title: "테마 파일 만들기",
        caption: "‘다운로드’를 누르면 앱 이름과 파일 종류를 고르는 창이 열려요. 바로 받아지는 게 아니라 서버가 잠깐 만들어 줘요.",
        actions: [
          "오른쪽 위 ‘다운로드’를 눌러요. 앱 이름과 필요한 크레딧을 확인하는 창이 열려요.",
          "파일 종류를 골라요. ‘내가 바로 설치’는 .apk, ‘카카오톡으로 공유하기 쉬운 파일’은 .zip이에요.",
          "‘테마 파일 받기’를 누르면 서버가 만들기 시작해요. 창을 닫아도 계속 진행돼요.",
          "만든 파일은 7일 동안 보관돼요. 내 계정에서 다시 받을 수 있어요.",
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
      },
      {
        title: "설치하고 카톡에 적용하기",
        caption: "받은 파일을 열어 설치한 뒤, 테마 앱에서 ‘테마 적용하기’를 누르면 끝이에요.",
        actions: [
          "APK 파일을 열어요. APK ZIP을 받았다면 먼저 압축을 풀고 안에 있는 APK를 찾아요.",
          "‘알 수 없는 앱 설치’를 허용해 달라는 팝업이 뜨면 허용해요. 파일을 연 앱에만 잠깐 허용하면 돼요.",
          "설치가 끝나면 새로 생긴 테마 앱을 열고 아래쪽 ‘테마 적용하기’를 눌러요.",
          "카카오톡 테마 설정이 열리면 새 테마를 골라 적용하고 화면을 확인해요.",
        ],
        hardStep: true,
      },
    ],
    sections: [
      {
        id: "android-quick-start",
        eyebrow: "01 · QUICK START",
        title: "처음부터 적용까지",
        summary: "템플릿 선택부터 휴대폰 적용까지 필요한 흐름만 먼저 확인하세요.",
        steps: [
          { title: "템플릿과 Android 선택", body: "Template에서 시작할 디자인을 고르고 Android 편집기로 이동합니다." },
          { title: "화면별 요소 편집", body: "메인, 하단 탭, 채팅방, 잠금화면 순서로 이미지와 색상을 교체합니다." },
          { title: "미리보기와 말풍선 확인", body: "실제 화면 조합을 확인하고 말풍선의 늘어나는 영역과 글자 영역을 조정합니다." },
          { title: "APK 내보내기", body: "내보내기에서 앱 이름과 버전을 확인한 뒤 APK를 생성합니다.", note: "내보낼 때마다 고유 applicationId가 자동 발급됩니다." },
          { title: "설치 후 테마 적용", body: "APK를 설치하고 생성된 테마 앱을 열어 ‘테마 적용하기’를 누릅니다." },
        ],
      },
      {
        id: "android-edit",
        eyebrow: "02 · EDITING",
        title: "요소별 편집 가이드",
        summary: "각 이미지는 쓰이는 화면과 상태가 다릅니다. 먼저 큰 배경을 정하고 작은 요소를 맞추면 전체 톤이 안정적입니다.",
        steps: [
          { title: "배경", body: "메인과 채팅방 배경은 세로 화면을 기준으로 준비합니다. 배경 이미지를 넣어도 배경 색상은 이미지의 투명 영역과 이미지가 표시되지 않는 기본 화면에 함께 사용됩니다.", note: "메인 배경 이미지를 바꾸면 평균색·상단색·하단색을 분석해 관련 색상을 자동으로 맞춥니다. 직접 바꾼 색상은 유지되며 필요할 때 추천 색을 다시 적용할 수 있습니다." },
          { title: "탭 아이콘", body: "친구·채팅·NOW·쇼핑·더보기 아이콘은 기본 상태와 선택 상태를 한 쌍으로 맞춥니다. 투명 배경 PNG가 가장 안전합니다." },
          { title: "말풍선", body: "내 말풍선과 상대 말풍선, 단독형과 연속형을 구분합니다. 고급 편집에서 stretch와 content 영역을 조정해 모서리와 글자가 깨지지 않게 합니다." },
          { title: "잠금화면", body: "배경 이미지와 네 개의 passcode 기본·선택 이미지를 함께 구성합니다. 패턴 방식에서는 숫자 암호 요소가 표시되지 않습니다." },
          { title: "프로필과 앱 아이콘", body: "프로필 기본 이미지는 작은 원형 크롭을 고려하고, 앱 아이콘은 가장자리 여백을 충분히 둔 정사각형 원본을 권장합니다." },
        ],
        caution: "JPG도 편집기에 넣을 수 있지만 투명도가 필요한 아이콘과 말풍선은 PNG 원본을 권장합니다.",
      },
      {
        id: "android-apply",
        eyebrow: "03 · APPLY",
        title: "APK 설치와 적용",
        summary: "APK는 설치 파일이고 APK ZIP은 공유·보관용 압축 파일입니다.",
        steps: [
          { title: "파일 준비", body: "APK를 선택했다면 바로 설치할 수 있습니다. APK ZIP을 선택했다면 먼저 압축을 풀어 내부 APK를 찾습니다." },
          { title: "설치 허용", body: "브라우저나 파일 앱에서 APK를 열고, Android가 요청하면 해당 앱의 ‘알 수 없는 앱 설치’를 일시적으로 허용합니다." },
          { title: "테마 앱 실행", body: "설치가 끝나면 테마 앱을 열고 화면 아래의 ‘테마 적용하기’ 버튼을 누릅니다." },
          { title: "카카오톡에서 확인", body: "카카오톡 테마 설정 화면으로 이동하면 새 테마를 선택해 적용하고 주요 화면을 확인합니다." },
        ],
        caution: "현재는 내보내기마다 별도 테마 앱으로 설치됩니다. 테스트가 끝난 APK는 기기 설정에서 개별 삭제할 수 있습니다.",
      },
      {
        id: "android-spec",
        eyebrow: "04 · SPECIFICATION",
        title: "상세 규격",
        summary: "Maker가 생성하는 구조를 이해하면 원본 이미지를 준비하거나 결과물을 디버깅하기 쉽습니다.",
        specifications: [
          { subject: "일반 이미지", value: "PNG · drawable-xxhdpi", description: "배경, 탭 아이콘, 프로필, passcode 이미지가 들어갑니다." },
          { subject: "말풍선", value: ".9.png", description: "1px 테두리의 stretch/content 정보를 포함하는 Android Nine-patch 이미지입니다." },
          { subject: "대표 경로", value: "src/main/theme/drawable-xxhdpi/", description: "대부분의 테마 이미지가 생성되는 sample theme 기준 경로입니다." },
          { subject: "색상", value: "src/main/theme/values/colors.xml", description: "헤더, 본문, 입력창, 잠금화면 등의 색상 리소스가 기록됩니다." },
          { subject: "앱 식별자", value: "com.kakao.talk.theme.u…e000001", description: "사용자 비식별 키와 내보내기 번호를 조합해 서버가 자동 생성합니다." },
          { subject: "설치 연결", value: "kakaotalk://settings/theme/{packageName}", description: "sample 앱의 적용 버튼이 카카오톡 테마 설정을 여는 방식입니다." },
        ],
      },
      {
        id: "android-troubleshooting",
        eyebrow: "05 · CHECKLIST",
        title: "문제가 생겼을 때",
        summary: "내보내기를 다시 하기 전에 아래 항목을 먼저 확인하세요.",
        steps: [
          { title: "아이콘이 흐림", body: "작은 이미지를 크게 확대한 경우입니다. 여백이 있는 고해상도 정사각형 원본으로 교체합니다." },
          { title: "말풍선 모서리가 늘어남", body: "stretch 영역이 모서리를 포함했는지 확인하고 중앙의 반복 가능한 영역만 지정합니다." },
          { title: "APK 설치가 차단됨", body: "파일을 연 브라우저 또는 파일 앱에만 설치 권한을 허용했는지 확인합니다." },
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
    sections: [
      {
        id: "ios-quick-start",
        eyebrow: "01 · QUICK START",
        title: "처음부터 적용까지",
        summary: "iOS는 CSS와 배율별 이미지가 함께 구성됩니다. Maker가 구조를 자동으로 생성합니다.",
        steps: [
          { title: "템플릿과 iOS 선택", body: "Template에서 디자인을 고르고 iOS 편집기로 이동합니다." },
          { title: "화면별 요소 편집", body: "메인, 탭, 채팅방의 이미지와 색상을 순서대로 조정합니다." },
          { title: "말풍선 영역 확인", body: "말풍선의 늘어나는 기준점과 텍스트 여백을 미리보기에서 확인합니다." },
          { title: ".ktheme 내보내기", body: "테마 이름과 버전을 확인하고 .ktheme 파일을 생성합니다.", note: "고유 identifier는 내보낼 때 서버에서 자동 발급됩니다." },
          { title: "iPhone에서 카카오톡으로 열기", body: "다운로드한 파일을 iPhone으로 전달한 뒤 공유 메뉴에서 카카오톡으로 엽니다." },
        ],
      },
      {
        id: "ios-edit",
        eyebrow: "02 · EDITING",
        title: "요소별 편집 가이드",
        summary: "iOS는 같은 이미지의 @2x와 @3x 변형을 사용합니다. Maker에서는 가능한 한 큰 원본 하나를 준비하면 됩니다.",
        steps: [
          { title: "원본 배율", body: "가능하면 @3x 수준의 선명한 원본을 사용합니다. Maker가 필요한 슬롯에서 @2x와 @3x 파일을 생성합니다." },
          { title: "배경", body: "메인과 채팅방 배경은 화면 크롭을 고려합니다. 반복 패턴이 아니라면 핵심 요소를 중앙에 배치합니다." },
          { title: "탭 아이콘", body: "기본과 Selected 상태를 한 쌍으로 준비합니다. CSS는 배율 접미사가 없는 기본 이름을 참조합니다." },
          { title: "말풍선", body: "Send·Receive와 01·02 유형을 구분합니다. inset은 글자 여백, stretch는 늘어날 기준점입니다." },
          { title: "이미지 형식", body: "iOS 출력의 Images 파일은 실제 PNG여야 합니다. 투명 배경과 가장자리 반투명 픽셀을 확인합니다." },
        ],
        caution: "파일 확장자만 .png로 바꾼 이미지는 유효한 PNG가 아닙니다. 원본을 이미지 편집 도구에서 PNG로 내보내세요.",
      },
      {
        id: "ios-apply",
        eyebrow: "03 · APPLY",
        title: ".ktheme 전달과 적용",
        summary: "iOS와 카카오톡 버전에 따라 공유 화면의 명칭과 배치가 달라질 수 있습니다.",
        steps: [
          { title: "파일 선택", body: "일반 적용에는 .ktheme을 사용합니다. Theme ZIP은 구조 확인과 보관용입니다." },
          { title: "iPhone으로 전달", body: "AirDrop, 메일, 메신저 또는 클라우드 드라이브를 이용해 .ktheme 파일을 iPhone의 파일 앱에 저장합니다." },
          { title: "공유 메뉴 열기", body: "파일 앱에서 .ktheme을 길게 누르거나 열어 공유 메뉴를 표시합니다." },
          { title: "카카오톡으로 열기", body: "공유 대상에서 카카오톡을 선택하고 표시되는 테마 적용 흐름을 완료합니다." },
        ],
        caution: "현재 적용 단계는 sample package 구조를 기준으로 한 1차 안내입니다. 실제 기기 검증 후 버전별 화면을 보강할 예정입니다.",
      },
      {
        id: "ios-spec",
        eyebrow: "04 · SPECIFICATION",
        title: "상세 규격",
        summary: "sample theme의 패키지 구조와 CSS 참조 규칙입니다.",
        specifications: [
          { subject: "필수 파일", value: "KakaoTalkTheme.css", description: "패키지 루트에 정확한 이름으로 존재해야 합니다." },
          { subject: "이미지 폴더", value: "Images/", description: "테마 이미지 리소스가 위치하며 실제 PNG 형식을 사용합니다." },
          { subject: "배율", value: "name@2x.png · name@3x.png", description: "같은 논리 크기의 Retina 이미지 세트를 표현합니다." },
          { subject: "CSS 이미지 참조", value: "name.png", description: "CSS에서는 @2x/@3x 접미사 없이 기본 파일명을 사용합니다." },
          { subject: "테마 정보", value: "ManifestStyle", description: "테마 이름, 버전, 작성자, theme-id가 기록됩니다." },
          { subject: "말풍선", value: "edgeinsets · image stretch", description: "CSS에서 텍스트 여백과 이미지 확장 기준을 지정합니다." },
        ],
      },
      {
        id: "ios-troubleshooting",
        eyebrow: "05 · CHECKLIST",
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

export function isGuideMode(value: string | undefined): value is GuideMode {
  return value === "easy" || value === "detailed";
}
