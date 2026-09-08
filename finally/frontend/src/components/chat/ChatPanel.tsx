"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/hooks/useChat";
import type { ActionStatus, ChatMessage, Portfolio, WatchlistItem } from "@/lib/types";

const STATUS_STYLE: Record<ActionStatus, string> = {
  executed: "bg-positive/20 text-positive",
  unchanged: "bg-positive/20 text-positive",
  failed: "bg-negative/20 text-negative",
  skipped: "bg-text-muted/20 text-text-muted",
};

function ActionSummary({ actions }: { actions: NonNullable<ChatMessage["actions"]> }) {
  const trades = actions.trades ?? [];
  const watchlistChanges = actions.watchlist_changes ?? [];
  if (trades.length === 0 && watchlistChanges.length === 0) return null;

  return (
    <div data-testid="chat-action" className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2">
      {trades.map((t, i) => (
        <div key={`trade-${i}`} className="flex flex-col gap-0.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${STATUS_STYLE[t.status]}`}>
              {t.side} · {t.status}
            </span>
            <span className="font-tabular">
              {t.quantity} {t.ticker}
            </span>
          </div>
          {t.error && <span className="text-negative">{t.error}</span>}
        </div>
      ))}
      {watchlistChanges.map((c, i) => (
        <div key={`wl-${i}`} className="flex flex-col gap-0.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${STATUS_STYLE[c.status]}`}>
              {c.action} · {c.status}
            </span>
            <span className="font-tabular">{c.ticker} watchlist</span>
          </div>
          {c.error && <span className="text-negative">{c.error}</span>}
        </div>
      ))}
    </div>
  );
}

export function ChatPanel({
  onPortfolio,
  onWatchlist,
}: {
  onPortfolio: (portfolio: Portfolio) => void;
  onWatchlist: (watchlist: WatchlistItem[]) => void;
}) {
  const { messages, send, pending } = useChat({ onPortfolio, onWatchlist });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || pending) return;
    send(input);
    setInput("");
  }

  return (
    <section data-testid="chat-panel" className="flex h-full flex-col border-l border-border bg-panel">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">AI Assistant</h2>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs leading-relaxed text-text-muted">
            Ask FinAlly about your portfolio, request an analysis, or tell it to buy, sell, or manage your watchlist.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              data-testid="chat-message"
              data-role={m.role}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-accent-blue/20 text-text-primary" : "bg-panel-raised text-text-primary"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.actions && <ActionSummary actions={m.actions} />}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div data-testid="chat-loading" className="flex items-center gap-1 rounded-lg bg-panel-raised px-3 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-2">
        <input
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask FinAlly..."
          className="min-w-0 flex-1 rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
        />
        <button
          type="submit"
          data-testid="chat-send"
          disabled={pending || !input.trim()}
          className="rounded bg-accent-purple px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
