import { useId, useMemo, useState, type KeyboardEvent } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type IterationProgressDay = {
  date: string;
  idealRemaining: number;
  actualRemaining: number | null;
  scopeTotalPoints: number;
};

export type IterationProgressChartPayload = {
  iterationId: string;
  startDate: string;
  endDate: string;
  burndownScopePoints: number;
  days: IterationProgressDay[];
};

type ProgressMode = "burndown" | "burnup";

export type ScopeChangePoint = {
  date: string;
  scopeDelta: number;
  scopeTotalPoints: number;
};

const CHART_HEIGHT = 220;

export function collectScopeChanges(
  days: IterationProgressDay[],
): ScopeChangePoint[] {
  const changes: ScopeChangePoint[] = [];
  for (let i = 1; i < days.length; i += 1) {
    const scopeDelta = days[i].scopeTotalPoints - days[i - 1].scopeTotalPoints;
    if (scopeDelta !== 0) {
      changes.push({
        date: days[i].date,
        scopeDelta,
        scopeTotalPoints: days[i].scopeTotalPoints,
      });
    }
  }
  return changes;
}

export function formatScopeDeltaLabel(scopeDelta: number): string {
  if (scopeDelta > 0) {
    return `+${scopeDelta} pt 追加`;
  }
  return `${scopeDelta} pt 削除`;
}

export function IterationProgressChart({
  iterationLabel,
  payload,
}: {
  iterationLabel: string;
  payload: IterationProgressChartPayload;
}) {
  const [mode, setMode] = useState<ProgressMode>("burndown");
  const tablistId = useId();
  const panelId = `${tablistId}-panel`;
  const burndownTabId = `${tablistId}-burndown`;
  const burnupTabId = `${tablistId}-burnup`;

  const chartData = useMemo(() => {
    return payload.days.map((day) => {
      const acceptedPoints = Math.max(
        day.scopeTotalPoints - (day.actualRemaining ?? 0),
        0,
      );
      return {
        ...day,
        acceptedPoints,
        dateLabel: day.date.slice(5),
      };
    });
  }, [payload.days]);

  const scopeChanges = useMemo(
    () => collectScopeChanges(payload.days),
    [payload.days],
  );
  const scopeChangeLabelByDate = useMemo(() => {
    return new Map(
      scopeChanges.map((change) => [
        change.date.slice(5),
        formatScopeDeltaLabel(change.scopeDelta),
      ]),
    );
  }, [scopeChanges]);

  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: ProgressMode,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const nextMode: ProgressMode =
      event.key === "ArrowRight"
        ? current === "burndown"
          ? "burnup"
          : "burndown"
        : current === "burndown"
          ? "burnup"
          : "burndown";
    setMode(nextMode);
    const targetId = nextMode === "burndown" ? burndownTabId : burnupTabId;
    document.getElementById(targetId)?.focus();
  };

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-gray-600">{iterationLabel}</p>
      <p className="mt-1 text-xs text-gray-500">
        スプリント開始時スコープ基準の残ポイント: {payload.burndownScopePoints}{" "}
        pt（初回記録または現在の総見積もり）
      </p>
      <p className="text-xs text-gray-500">
        注: 未来日の実績線は未確定のため表示されません。
      </p>

      <div className="mt-3" role="tablist" aria-label="進捗チャート切替">
        <button
          id={burndownTabId}
          type="button"
          role="tab"
          aria-selected={mode === "burndown"}
          aria-controls={panelId}
          className="mr-2 rounded border px-3 py-1 text-xs"
          onClick={() => setMode("burndown")}
          onKeyDown={(event) => onTabKeyDown(event, "burndown")}
        >
          バーンダウン
        </button>
        <button
          id={burnupTabId}
          type="button"
          role="tab"
          aria-selected={mode === "burnup"}
          aria-controls={panelId}
          className="rounded border px-3 py-1 text-xs"
          onClick={() => setMode("burnup")}
          onKeyDown={(event) => onTabKeyDown(event, "burnup")}
        >
          バーンアップ
        </button>
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={mode === "burndown" ? burndownTabId : burnupTabId}
        className="mt-3"
      >
        <div
          role="img"
          aria-label={
            mode === "burndown"
              ? "バーンダウンチャート（理想線と実績線）"
              : "バーンアップチャート（完了ポイントとスコープ合計）"
          }
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart
              data={chartData}
              margin={{ top: 16, right: 16, bottom: 20, left: 8 }}
            >
              <CartesianGrid stroke="#e5e7eb" fill="#f9fafb" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickMargin={8}
                width={36}
                allowDecimals={false}
              />
              <Tooltip
                labelFormatter={(label) => {
                  if (mode === "burnup") {
                    const scopeChangeLabel = scopeChangeLabelByDate.get(
                      String(label),
                    );
                    if (scopeChangeLabel) {
                      return `${label} (${scopeChangeLabel})`;
                    }
                  }
                  return String(label);
                }}
              />

              {mode === "burndown" ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="idealRemaining"
                    stroke="#9ca3af"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    isAnimationActive={false}
                    name="理想線"
                  />
                  <Line
                    type="monotone"
                    dataKey="actualRemaining"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="実績線（残ポイント）"
                  />
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="acceptedPoints"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="Accepted Points"
                  />
                  <Line
                    type="monotone"
                    dataKey="scopeTotalPoints"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="Total Scope Points"
                  />
                  {scopeChanges.map((change) => (
                    <ReferenceDot
                      key={change.date}
                      x={change.date.slice(5)}
                      y={change.scopeTotalPoints}
                      r={4}
                      fill={change.scopeDelta > 0 ? "#16a34a" : "#dc2626"}
                      stroke="none"
                      ifOverflow="extendDomain"
                      label={{ value: "", position: "top" }}
                    />
                  ))}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
        {mode === "burndown" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-block h-0 w-12 border-t-2 border-dashed border-gray-400" />
              理想線
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-0 w-12 border-t-2 border-blue-600" />
              実績線（残ポイント）
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-block h-0 w-12 border-t-2 border-blue-600" />
              Accepted Points
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-0 w-12 border-t-2 border-amber-500" />
              Total Scope Points
            </div>
            <div className="flex items-center gap-2">
              Scope Change Marker: ReferenceDot
            </div>
          </>
        )}
      </div>
    </div>
  );
}
