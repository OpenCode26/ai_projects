"use client";

import { useEffect, useState } from "react";
import { AppDataProvider } from "@/context/AppDataProvider";
import { Header } from "@/components/layout/Header";
import { WatchlistPanel } from "@/components/watchlist/WatchlistPanel";
import { MainChart } from "@/components/chart/MainChart";
import { TradeBar } from "@/components/trade/TradeBar";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { Heatmap } from "@/components/portfolio/Heatmap";
import { PnLChart } from "@/components/portfolio/PnLChart";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useHistory } from "@/hooks/useHistory";

function Workstation() {
  const { portfolio, applyPortfolio, refetch: refetchPortfolio } = usePortfolio();
  const { watchlist, error: watchlistError, busy: watchlistBusy, addTicker, removeTicker, applyWatchlist } = useWatchlist();
  const { history } = useHistory();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTicker && watchlist.length > 0) {
      setSelectedTicker(watchlist[0].ticker);
    }
  }, [watchlist, selectedTicker]);

  function handleRemove(ticker: string) {
    removeTicker(ticker);
    if (selectedTicker === ticker) {
      const next = watchlist.find((w) => w.ticker !== ticker);
      setSelectedTicker(next?.ticker ?? null);
    }
  }

  function handleTradeExecuted() {
    refetchPortfolio();
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header portfolio={portfolio} />

      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0">
          <WatchlistPanel
            watchlist={watchlist}
            selectedTicker={selectedTicker}
            onSelect={setSelectedTicker}
            onAdd={addTicker}
            onRemove={handleRemove}
            error={watchlistError}
            busy={watchlistBusy}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-80 shrink-0 border-b border-border p-2">
            <MainChart ticker={selectedTicker} />
          </div>

          <TradeBar selectedTicker={selectedTicker} onExecuted={handleTradeExecuted} />

          <div className="min-h-0 flex-1 overflow-hidden border-b border-border">
            <PositionsTable portfolio={portfolio} selectedTicker={selectedTicker} onSelect={setSelectedTicker} />
          </div>

          <div className="grid h-64 shrink-0 grid-cols-2">
            <div className="border-r border-border">
              <Heatmap portfolio={portfolio} />
            </div>
            <PnLChart history={history} />
          </div>
        </div>

        <div className="w-80 shrink-0">
          <ChatPanel onPortfolio={applyPortfolio} onWatchlist={applyWatchlist} />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <AppDataProvider>
      <Workstation />
    </AppDataProvider>
  );
}
