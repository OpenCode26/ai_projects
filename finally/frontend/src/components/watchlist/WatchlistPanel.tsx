"use client";

import { useState } from "react";
import { WatchlistRow } from "@/components/watchlist/WatchlistRow";
import type { WatchlistItem } from "@/lib/types";

export function WatchlistPanel({
  watchlist,
  selectedTicker,
  onSelect,
  onAdd,
  onRemove,
  error,
  busy,
}: {
  watchlist: WatchlistItem[];
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  error: string | null;
  busy: boolean;
}) {
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    onAdd(input);
    setInput("");
  }

  return (
    <section data-testid="watchlist" className="flex h-full flex-col border-r border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Watchlist</h2>
        <span className="font-tabular text-xs text-text-muted">{watchlist.length}</span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-1.5 border-b border-border p-2">
        <input
          data-testid="watchlist-add-input"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Add ticker"
          maxLength={5}
          className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 font-tabular text-xs uppercase text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
        />
        <button
          type="submit"
          data-testid="watchlist-add-submit"
          disabled={busy}
          className="rounded bg-accent-blue px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <div className="border-b border-border bg-negative/10 px-3 py-1.5 text-xs text-negative">{error}</div>}

      <div className="flex-1 overflow-y-auto">
        {watchlist.map((item) => (
          <WatchlistRow
            key={item.ticker}
            item={item}
            selected={item.ticker === selectedTicker}
            onSelect={() => onSelect(item.ticker)}
            onRemove={() => onRemove(item.ticker)}
          />
        ))}
        {watchlist.length === 0 && (
          <div className="p-4 text-center text-xs text-text-muted">
            No tickers yet — add one above to start tracking prices.
          </div>
        )}
      </div>
    </section>
  );
}
