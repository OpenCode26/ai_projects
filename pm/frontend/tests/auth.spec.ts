import { expect, test, type Page } from "@playwright/test";

const MOCK_BOARD = {
  columns: [
    { id: 1, title: "Backlog", position: 0, cards: [] },
    { id: 2, title: "Discovery", position: 1, cards: [] },
    { id: 3, title: "In Progress", position: 2, cards: [] },
    { id: 4, title: "Review", position: 3, cards: [] },
    { id: 5, title: "Done", position: 4, cards: [] },
  ],
};

async function mockBoard(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: MOCK_BOARD })
  );
}

test("shows login form at /", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.getByLabel(/username/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("wrong credentials show error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("wrong");
  await page.getByLabel(/password/i).fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("correct credentials show kanban board", async ({ page }) => {
  await mockBoard(page);
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("logout returns to login form", async ({ page }) => {
  await mockBoard(page);
  await page.addInitScript(() => localStorage.setItem("authed", "true"));
  await page.goto("/");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByLabel(/username/i)).toBeVisible();
});

test("stays logged in after page reload", async ({ page }) => {
  await mockBoard(page);
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});
