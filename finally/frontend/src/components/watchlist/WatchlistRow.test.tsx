import { act, render, screen } from "@testing-library/react";
import { WatchlistRow } from "@/components/watchlist/WatchlistRow";
import { usePriceSnapshot } from "@/hooks/usePrice";
import type { WatchlistItem } from "@/lib/types";
import type { TickerSnapshot } from "@/lib/priceStore";

jest.mock("@/hooks/usePrice", () => ({
  usePriceSnapshot: jest.fn(),
}));

// Sparkline renders a real lightweight-charts canvas chart, which jsdom
// can't back — stub it out since this test is only about the price cell.
jest.mock("@/components/watchlist/Sparkline", () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}));

const mockedUseSnapshot = usePriceSnapshot as jest.MockedFunction<typeof usePriceSnapshot>;

const item: WatchlistItem = {
  ticker: "AAPL",
  price: 190,
  previous_price: 189,
  open_price: 188,
  change: 2,
  change_pct: 1.06,
  direction: "up",
  timestamp: new Date().toISOString(),
};

function snapshot(overrides: Partial<TickerSnapshot>): TickerSnapshot {
  return { price: 190, previousPrice: 189, changePct: 1.06, direction: "up", updatedAt: Date.now(), ...overrides };
}

describe("WatchlistRow", () => {
  beforeEach(() => {
    mockedUseSnapshot.mockReset();
  });

  it("renders the ticker, price, and change percent", () => {
    mockedUseSnapshot.mockReturnValue(snapshot({ price: 190, previousPrice: 189 }));
    render(<WatchlistRow item={item} selected={false} onSelect={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("190.00")).toBeInTheDocument();
  });

  it("flashes green when price ticks up and red when it ticks down, then clears", () => {
    jest.useFakeTimers();
    mockedUseSnapshot.mockReturnValue(snapshot({ price: 190, previousPrice: 189 }));
    const { rerender } = render(
      <WatchlistRow item={item} selected={false} onSelect={jest.fn()} onRemove={jest.fn()} />
    );

    mockedUseSnapshot.mockReturnValue(snapshot({ price: 191, previousPrice: 190 }));
    rerender(<WatchlistRow item={item} selected={false} onSelect={jest.fn()} onRemove={jest.fn()} />);
    const priceCell = screen.getByTestId("watchlist-price");
    expect(priceCell).toHaveClass("flash-up");
    expect(priceCell).toHaveAttribute("data-flash", "up");

    act(() => jest.advanceTimersByTime(600));
    expect(priceCell).not.toHaveAttribute("data-flash");

    mockedUseSnapshot.mockReturnValue(snapshot({ price: 188, previousPrice: 191 }));
    rerender(<WatchlistRow item={item} selected={false} onSelect={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByTestId("watchlist-price")).toHaveAttribute("data-flash", "down");
    jest.useRealTimers();
  });

  it("calls onSelect when the row is clicked and onRemove when the remove control is used", async () => {
    mockedUseSnapshot.mockReturnValue(snapshot({}));
    const onSelect = jest.fn();
    const onRemove = jest.fn();
    render(<WatchlistRow item={item} selected={false} onSelect={onSelect} onRemove={onRemove} />);

    screen.getByText("AAPL").closest("button")!.click();
    expect(onSelect).toHaveBeenCalledTimes(1);

    screen.getByLabelText("Remove AAPL from watchlist").click();
    expect(onRemove).toHaveBeenCalledTimes(1);
    // Removing shouldn't also trigger row selection (stopPropagation).
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
