"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PortfolioSnapshot } from "@/lib/types";

const BLUE = "#209dd7";
const BORDER = "#262b36";
const TEXT_MUTED = "#5b6272";

export function PnLChart({ history }: { history: PortfolioSnapshot[] }) {
  const data = history.map((s) => ({
    time: new Date(s.recorded_at).getTime(),
    value: s.total_value,
  }));

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Portfolio Value</h2>
      </div>
      <div data-testid="pnl-chart" data-point-count={data.length} className="min-h-0 flex-1 p-2">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            Value history will appear as snapshots accumulate.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                stroke={TEXT_MUTED}
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                stroke={TEXT_MUTED}
                fontSize={11}
                tickLine={false}
                width={44}
              />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Total value"]}
                labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                contentStyle={{ background: "#171c27", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "#8b93a3" }}
              />
              <Line type="monotone" dataKey="value" stroke={BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
