import Link from "next/link";

const modules = [
  {
    title: "템플릿 선택",
    status: "시작",
    description: "카드에서 템플릿을 고르고 Android 또는 iOS로 편집을 시작합니다.",
    href: "/template",
  },
  {
    title: "말풍선 에디터",
    status: "사용 가능",
    description: "Android .9.png 마커와 iOS inset/stretch 값을 확인하고 수정합니다.",
    href: "/editor",
  },
  {
    title: "화면 미리보기",
    status: "진행 중",
    description: "채팅방, 친구 목록, 하단 탭, 프로필 화면에서 업로드한 이미지를 확인합니다.",
    href: "/edit",
  },
  {
    title: "내보내기",
    status: "예정",
    description: "Android APK와 iOS ktheme 생성을 플랫폼별로 분리해 준비합니다.",
    href: "/edit",
  },
];

const workflow = ["템플릿 선택", "플랫폼 선택", "이미지 업로드", "화면 미리보기", "말풍선 정밀 수정", "내보내기 준비"];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f8f5] px-5 py-6 text-[#111111]">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl content-between gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[30px] border border-[#d7ddd8] bg-white p-6 shadow-[0_18px_60px_rgba(17,17,17,0.08)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#5d6670]">KakaoTalk Theme Maker</p>
            <h1 className="mt-2 text-4xl font-black">카카오톡 테마 제작 도구</h1>
          </div>
          <div className="rounded-full bg-[#eeee00] px-4 py-2 text-sm font-extrabold">
            내부 제작용
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr] lg:items-stretch">
          <div className="grid content-between gap-8 rounded-[34px] border border-[#d7ddd8] bg-white p-8 shadow-[0_18px_60px_rgba(17,17,17,0.07)]">
            <p className="max-w-3xl text-xl font-bold leading-9 text-[#4d5660]">
              템플릿 카드에서 기본값을 확인하고 Android 또는 iOS 편집을 시작합니다. 편집 화면에서는 정해진 파일 슬롯에 이미지를 넣고,
              말풍선은 에디터로 바로 넘겨 정밀하게 확인합니다.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/template"
                className="rounded-full bg-[#c9ff3d] px-6 py-4 text-base font-black text-[#111111] shadow-[0_12px_34px_rgba(201,255,61,0.28)] transition hover:scale-[0.98]"
              >
                템플릿으로 시작
              </Link>
              <Link
                href="/editor"
                className="rounded-full bg-[#111111] px-6 py-4 text-base font-black text-white transition hover:scale-[0.98]"
              >
                말풍선만 편집
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[34px] border border-[#d7ddd8] bg-[#e1e4e0] p-5">
            <div className="flex items-center justify-between border-b border-[#111111] pb-3">
              <strong className="text-base font-black">제작 흐름</strong>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black">template first</span>
            </div>
            <ol className="grid gap-2 text-sm font-bold text-[#4d5660]">
              {workflow.map((step, index) => (
                <li key={step} className="flex items-center gap-3 rounded-[18px] bg-white px-3 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#68a0ff] text-xs font-black text-[#111111]">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="roadmap" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => (
            <Link
              key={module.title}
              href={module.href}
              className="rounded-[24px] border border-[#d7ddd8] bg-white p-5 shadow-[0_12px_36px_rgba(17,17,17,0.05)] transition hover:-translate-y-0.5 hover:border-[#111111]"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-lg font-black">{module.title}</h2>
                <span className="rounded-full bg-[#eeee00] px-2.5 py-1 text-[11px] font-black">{module.status}</span>
              </div>
              <p className="text-sm font-bold leading-6 text-[#5d6670]">{module.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
