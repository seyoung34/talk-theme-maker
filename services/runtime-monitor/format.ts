import type { Notification, Source } from "./model.js";
import { defaultCatalog, renderFailure, renderLayout, type LayoutName, type MessageCatalog } from "./messages.js";

/**
 * 독립 감시기의 텔레그램 문구를 그린다.
 *
 * 문장과 줄 배치는 `messages.ko.json`(운영 중에는 상태 버킷의 사본)에 있고, 이 파일은 알림 한 건에서
 * 치환자 값을 계산하는 일만 한다. 운영자가 메시지 하나만 보고 무슨 일인가, 사이트가 영향을 받는가,
 * 무엇을 하면 되는가에 답할 수 있어야 한다는 원칙은 카탈로그 문구가 맡는다.
 *
 * 이 파일은 `lib/ops`의 앱 포맷터를 import하지 않는다. 감시기는 앱이 죽어도 혼자 빌드·실행돼야 한다.
 * 시각 형식만 앱과 같게 맞춘다.
 */

export function describeFailure(source: Source, code: string, catalog: MessageCatalog = defaultCatalog) {
  return renderFailure(catalog, source, code);
}

/**
 * 알림 한 건을 문장으로 바꾼다. `layout`을 주지 않으면 알림 단계(phase)와 같은 이름의 레이아웃을 쓴다.
 * `closed`는 복구 알림을 보낸 뒤 처음 장애 메시지를 종료 상태로 고쳐 쓸 때 쓴다.
 */
export function formatNotification(event: Notification, catalog: MessageCatalog = defaultCatalog, layout: LayoutName = event.phase): string {
  const text = renderNotification(event, catalog, layout);
  // 운영 템플릿이 이 알림에서 빈 문장이 되면 텔레그램이 400으로 거부하고 같은 알림을 계속 다시 보낸다.
  // 검증이 대부분 막지만, 마지막 방어선으로 원본 문구를 쓴다.
  return text.trim() || catalog === defaultCatalog ? text : renderNotification(event, defaultCatalog, layout);
}

function renderNotification(event: Notification, catalog: MessageCatalog, layout: LayoutName) {
  const copy = catalog.sources[event.source];
  const recoveredLayout = layout === "recovered" || layout === "closed";
  const { sample } = event;
  const windowEnd = Number(sample.observationId);
  return renderLayout(catalog.layouts[layout], {
    header: catalog.header,
    phase: catalog.phases[layout],
    icon: copy.icon,
    title: recoveredLayout ? copy.recoveryTitle : copy.failureTitle,
    failureTitle: copy.failureTitle,
    recoveryTitle: copy.recoveryTitle,
    // 복구 표본은 정상 표본이라 원래 실패 사유를 모른다. 실패 문장을 만들지 않는다.
    failure: sample.outcome === "failed" ? renderFailure(catalog, event.source, sample.code) : undefined,
    impact: copy.impact,
    action: copy.action,
    recovered: copy.recovered,
    target: copy.target,
    detectedAt: formatKstDateTime(event.openedAt),
    checkedAt: formatKstDateTime(event.at),
    // openedAt은 첫 실패가 아니라 임계 횟수를 채워 사건을 연 시각이다. 문구는 "감지 후"로 읽게 둔다.
    elapsed: formatDuration(event.at - event.openedAt),
    range: formatKstRange(event.openedAt, event.at),
    // 진단 값은 실패 단계에서만 의미가 있다. 복구 레이아웃에 남은 값이 섞이지 않게 한다.
    httpStatus: !recoveredLayout && sample.httpStatus !== undefined ? String(sample.httpStatus) : undefined,
    cfRay: !recoveredLayout ? sample.cfRay : undefined,
    requests: sample.requests !== undefined ? String(sample.requests) : undefined,
    runtimeFailures: sample.requests !== undefined ? String(sample.failures ?? 0) : undefined,
    window: sample.requests !== undefined && Number.isFinite(windowEnd) ? formatKstRange(windowEnd - 300_000, windowEnd) : undefined,
    source: event.source,
    code: sample.code,
    id: event.id,
  });
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
