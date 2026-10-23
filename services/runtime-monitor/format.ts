import type { Notification, Source } from "./model.js";

/**
 * 독립 감시기의 텔레그램 문구.
 *
 * 운영자가 메시지 하나만 보고 세 가지에 답할 수 있어야 한다 — 무슨 일인가, 사이트가 영향을 받는가,
 * 무엇을 하면 되는가. 내부 코드(`source / code`)와 사건 ID는 버리지 않고 맨 아래로 내려 로그 검색에 쓴다.
 *
 * 이 파일은 `lib/ops`의 앱 포맷터를 import하지 않는다. 감시기는 Dockerfile이 이 폴더만 복사하는
 * 독립 서비스라, 앱이 죽어도 혼자 빌드·실행돼야 한다. 시각 형식만 앱과 같게 맞춘다.
 */

type SourceCopy = {
  /** 문장 속 대상 명칭. */
  target: string;
  /** 주격 조사를 붙인 형태. 영문 약어는 읽는 소리로 받침을 정한다(API → "에이피아이가"). */
  subject: string;
  icon: string;
  failureTitle: string;
  recoveryTitle: string;
  /**
   * "없음"이라고 쓰지 않는다. 각 출처는 자기 관측 범위만 안다 — 예를 들어 수집기 알림에는 같은 시점의
   * HTTP 검사 결과가 없어서, 이 메시지만으로 사이트가 정상이라고 단정할 수 없다.
   */
  impact: string;
  action: string;
  /** 복구 표본은 정상 표본이라 원래 실패 사유를 모른다. 실패용 문구를 재사용하지 않는다. */
  recovered: string;
};

const sourceCopy: Record<Source, SourceCopy> = {
  public_http: {
    target: "사이트 첫 화면",
    subject: "사이트 첫 화면이",
    icon: "🚨",
    failureTitle: "사이트 접속 실패",
    recoveryTitle: "사이트 접속 복구",
    impact: "가능 — 방문자가 첫 화면을 열지 못할 수 있습니다",
    action: "talktheme.shop 직접 접속 → Cloudflare 상태 페이지 → Workers 로그에서 같은 시각 오류 확인",
    recovered: "사이트 첫 화면이 다시 정상 응답합니다",
  },
  session_http: {
    target: "세션 API",
    subject: "세션 API가",
    icon: "🚨",
    failureTitle: "세션 API 응답 실패",
    recoveryTitle: "세션 API 복구",
    impact: "가능 — 로그인 상태 확인이 실패할 수 있습니다",
    action: "/api/session 직접 호출 → Workers 로그에서 /api/session 오류 확인",
    recovered: "세션 API가 다시 정상 응답합니다",
  },
  readiness: {
    target: "DB 준비 상태 API",
    subject: "DB 준비 상태 API가",
    icon: "🚨",
    failureTitle: "DB 준비 상태 확인 실패",
    recoveryTitle: "DB 준비 상태 복구",
    impact: "가능 — DB를 쓰는 기능(Export·결제)이 실패할 수 있습니다",
    action: "Supabase 상태 확인 → Workers 로그에서 /api/internal/ops/readiness 오류 확인",
    recovered: "DB 준비 상태 API가 다시 정상 응답합니다",
  },
  cloudflare_runtime: {
    target: "Worker 실행 통계",
    subject: "Worker 실행 통계가",
    icon: "⚠️",
    failureTitle: "Worker 실행 실패 증가",
    recoveryTitle: "Worker 실행 실패 해소",
    // "무슨 일"이 이미 기준 초과를 말한다. 여기서는 사람에게 미치는 영향만 쓴다.
    impact: "가능 — 일부 요청이 실패했을 수 있습니다",
    action: "Workers Logs에서 시간창·outcome·operation/stage/dependency를 대조하세요. exceededResources는 CPU 원인 확정이 아닙니다.",
    recovered: "Worker 실행 실패 후보가 기준 아래로 내려왔습니다",
  },
  cloudflare_collector: {
    target: "Cloudflare 통계 API",
    subject: "Cloudflare 통계 API가",
    icon: "🟡",
    failureTitle: "Cloudflare 통계 수집 실패",
    recoveryTitle: "Cloudflare 통계 수집 복구",
    impact: "미확인 — 통계 수집·해석 문제입니다. 사이트 접속 장애는 별도 감시 항목이 따로 알립니다",
    action: "대기. '복구 확인'이 오면 끝입니다. '장애 지속'이 이어지면 감시기의 Cloudflare API 토큰·권한과 Cloudflare 상태 페이지를 확인하세요.",
    recovered: "Cloudflare 통계를 다시 받아옵니다",
  },
};

/**
 * 실패 코드 → 문장. 실제로 생성되는 실패 코드를 전부 담는다(`http.ts`, `collect.ts`).
 *
 * 정상 코드(`probe_ok`, `collection_ok`, `runtime_window_observed`)는 복구 알림에서만 나오고,
 * 거기서는 출처별 `recovered` 문장을 쓴다. unknown 코드(`no_invocations`, `collection_unavailable`,
 * `collection_gap`)는 상태 전이를 만들지 않아 알림에 나오지 않는다.
 */
const failureSentence: Record<string, (copy: SourceCopy) => string> = {
  request_timeout: ({ subject }) => `${subject} 5초 안에 응답하지 않았습니다`,
  network_failed: ({ target }) => `${target}에 네트워크로 연결하지 못했습니다`,
  http_failed: ({ subject }) => `${subject} 오류 응답을 보냈습니다`,
  invalid_response: ({ subject }) => `${subject} 예상과 다른 응답을 보냈습니다`,
  response_too_large: ({ target }) => `${target}의 응답이 너무 큽니다`,
  database_unavailable: () => "DB에 연결하지 못했습니다",
  probe_failed: ({ target }) => `${target} 확인 중 알 수 없는 오류가 났습니다`,
  collection_failed: ({ target }) => `${target} 확인 중 알 수 없는 오류가 났습니다`,
  // 수집은 성공했고 해석할 수 없는 값을 받은 경우다. "받아오지 못했다"고 쓰면 사실과 다르다.
  unclassified_outcome: () => "Cloudflare가 분류할 수 없는 실행 결과를 보고했습니다",
  runtime_failure_candidates: () => "Worker 실행 실패 후보가 기준을 넘었습니다",
};

export function describeFailure(source: Source, code: string) {
  const copy = sourceCopy[source];
  return failureSentence[code]?.(copy) ?? `${copy.target} 확인 중 알 수 없는 문제가 생겼습니다`;
}

export function formatNotification(event: Notification) {
  const copy = sourceCopy[event.source];
  const recovered = event.phase === "recovered";
  const phaseLabel = { opened: "장애 감지", repeat: "장애 지속", recovered: "복구 확인" }[event.phase];

  const lines = [
    recovered ? `✅ ${copy.recoveryTitle}` : `${copy.icon} ${copy.failureTitle}`,
    `TalkTheme 독립 감시 · ${phaseLabel}`,
    "",
  ];

  if (recovered) {
    lines.push(
      `상태: ${copy.recovered}`,
      // openedAt은 첫 실패가 아니라 임계 횟수를 채워 사건을 연 시각이고, 복구도 연속 정상을 확인한
      // 시각이다. 실제 장애 시간으로 읽히지 않도록 "감지~복구 확인"이라고 쓴다.
      `감지~복구 확인: ${formatDuration(event.at - event.openedAt)} (${formatKstRange(event.openedAt, event.at)})`,
    );
  } else {
    lines.push(
      `무슨 일: ${describeFailure(event.source, event.sample.code)}`,
      `사이트 영향: ${copy.impact}`,
      event.phase === "opened"
        ? `감지: ${formatKstDateTime(event.at)}`
        : `확인: ${formatKstDateTime(event.at)} · 감지 후 경과 ${formatDuration(event.at - event.openedAt)}`,
    );
  }

  if (event.sample.requests !== undefined) {
    const windowEnd = Number(event.sample.observationId);
    lines.push(
      "",
      `관측 invocation: ${event.sample.requests}, 런타임 오류 후보: ${event.sample.failures ?? 0}`,
      `집계 시간창: ${formatKstRange(windowEnd - 300_000, windowEnd)} (끝 제외)`,
      "GraphQL 표본 집계이며 사용자 수/HTTP 실패율이 아닙니다.",
    );
  }

  if (!recovered) lines.push("", `할 일: ${copy.action}`);

  lines.push("", `코드: ${event.source} / ${event.sample.code}`, `ID: ${event.id}`);
  return lines.join("\n");
}

const kstParts = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // h23: 자정을 "24:00"이 아니라 "00:00"으로 쓴다.
  hourCycle: "h23",
});

function readKstParts(value: number) {
  const parts = Object.fromEntries(kstParts.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return {
    date: `${parts.month}/${parts.day}(${parts.weekday})`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    minute: `${parts.hour}:${parts.minute}`,
  };
}

/** `10/23(목) 23:05:02 KST`. 앱 운영 알림(`lib/ops/formatters.ts`)과 같은 형식이다. */
export function formatKstDateTime(value: number) {
  if (!Number.isFinite(value)) return String(value);
  const { date, time } = readKstParts(value);
  return `${date} ${time} KST`;
}

/** 같은 날이면 `23:05 ~ 23:12 KST`, 날짜를 넘기면 양쪽에 날짜를 붙인다. */
export function formatKstRange(start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return `${start} ~ ${end}`;
  const from = readKstParts(start);
  const to = readKstParts(end);
  return from.date === to.date
    ? `${from.minute} ~ ${to.minute} KST`
    : `${from.date} ${from.minute} ~ ${to.date} ${to.minute} KST`;
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 60_000) return "1분 미만";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return `${minutes}분`;
}
