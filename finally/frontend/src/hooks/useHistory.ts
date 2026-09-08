"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppData } from "@/context/AppDataProvider";
import type { PortfolioSnapshot } from "@/lib/types";

export function useHistory() {
  const { client, mode } = useAppData();
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);

  const refetch = useCallback(async () => {
    try {
      setHistory(await client.getHistory());
    } catch {
      // Non-critical: P&L chart just stays empty until the next successful poll.
    }
  }, [client]);

  useEffect(() => {
    refetch();
  }, [refetch, mode]);

  useEffect(() => {
    const interval = setInterval(refetch, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { history, refetch };
}
