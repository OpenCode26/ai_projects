"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppData } from "@/context/AppDataProvider";
import { ApiRequestError } from "@/lib/client";
import type { WatchlistItem } from "@/lib/types";

export function useWatchlist() {
  const { client, mode } = useAppData();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const data = await client.getWatchlist();
      setWatchlist(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlist");
    }
  }, [client]);

  useEffect(() => {
    refetch();
  }, [refetch, mode]);

  const addTicker = useCallback(
    async (ticker: string) => {
      setBusy(true);
      setError(null);
      try {
        const next = await client.addWatchlistTicker(ticker.trim().toUpperCase());
        setWatchlist(next);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Failed to add ticker");
      } finally {
        setBusy(false);
      }
    },
    [client]
  );

  const removeTicker = useCallback(
    async (ticker: string) => {
      setBusy(true);
      setError(null);
      try {
        const next = await client.removeWatchlistTicker(ticker);
        setWatchlist(next);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Failed to remove ticker");
      } finally {
        setBusy(false);
      }
    },
    [client]
  );

  const applyWatchlist = useCallback((next: WatchlistItem[]) => setWatchlist(next), []);

  return { watchlist, error, busy, addTicker, removeTicker, refetch, applyWatchlist };
}
