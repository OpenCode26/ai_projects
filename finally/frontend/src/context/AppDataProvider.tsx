"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient, detectLiveBackend, type ClientMode, type DataClient } from "@/lib/client";
import { PriceStore } from "@/lib/priceStore";

interface AppDataContextValue {
  client: DataClient;
  mode: ClientMode;
  priceStore: PriceStore;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ClientMode>("mock");
  const [client, setClient] = useState<DataClient>(() => createClient("mock"));
  const [priceStore] = useState(() => new PriceStore());

  // Start in mock mode so the UI is instantly interactive, then upgrade to
  // the real backend the moment it's reachable (single-container deploy —
  // by the time a user's browser loads the page, /api/health is already up).
  useEffect(() => {
    let cancelled = false;
    detectLiveBackend().then((isLive) => {
      if (cancelled || !isLive) return;
      priceStore.reset();
      setClient(createClient("live"));
      setMode("live");
    });
    return () => {
      cancelled = true;
    };
  }, [priceStore]);

  useEffect(() => {
    const unsubscribe = client.subscribePrices(
      (update) => priceStore.applyUpdate(update),
      (status) => priceStore.setStatus(status)
    );
    return unsubscribe;
  }, [client, priceStore]);

  const value = useMemo<AppDataContextValue>(() => ({ client, mode, priceStore }), [client, mode, priceStore]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export function useDataClient(): DataClient {
  return useAppData().client;
}
