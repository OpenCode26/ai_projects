import { expect, test } from "@playwright/test";

test("loads dummy data on open", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("board-title")).toHaveText("Product Roadmap");
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByText("Research competitors")).toBeVisible();
});

test("adds and deletes a card", async ({ page }) => {
  await page.goto("/");

  const column = page.getByTestId("column-col-todo");
  await column.getByPlaceholder("Card title").fill("E2E test card");
  await column.getByPlaceholder("Details (optional)").fill("Created by Playwright");
  await column.getByRole("button", { name: "Add card" }).click();

  await expect(page.getByText("E2E test card")).toBeVisible();

  const card = page.locator("article", { hasText: "E2E test card" });
  await card.hover();
  await card.getByRole("button", { name: "Delete E2E test card" }).click();

  await expect(page.getByText("E2E test card")).not.toBeVisible();
});

test("renames a column", async ({ page }) => {
  await page.goto("/");

  const titleInput = page.getByTestId("column-title-col-review");
  await titleInput.fill("QA");
  await expect(titleInput).toHaveValue("QA");
});

test("drags a card to another column", async ({ page }) => {
  await page.goto("/");

  const card = page.getByTestId("card-card-3");
  const targetColumn = page.getByTestId("column-col-done");

  const cardBox = await card.boundingBox();
  const targetBox = await targetColumn.boundingBox();
  if (!cardBox || !targetBox) throw new Error("Missing bounding boxes");

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(targetColumn.getByTestId("card-card-3")).toBeVisible();
});
