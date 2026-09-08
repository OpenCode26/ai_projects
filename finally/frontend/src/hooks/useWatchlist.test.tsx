import { act, renderHook, waitFor } from "@testing-library/react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useAppData } from "@/context/AppDataProvider";
import type { DataClient } from "@/lib/client/types";
import type { WatchlistItem } from "@/lib/types";

jest.mock("@/context/AppDataProvider", () => ({
  useAppData: jest.fn(),
}));

const mockedUseAppData = useAppData as jest.MockedFunction<typeof useAppData>;

function makeItem(ticker: string): WatchlistItem {
  return {
    ticker,
    price: 100,
    previous_price: 100,
    open_price: 100,
    change: 0,
    change_pct: 0,
    direction: "flat",
    timestamp: new Date().toISOString(),
  };
}

function fakeClient(initial: WatchlistItem[]): DataClient {
  let watchlist = initial;
  return {
    getWatchlist: jest.fn(async () => watchlist),
    addWatchlistTicker: jest.fn(async (ticker: string) => {
      watchlist = [...watchlist, makeItem(ticker)];
      return watchlist;
    }),
    removeWatchlistTicker: jest.fn(async (ticker: string) => {
      watchlist = watchlist.filter((w) => w.ticker !== ticker);
      return watchlist;
    }),
    getPortfolio: jest.fn(),
    executeTrade: jest.fn(),
    getHistory: jest.fn(),
    getTrades: jest.fn(),
    sendChat: jest.fn(),
    getChatHistory: jest.fn(async () => []),
    subscribePrices: jest.fn(() => () => {}),
  };
}

describe("useWatchlist", () => {
  it("loads the watchlist on mount", async () => {
    const client = fakeClient([makeItem("AAPL"), makeItem("GOOGL")]);
    mockedUseAppData.mockReturnValue({ client, mode: "mock", priceStore: {} as never });

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => expect(result.current.watchlist).toHaveLength(2));
    expect(result.current.watchlist.map((w) => w.ticker)).toEqual(["AAPL", "GOOGL"]);
  });

  it("adds a ticker (normalized to uppercase) and updates state", async () => {
    const client = fakeClient([makeItem("AAPL")]);
    mockedUseAppData.mockReturnValue({ client, mode: "mock", priceStore: {} as never });

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.addTicker("pypl");
    });

    expect(client.addWatchlistTicker).toHaveBeenCalledWith("PYPL");
    expect(result.current.watchlist.map((w) => w.ticker)).toContain("PYPL");
  });

  it("removes a ticker and updates state", async () => {
    const client = fakeClient([makeItem("AAPL"), makeItem("GOOGL")]);
    mockedUseAppData.mockReturnValue({ client, mode: "mock", priceStore: {} as never });

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(2));

    await act(async () => {
      await result.current.removeTicker("AAPL");
    });

    expect(result.current.watchlist.map((w) => w.ticker)).toEqual(["GOOGL"]);
  });

  it("surfaces an error message when adding fails", async () => {
    const client = fakeClient([]);
    (client.addWatchlistTicker as jest.Mock).mockRejectedValue(new Error("Ticker must be 1-5 alphanumeric characters"));
    mockedUseAppData.mockReturnValue({ client, mode: "mock", priceStore: {} as never });

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toEqual([]));

    await act(async () => {
      await result.current.addTicker("toolong");
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});
