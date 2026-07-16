import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const MOCK_BOARD: BoardData = {
  columns: [
    { id: "1", title: "Backlog", cardIds: ["1"] },
    { id: "2", title: "Discovery", cardIds: [] },
    { id: "3", title: "In Progress", cardIds: [] },
    { id: "4", title: "Review", cardIds: [] },
    { id: "5", title: "Done", cardIds: [] },
  ],
  cards: {
    "1": { id: "1", title: "Existing task", details: "Some details" },
  },
};

vi.mock("@/lib/api", () => ({
  fetchBoard: vi.fn(),
  renameColumn: vi.fn(),
  createCard: vi.fn(),
  deleteCard: vi.fn(),
  moveCard: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(api.fetchBoard).mockResolvedValue(structuredClone(MOCK_BOARD));
  vi.mocked(api.renameColumn).mockResolvedValue(undefined);
  vi.mocked(api.createCard).mockResolvedValue({ id: "99", title: "New card", details: "" });
  vi.mocked(api.deleteCard).mockResolvedValue(undefined);
  vi.mocked(api.moveCard).mockResolvedValue(undefined);
});

const getFirstColumn = () => screen.getAllByTestId(/^column-/)[0];

describe("KanbanBoard", () => {
  it("renders five columns from API", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    await waitFor(() =>
      expect(screen.getAllByTestId(/^column-/)).toHaveLength(5)
    );
  });

  it("shows loading state before data arrives", () => {
    vi.mocked(api.fetchBoard).mockReturnValue(new Promise(() => {}));
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders existing cards from API", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Existing task")).toBeInTheDocument()
    );
  });

  it("renames a column and calls API", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    await waitFor(() => screen.getAllByTestId(/^column-/));

    const col = getFirstColumn();
    const input = within(col).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");

    expect(input).toHaveValue("New Name");
    await waitFor(() =>
      expect(api.renameColumn).toHaveBeenCalledWith("1", expect.stringContaining("New Name"))
    );
  });

  it("adds a card via API and displays it", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    await waitFor(() => screen.getAllByTestId(/^column-/));

    const col = getFirstColumn();
    await userEvent.click(within(col).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(col).getByPlaceholderText(/card title/i), "New card");
    await userEvent.click(within(col).getByRole("button", { name: /add card/i }));

    expect(api.createCard).toHaveBeenCalledWith("1", "New card", "");
    await waitFor(() =>
      expect(within(col).getByText("New card")).toBeInTheDocument()
    );
  });

  it("deletes a card and calls API", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    await waitFor(() => screen.getByText("Existing task"));

    const col = getFirstColumn();
    await userEvent.click(
      within(col).getByRole("button", { name: /delete existing task/i })
    );

    expect(api.deleteCard).toHaveBeenCalledWith("1");
    expect(within(col).queryByText("Existing task")).not.toBeInTheDocument();
  });

  it("calls onLogout when sign out is clicked", async () => {
    const onLogout = vi.fn();
    render(<KanbanBoard onLogout={onLogout} />);
    await waitFor(() => screen.getAllByTestId(/^column-/));
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
