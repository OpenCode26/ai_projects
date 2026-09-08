"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppData } from "@/context/AppDataProvider";
import { ApiRequestError } from "@/lib/client";
import type { ChatMessage, Portfolio, WatchlistItem } from "@/lib/types";

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface UseChatOptions {
  onPortfolio?: (portfolio: Portfolio) => void;
  onWatchlist?: (watchlist: WatchlistItem[]) => void;
}

export function useChat({ onPortfolio, onWatchlist }: UseChatOptions = {}) {
  const { client } = useAppData();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  // Hydrate from server-stored history on mount so a page reload doesn't
  // lose prior conversation (PLAN.md §13.13, GET /api/chat/history).
  useEffect(() => {
    let cancelled = false;
    client.getChatHistory().then((history) => {
      if (!cancelled && history.length > 0) setMessages(history);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const send = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const userMessage: ChatMessage = {
        id: uuid(),
        role: "user",
        content: trimmed,
        actions: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setPending(true);

      try {
        const res = await client.sendChat({ message: trimmed });
        const assistantMessage: ChatMessage = {
          id: uuid(),
          role: "assistant",
          content: res.message,
          actions:
            res.trades.length > 0 || res.watchlist_changes.length > 0
              ? { trades: res.trades, watchlist_changes: res.watchlist_changes }
              : null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        // portfolio/watchlist are non-null exactly when the turn mutated
        // state (PLAN.md §13.6) — already post-execution, no refetch needed.
        if (res.portfolio) onPortfolio?.(res.portfolio);
        if (res.watchlist) onWatchlist?.(res.watchlist.watchlist);
      } catch (err) {
        const reason = err instanceof ApiRequestError ? err.message : "I had trouble processing that, please try again.";
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: "assistant", content: reason, actions: null, created_at: new Date().toISOString() },
        ]);
      } finally {
        setPending(false);
      }
    },
    [client, onPortfolio, onWatchlist]
  );

  return { messages, send, pending };
}
