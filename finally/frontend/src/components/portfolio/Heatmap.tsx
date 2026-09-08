"use client";

import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { Portfolio } from "@/lib/types";

const POSITIVE = "#26a69a";
const NEGATIVE = "#ef5350";

interface HeatmapNode {
  [key: string]: unknown;
  name: string;
  size: number;
  pnlPercent: number;
  pnl: number;
}

function colorForPnl(pnlPercent: number): string {
  const magnitude = Math.min(Math.abs(pnlPercent) / 15, 1); // saturate by +/-15%
  const intensity = 0.35 + magnitude * 0.65;
  const base = pnlPercent >= 0 ? POSITIVE : NEGATIVE;
  return mixWithPanel(base, intensity);
}

function mixWithPanel(hex: string, alpha: number): string {
  const panel = { r: 0x17, g: 0x1c, b: 0x27 };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number, p: number) => Math.round(c * alpha + p * (1 - alpha));
  return `rgb(${mix(r, panel.r)}, ${mix(g, panel.g)}, ${mix(b, panel.b)})`;
}

function CellContent(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  pnlPercent?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, pnlPercent = 0 } = props;
  if (width < 2 || height < 2) return null;
  const showLabel = width > 44 && height > 28;
  const pnlDirection = pnlPercent > 0 ? "positive" : pnlPercent < 0 ? "negative" : "flat";
  return (
    <g data-testid="heatmap-tile" data-ticker={name} data-pnl-direction={pnlDirection}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={colorForPnl(pnlPercent)}
        stroke="#0d1117"
        strokeWidth={2}
      />
      {showLabel && (
        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#e6e8ee" fontSize={12} fontWeight={600}>
          {name}
        </text>
      )}
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          fill={pnlPercent >= 0 ? POSITIVE : NEGATIVE}
          fontSize={11}
        >
          {pnlPercent >= 0 ? "+" : ""}
          {pnlPercent.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

export function Heatmap({ portfolio }: { portfolio: Portfolio | null }) {
  const positions = portfolio?.positions ?? [];
  const data: HeatmapNode[] = positions.map((p) => ({
    name: p.ticker,
    size: Math.max(p.weight_pct, 0.1),
    pnlPercent: p.unrealized_pnl_pct,
    pnl: p.unrealized_pnl,
  }));

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Portfolio Heatmap</h2>
      </div>
      <div data-testid="heatmap" className="min-h-0 flex-1 p-2">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            Positions appear here once you buy shares.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={data}
              dataKey="size"
              stroke="#0d1117"
              isAnimationActive={false}
              content={<CellContent />}
            >
              <Tooltip
                formatter={(_value, _key, entry) => {
                  const payload = entry.payload as unknown as HeatmapNode;
                  return [`${payload.pnl >= 0 ? "+" : ""}$${payload.pnl.toFixed(2)} (${payload.pnlPercent.toFixed(2)}%)`, payload.name];
                }}
                contentStyle={{ background: "#171c27", border: "1px solid #262b36", borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: "#e6e8ee" }}
              />
            </Treemap>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
