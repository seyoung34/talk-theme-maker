"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/admin/overview";

/**
 * 오늘 카드의 7일 추이.
 *
 * 지난 날은 약한 회색 선, 오늘은 강조색 점으로 그린다(dataviz stat tile 규칙). 두 색은
 * `validate_palette.js`로 흰 바탕 대비 3:1 이상을 확인했다. 조회 실패한 날(null)은 이어 그리지
 * 않는다 — 0으로 잇으면 "없었음"과 "모름"이 섞인다. 곡선 보간은 0 아래로 출렁여 없던 값을 그리므로
 * 직선으로 잇는다. 같은 값은 개요의 표 보기에도 있다.
 */
const trendColor = "#76808d";
const todayColor = "#2563eb";

export default function OverviewSparkline({ label, points }: { label: string; points: TrendPoint[] }) {
  const lastIndex = points.length - 1;
  const summary = points.map((point) => `${formatDay(point.day)} ${point.value ?? "확인 불가"}`).join(", ");

  return (
    <div className="mt-auto h-14 w-full pt-3" role="img" aria-label={`최근 ${points.length}일 ${label} 추이: ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
          <XAxis dataKey="day" hide />
          <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, 1)]} />
          <Tooltip
            cursor={{ stroke: "var(--color-outline-variant)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
              if (!point) return null;
              return (
                <div className="rounded-lg border border-[var(--color-outline-variant)] bg-white px-2.5 py-1.5 text-xs font-bold text-[var(--color-on-surface)] shadow-md">
                  <span className="text-[var(--color-on-surface-variant)]">{formatDay(point.day)}</span>{" "}
                  {point.value === null ? "확인 불가" : point.value.toLocaleString("ko-KR")}
                </div>
              );
            }}
          />
          <Line
            type="linear"
            dataKey="value"
            stroke={trendColor}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: trendColor, stroke: "#fff", strokeWidth: 2 }}
            dot={(props: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
              const { cx, cy, index, value } = props;
              if (index !== lastIndex || cx === undefined || cy === undefined || value === null || value === undefined) {
                return <g key={`dot-${index}`} />;
              }
              return <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill={todayColor} stroke="#fff" strokeWidth={2} />;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatDay(day: string) {
  const [, month, date] = day.split("-");
  return `${Number(month)}/${Number(date)}`;
}
