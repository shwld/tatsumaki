import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  collectScopeChanges,
  formatScopeDeltaLabel,
  IterationProgressChart,
  type IterationProgressChartPayload,
} from "./iteration-progress-chart";

describe("iteration-progress-chart", () => {
  const payload: IterationProgressChartPayload = {
    iterationId: "it-1",
    startDate: "2026-04-01",
    endDate: "2026-04-15",
    burndownScopePoints: 8,
    days: [
      {
        date: "2026-04-01",
        idealRemaining: 8,
        actualRemaining: 8,
        scopeTotalPoints: 8,
      },
      {
        date: "2026-04-02",
        idealRemaining: 7,
        actualRemaining: 6,
        scopeTotalPoints: 10,
      },
      {
        date: "2026-04-03",
        idealRemaining: 6,
        actualRemaining: 5,
        scopeTotalPoints: 9,
      },
    ],
  };

  it("switches between burndown and burnup tabs", () => {
    render(
      <IterationProgressChart
        iterationLabel="2026-04-01 〜 2026-04-15"
        payload={payload}
      />,
    );

    expect(
      screen.getByLabelText("バーンダウンチャート（理想線と実績線）"),
    ).toBeInTheDocument();

    const burnupTab = screen.getByRole("tab", { name: "バーンアップ" });
    fireEvent.click(burnupTab);

    expect(
      screen.getByLabelText(
        "バーンアップチャート（完了ポイントとスコープ合計）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Scope Change Marker: ReferenceDot"),
    ).toBeInTheDocument();
  });

  it("detects scope changes and formats labels", () => {
    expect(collectScopeChanges(payload.days)).toEqual([
      { date: "2026-04-02", scopeDelta: 2, scopeTotalPoints: 10 },
      { date: "2026-04-03", scopeDelta: -1, scopeTotalPoints: 9 },
    ]);
    expect(formatScopeDeltaLabel(3)).toBe("+3 pt 追加");
    expect(formatScopeDeltaLabel(-2)).toBe("-2 pt 削除");
  });
});
