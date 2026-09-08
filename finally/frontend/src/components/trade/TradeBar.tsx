"use client";

import { useEffect, useState } from "react";
import { useTrade } from "@/hooks/useTrade";
import type { Portfolio } from "@/lib/types";

export function TradeBar({
  selectedTicker,
  onExecuted,
}: {
  selectedTicker: string | null;
  onExecuted: (portfolio: Portfolio) => void;
}) {
  const [ticker, setTicker] = useState(selectedTicker ?? "");
  const [quantity, setQuantity] = useState("1");
  const { submitTrade, submitting, error } = useTrade(onExecuted);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTicker) setTicker(selectedTicker);
  }, [selectedTicker]);

  async function handleTrade(side: "buy" | "sell") {
    const qty = parseFloat(quantity);
    if (!ticker.trim() || !(qty > 0)) return;
    setConfirmation(null);
    const ok = await submitTrade(ticker, qty, side);
    if (ok) {
      setConfirmation(`${side === "buy" ? "Bought" : "Sold"} ${qty} ${ticker.toUpperCase()}`);
      setTimeout(() => setConfirmation(null), 2500);
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Trade</span>
      <input
        data-testid="trade-ticker"
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
        placeholder="Ticker"
        maxLength={5}
        className="w-20 rounded border border-border bg-bg px-2 py-1 font-tabular text-xs uppercase focus:border-accent-blue focus:outline-none"
      />
      <input
        data-testid="trade-quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Qty"
        inputMode="decimal"
        className="w-16 rounded border border-border bg-bg px-2 py-1 font-tabular text-xs focus:border-accent-blue focus:outline-none"
      />
      <button
        type="button"
        data-testid="trade-buy"
        disabled={submitting}
        onClick={() => handleTrade("buy")}
        className="rounded bg-positive px-3 py-1 text-xs font-semibold text-[#04211c] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Buy
      </button>
      <button
        type="button"
        data-testid="trade-sell"
        disabled={submitting}
        onClick={() => handleTrade("sell")}
        className="rounded bg-negative px-3 py-1 text-xs font-semibold text-[#2b0d0c] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Sell
      </button>
      {error && (
        <span data-testid="trade-error" className="text-xs text-negative">
          {error}
        </span>
      )}
      {confirmation && <span className="text-xs text-positive">{confirmation}</span>}
    </div>
  );
}
