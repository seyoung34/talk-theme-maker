"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, Users } from "lucide-react";
import { getAutosaveStatusLabel, type AutosaveStatus } from "@/components/project/autosaveStatus";
import { persistenceNotice } from "@/lib/theme/project/persistenceNotice";

const toneClassName: Record<Exclude<AutosaveStatus, "idle">, string> = {
  saving: "text-[#64748b]",
  saved: "text-[#047857]",
  error: "text-[#be123c]",
  conflict: "text-[#c2410c]",
};

/**
 * 자동 저장이 실제로 돌고 있다는 신호.
 *
 * 자동 저장은 성공할 때 아무 일도 일어나지 않아서, 표시가 없으면 사용자는 저장되는지 알 수 없고
 * 실패해도 알아채지 못한다. 상태 변화는 `aria-live`로도 알린다.
 */
export function AutosaveStatusBadge({
  status,
  savedAt,
  className = "",
}: {
  status: AutosaveStatus;
  savedAt: number | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  // "방금"이 30분째 방금으로 남아 있으면 오히려 신뢰를 잃는다. 저장된 상태일 때만 주기적으로 갱신한다.
  useEffect(() => {
    if (status !== "saved") return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const label = getAutosaveStatusLabel(status, savedAt, now);
  if (!label || status === "idle") return null;

  const Icon = status === "saving" ? LoaderCircle : status === "saved" ? Check : status === "conflict" ? Users : AlertTriangle;

  return (
    <span
      className={`items-center gap-1 text-xs font-semibold ${toneClassName[status]} ${className}`}
      role="status"
      aria-live="polite"
      title={status === "saved" ? persistenceNotice.browserDetailed : undefined}
    >
      <Icon size={13} className={status === "saving" ? "animate-spin" : undefined} aria-hidden="true" />
      {label}
    </span>
  );
}
