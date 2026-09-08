"use client";

import { useCallback, useState } from "react";
import { useAppData } from "@/context/AppDataProvider";
import { ApiRequestError } from "@/lib/client";
import type { Portfolio, TradeSide } from "@/lib/types";

export function useTrade(onExecuted: (portfolio: Portfolio) => void) {
  const { client } = useAppData();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTrade = useCallback(
    async (ticker: string, quantity: number, side: TradeSide) => {
      setSubmitting(true);
      setError(null);
      try {
        const portfolio = await client.executeTrade({ ticker: ticker.toUpperCase(), quantity, side });
        onExecuted(portfolio);
        return true;
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Trade failed");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [client, onExecuted]
  );

  return { submitTrade, submitting, error };
}
