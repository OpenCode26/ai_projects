import { render, screen } from "@testing-library/react";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import type { Portfolio } from "@/lib/types";

const portfolio: Portfolio = {
  cash_balance: 5000,
  total_value: 7500,
  positions_value: 2440,
  cost_basis: 2320,
  unrealized_pnl: 120,
  unrealized_pnl_pct: 5.17,
  positions: [
    {
      ticker: "AAPL",
      quantity: 10,
      avg_cost: 180,
      current_price: 195,
      market_value: 1950,
      cost_basis: 1800,
      unrealized_pnl: 150,
      unrealized_pnl_pct: 8.33,
      weight_pct: 26,
      updated_at: new Date().toISOString(),
    },
    {
      ticker: "TSLA",
      quantity: 2,
      avg_cost: 260,
      current_price: 245,
      market_value: 490,
      cost_basis: 520,
      unrealized_pnl: -30,
      unrealized_pnl_pct: -5.77,
      weight_pct: 6.5,
      updated_at: new Date().toISOString(),
    },
  ],
};

describe("PositionsTable", () => {
  it("shows an empty state with no positions", () => {
    render(<PositionsTable portfolio={null} selectedTicker={null} onSelect={jest.fn()} />);
    expect(screen.getByTestId("positions-empty")).toBeInTheDocument();
  });

  it("renders each position's quantity, cost basis, and P&L with correct sign", () => {
    render(<PositionsTable portfolio={portfolio} selectedTicker={null} onSelect={jest.fn()} />);

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument(); // AAPL unrealized P&L
    expect(screen.getByText("+8.33%")).toBeInTheDocument();

    expect(screen.getByText("TSLA")).toBeInTheDocument();
    expect(screen.getByText("-$30.00")).toBeInTheDocument(); // TSLA unrealized P&L (negative)
    expect(screen.getByText("-5.77%")).toBeInTheDocument();
  });

  it("calls onSelect with the ticker when a row is clicked", async () => {
    const onSelect = jest.fn();
    render(<PositionsTable portfolio={portfolio} selectedTicker={null} onSelect={onSelect} />);

    screen.getByText("TSLA").closest("tr")!.click();
    expect(onSelect).toHaveBeenCalledWith("TSLA");
  });
});
