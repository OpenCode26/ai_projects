"use client";

import type { Portfolio } from "@/lib/types";

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function PositionsTable({
  portfolio,
  selectedTicker,
  onSelect,
}: {
  portfolio: Portfolio | null;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
}) {
  const positions = portfolio?.positions ?? [];

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Positions</h2>
      </div>
      <div className="flex-1 overflow-auto">
        <table data-testid="positions-table" className="w-full border-collapse font-tabular text-xs">
          <thead className="sticky top-0 bg-panel text-text-muted">
            <tr className="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-normal">
              <th>Ticker</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Avg Cost</th>
              <th className="text-right">Price</th>
              <th className="text-right">P&amp;L</th>
              <th className="text-right">% Chg</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const up = p.unrealized_pnl >= 0;
              return (
                <tr
                  key={p.ticker}
                  data-testid="position-row"
                  data-ticker={p.ticker}
                  onClick={() => onSelect(p.ticker)}
                  className={`cursor-pointer border-t border-border hover:bg-panel-raised ${
                    p.ticker === selectedTicker ? "bg-panel-raised" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 font-semibold">{p.ticker}</td>
                  <td data-testid="position-quantity" className="px-3 py-1.5 text-right">
                    {p.quantity}
                  </td>
                  <td data-testid="position-avg-cost" className="px-3 py-1.5 text-right text-text-secondary">
                    {formatUsd(p.avg_cost)}
                  </td>
                  <td data-testid="position-current-price" className="px-3 py-1.5 text-right">
                    {formatUsd(p.current_price)}
                  </td>
                  <td
                    data-testid="position-pnl"
                    className={`px-3 py-1.5 text-right ${up ? "text-positive" : "text-negative"}`}
                  >
                    {formatUsd(p.unrealized_pnl)}
                  </td>
                  <td
                    data-testid="position-pnl-pct"
                    className={`px-3 py-1.5 text-right ${up ? "text-positive" : "text-negative"}`}
                  >
                    {up ? "+" : ""}
                    {p.unrealized_pnl_pct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
            {positions.length === 0 && (
              <tr>
                <td data-testid="positions-empty" colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  No open positions yet — buy something to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
