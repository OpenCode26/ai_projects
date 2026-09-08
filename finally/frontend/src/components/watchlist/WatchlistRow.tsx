"use client";

import { useEffect, useRef, useState } from "react";
import { usePriceSnapshot } from "@/hooks/usePrice";
import { Sparkline } from "@/components/watchlist/Sparkline";
import type { WatchlistItem } from "@/lib/types";

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WatchlistRow({
  item,
  selected,
  onSelect,
  onRemove,
}: {
  item: WatchlistItem;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const snapshot = usePriceSnapshot(item.ticker);
  const price = snapshot?.price ?? item.price;
  const previousPrice = snapshot?.previousPrice ?? item.previous_price ?? price;
  const changePct = snapshot?.changePct ?? item.change_pct;
  const up = price !== null && previousPrice !== null ? price >= previousPrice : true;
  const hasQuote = price !== null;

  const [flashKey, setFlashKey] = useState(0);
  const [flashDirection, setFlashDirection] = useState<"up" | "down" | null>(null);
  const lastPrice = useRef(price);

  useEffect(() => {
    if (price === null || price === lastPrice.current) return;
    setFlashDirection(lastPrice.current !== null && price > lastPrice.current ? "up" : "down");
    setFlashKey((k) => k + 1);
    lastPrice.current = price;
  }, [price]);

  // Matches the CSS animation duration (globals.css .flash-up/.flash-down,
  // ~500ms per PLAN.md §13.10) so data-flash reflects "currently animating",
  // not "has ever flashed".
  useEffect(() => {
    if (!flashDirection) return;
    const timer = setTimeout(() => setFlashDirection(null), 500);
    return () => clearTimeout(timer);
  }, [flashKey, flashDirection]);

  return (
    <button
      type="button"
      data-testid="watchlist-row"
      data-ticker={item.ticker}
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left transition-colors hover:bg-panel-raised ${
        selected ? "bg-panel-raised" : ""
      }`}
    >
      <div className="w-16 shrink-0">
        <div className="font-tabular text-sm font-semibold">{item.ticker}</div>
        <div className={`text-xs font-tabular ${up ? "text-positive" : "text-negative"}`}>
          {hasQuote && changePct !== null ? (
            <>
              {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
            </>
          ) : (
            "—"
          )}
        </div>
      </div>

      <Sparkline ticker={item.ticker} positive={up} />

      <div
        key={flashKey}
        data-testid="watchlist-price"
        data-flash={flashDirection ?? undefined}
        className={`ml-auto rounded px-2 py-1 font-tabular text-sm ${flashDirection ? `flash-${flashDirection}` : ""}`}
      >
        {formatPrice(price)}
      </div>

      <span
        role="button"
        tabIndex={0}
        data-testid="watchlist-remove"
        aria-label={`Remove ${item.ticker} from watchlist`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }
        }}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-text-muted opacity-0 transition-opacity hover:bg-negative/20 hover:text-negative group-hover:opacity-100"
      >
        ✕
      </span>
    </button>
  );
}
