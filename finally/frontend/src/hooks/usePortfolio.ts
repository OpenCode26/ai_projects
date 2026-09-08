"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppData } from "@/context/AppDataProvider";
import type { Portfolio } from "@/lib/types";

export function usePortfolio() {
  const { client, mode } = useAppData();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await client.getPortfolio();
      setPortfolio(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
    }
  }, [client]);

  useEffect(() => {
    refetch();
  }, [refetch, mode]);

  // Portfolio value shifts every tick (unrealized P&L tracks live prices),
  // so poll it on a light cadence rather than only refetching after trades.
  useEffect(() => {
    const interval = setInterval(refetch, 3000);
    return () => clearInterval(interval);
  }, [refetch]);

  const applyPortfolio = useCallback((next: Portfolio) => setPortfolio(next), []);

  return { portfolio, error, refetch, applyPortfolio };
}
