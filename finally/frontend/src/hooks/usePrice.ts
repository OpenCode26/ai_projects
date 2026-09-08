"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAppData } from "@/context/AppDataProvider";
import type { PricePoint } from "@/lib/types";
import type { TickerSnapshot } from "@/lib/priceStore";

export function usePriceSnapshot(ticker: string): TickerSnapshot | undefined {
  const { priceStore } = useAppData();
  const subscribe = useCallback(
    (listener: () => void) => priceStore.subscribeTicker(ticker)(listener),
    [priceStore, ticker]
  );
  const getSnapshot = useCallback(() => priceStore.getSnapshot(ticker), [priceStore, ticker]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function usePriceBuffer(ticker: string): PricePoint[] {
  const { priceStore } = useAppData();
  const subscribe = useCallback(
    (listener: () => void) => priceStore.subscribeTicker(ticker)(listener),
    [priceStore, ticker]
  );
  const getSnapshot = useCallback(() => priceStore.getBuffer(ticker), [priceStore, ticker]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useConnectionStatus() {
  const { priceStore } = useAppData();
  return useSyncExternalStore(priceStore.subscribeStatus, priceStore.getStatus, priceStore.getStatus);
}
