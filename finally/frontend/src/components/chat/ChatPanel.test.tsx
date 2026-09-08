import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChat } from "@/hooks/useChat";
import type { ChatMessage } from "@/lib/types";

jest.mock("@/hooks/useChat", () => ({
  useChat: jest.fn(),
}));

const mockedUseChat = useChat as jest.MockedFunction<typeof useChat>;

function baseChat(overrides: Partial<ReturnType<typeof useChat>> = {}): ReturnType<typeof useChat> {
  return { messages: [], send: jest.fn(), pending: false, ...overrides };
}

describe("ChatPanel", () => {
  it("shows an empty-state hint with no messages", () => {
    mockedUseChat.mockReturnValue(baseChat());
    render(<ChatPanel onPortfolio={jest.fn()} onWatchlist={jest.fn()} />);
    expect(screen.getByText(/ask finally about your portfolio/i)).toBeInTheDocument();
  });

  it("renders user and assistant messages, and inline trade action confirmations", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "buy 5 AAPL", actions: null, created_at: new Date().toISOString() },
      {
        id: "2",
        role: "assistant",
        content: "Done — bought 5 shares of AAPL.",
        actions: {
          trades: [
            {
              ticker: "AAPL",
              side: "buy",
              quantity: 5,
              status: "executed",
              price: 189.5,
              notional: 947.5,
              realized_pnl: null,
              error: null,
            },
          ],
          watchlist_changes: [],
        },
        created_at: new Date().toISOString(),
      },
    ];
    mockedUseChat.mockReturnValue(baseChat({ messages }));
    render(<ChatPanel onPortfolio={jest.fn()} onWatchlist={jest.fn()} />);

    expect(screen.getByText("buy 5 AAPL")).toBeInTheDocument();
    expect(screen.getByText("Done — bought 5 shares of AAPL.")).toBeInTheDocument();
    const action = screen.getByTestId("chat-action");
    expect(action).toHaveTextContent(/buy.*executed/i);
    expect(action).toHaveTextContent("5 AAPL");
  });

  it("renders a failed trade's per-item error inline", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Couldn't complete that.",
        actions: {
          trades: [
            {
              ticker: "AAPL",
              side: "buy",
              quantity: 1_000_000,
              status: "failed",
              price: null,
              notional: null,
              realized_pnl: null,
              error: "Insufficient cash: AAPL buy costs $190,000,000.00 but only $10,000.00 is available",
            },
          ],
          watchlist_changes: [],
        },
        created_at: new Date().toISOString(),
      },
    ];
    mockedUseChat.mockReturnValue(baseChat({ messages }));
    render(<ChatPanel onPortfolio={jest.fn()} onWatchlist={jest.fn()} />);

    const action = screen.getByTestId("chat-action");
    expect(action).toHaveTextContent(/buy.*failed/i);
    expect(action).toHaveTextContent(/insufficient cash/i);
  });

  it("shows a loading indicator while a response is pending", () => {
    mockedUseChat.mockReturnValue(baseChat({ pending: true }));
    render(<ChatPanel onPortfolio={jest.fn()} onWatchlist={jest.fn()} />);
    expect(screen.getByTestId("chat-loading")).toBeInTheDocument();
  });

  it("sends the typed message and clears the input", async () => {
    const send = jest.fn();
    mockedUseChat.mockReturnValue(baseChat({ send }));
    const user = userEvent.setup();
    render(<ChatPanel onPortfolio={jest.fn()} onWatchlist={jest.fn()} />);

    const input = screen.getByTestId("chat-input");
    await user.type(input, "what's my P&L?");
    await user.click(screen.getByTestId("chat-send"));

    expect(send).toHaveBeenCalledWith("what's my P&L?");
    expect(input).toHaveValue("");
  });
});
