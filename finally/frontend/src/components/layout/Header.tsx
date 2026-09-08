"use client";

import { useConnectionStatus } from "@/hooks/usePrice";
import type { Portfolio } from "@/lib/types";

const STATUS_CONFIG = {
  connected: { color: "bg-positive text-positive", label: "Live", pulse: true },
  reconnecting: { color: "bg-accent-yellow text-accent-yellow", label: "Reconnecting", pulse: true },
  disconnected: { color: "bg-negative text-negative", label: "Disconnected", pulse: false },
} as const;

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function Header({ portfolio }: { portfolio: Portfolio | null }) {
  const status = useConnectionStatus();
  const config = STATUS_CONFIG[status];
  const totalValue = portfolio?.total_value ?? 0;
  const startingValue = 10000;
  const totalChangePercent = startingValue > 0 ? ((totalValue - startingValue) / startingValue) * 100 : 0;
  const totalUp = totalChangePercent >= 0;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-4">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold tracking-tight text-accent-yellow">FinAlly</span>
        <span className="hidden text-xs text-text-muted sm:inline">AI Trading Workstation</span>
      </div>

      <div className="flex items-center gap-6 font-tabular text-sm">
        <div className="flex flex-col items-end leading-tight">
          <span className="text-text-muted text-[11px] uppercase tracking-wide">Portfolio Value</span>
          <span data-testid="total-value" className="flex items-center gap-1.5 text-base font-semibold">
            {formatUsd(totalValue)}
            <span className={totalUp ? "text-positive" : "text-negative"}>
              {totalUp ? "▲" : "▼"} {Math.abs(totalChangePercent).toFixed(2)}%
            </span>
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-text-muted text-[11px] uppercase tracking-wide">Cash</span>
          <span data-testid="cash-balance" className="text-base">
            {formatUsd(portfolio?.cash_balance ?? 0)}
          </span>
        </div>
        <div
          data-testid="connection-status"
          data-status={status}
          className="flex items-center gap-2 border-l border-border pl-4"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${config.color} ${config.pulse ? "pulse-dot" : ""}`} />
          <span className="text-xs text-text-secondary">{config.label}</span>
        </div>
      </div>
    </header>
  );
}
