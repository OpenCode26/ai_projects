import type { Board } from "./types";

export const dummyBoard: Board = {
  title: "Product Roadmap",
  columns: [
    {
      id: "col-backlog",
      title: "Backlog",
      cards: [
        {
          id: "card-1",
          title: "Research competitors",
          details: "Review top 5 Kanban tools and note standout UX patterns.",
        },
        {
          id: "card-2",
          title: "Define MVP scope",
          details: "Lock features for v1: board, columns, cards, drag-and-drop.",
        },
      ],
    },
    {
      id: "col-todo",
      title: "To Do",
      cards: [
        {
          id: "card-3",
          title: "Design board layout",
          details: "Wireframe column grid, card anatomy, and accent styling.",
        },
        {
          id: "card-4",
          title: "Set up component library",
          details: "Scaffold Next.js app with Tailwind and shared UI tokens.",
        },
      ],
    },
    {
      id: "col-in-progress",
      title: "In Progress",
      cards: [
        {
          id: "card-5",
          title: "Implement drag and drop",
          details: "Integrate dnd-kit for cross-column card moves.",
        },
      ],
    },
    {
      id: "col-review",
      title: "Review",
      cards: [
        {
          id: "card-6",
          title: "Accessibility pass",
          details: "Keyboard navigation, focus states, and ARIA labels.",
        },
      ],
    },
    {
      id: "col-done",
      title: "Done",
      cards: [
        {
          id: "card-7",
          title: "Project scaffolding",
          details: "Next.js app, gitignore, plan, and test tooling.",
        },
      ],
    },
  ],
};
