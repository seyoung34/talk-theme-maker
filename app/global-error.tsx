"use client";

import { useEffect } from "react";

/**
 * 루트 레이아웃 자체가 실패했을 때의 마지막 경계.
 *
 * 이 화면은 레이아웃을 대체하므로 html/body를 직접 렌더한다. 레이아웃이 죽은 상황이면 전역 스타일도
 * 함께 실패했을 수 있어 Tailwind 클래스 대신 인라인 스타일만 쓴다. 여기서까지 외부 의존을 두면
 * "오류 화면이 오류를 내는" 상태가 된다.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#f4f9ff", color: "#1b1c19", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "24px" }}>
          <section
            style={{
              width: "100%",
              maxWidth: "480px",
              background: "#ffffff",
              border: "1px solid #dbe8fb",
              borderRadius: "24px",
              padding: "28px",
              boxShadow: "0 18px 48px rgba(47,107,191,0.1)",
            }}
          >
            <p style={{ margin: 0, fontSize: "12px", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#3d7bd6" }}>
              Something went wrong
            </p>
            <h1 style={{ margin: "8px 0 0", fontSize: "26px", lineHeight: 1.25, fontWeight: 800 }}>페이지를 불러오지 못했어요</h1>
            <p style={{ margin: "12px 0 0", fontSize: "14px", lineHeight: 1.7, fontWeight: 600, color: "#5b6b82" }}>
              잠시 후 다시 시도해 주세요. 계속 같은 화면이 나오면 아래 코드와 함께 문의해 주세요.
            </p>
            {error.digest ? (
              <p style={{ margin: "16px 0 0", padding: "8px 12px", background: "#f4f9ff", borderRadius: "12px", fontFamily: "ui-monospace, monospace", fontSize: "12px", fontWeight: 700, color: "#5b6b82" }}>
                오류 코드 {error.digest}
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "20px" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  minHeight: "44px",
                  padding: "0 20px",
                  border: "none",
                  borderRadius: "9999px",
                  background: "#fee500",
                  color: "#191600",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                다시 시도
              </button>
              {/*
                루트 레이아웃이 실패한 상태라 클라이언트 라우팅을 신뢰할 수 없다.
                next/link의 소프트 내비게이션 대신 전체 새로고침으로 앱을 처음부터 다시 세운다.
              */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: "44px",
                  padding: "0 20px",
                  border: "1px solid #cfe0ff",
                  borderRadius: "9999px",
                  background: "#ffffff",
                  color: "#2f6bbf",
                  fontSize: "14px",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                홈으로
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
