/**
 * 한국 시간 기준 날짜 표기.
 *
 * `new Date(...).getFullYear()` 같은 getter 는 **실행 환경의 시간대**를 따른다. 이 앱은
 * Cloudflare Workers 에서 서버 렌더되고 그 환경의 시간대는 UTC 다. 그래서 한국 시간
 * 00:00~09:00 에 발행된 공지가 서버 렌더에서는 전날로 표시되고, 브라우저에서 다시 그리면
 * 날짜가 바뀌는 일이 생긴다.
 *
 * 서비스 이용자가 한국 시간대를 쓰므로 표기를 `Asia/Seoul` 로 고정한다. 서버와 클라이언트가
 * 같은 문자열을 만들어 hydration 불일치도 생기지 않는다.
 */
const timeZone = "Asia/Seoul";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `2026. 08. 05.` */
export function formatKoreanDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date);
}

/** `2026. 08. 05. 14:30` */
export function formatKoreanDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateTimeFormatter.format(date).replace(/\s*(\d{2}):(\d{2})$/, " $1:$2");
}
