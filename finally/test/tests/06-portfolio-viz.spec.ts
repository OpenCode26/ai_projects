/**
 * Portfolio visualizations: heatmap, P&L chart, main chart (PLAN §10, §12).
 *
 * Charts render to canvas, which Playwright cannot introspect. These specs
 * assert the containers exist, are laid out with real size, and expose the
 * data-driven attributes the frontend publishes -- not pixel contents.
 */
import { test, expect } from '@playwright/test';
import {
  resetAccount,
  trade,
  waitForLivePrices,
  watchlistRow,
} from '../support/helpers';

test.describe('portfolio visualizations', () => {
  test.afterEach(async ({ request }) => resetAccount(request));

  test('heatmap renders a tile per position, coloured by P&L', async ({ page, request }) => {
    await trade(request, 'AAPL', 'buy', 3);
    await trade(request, 'MSFT', 'buy', 2);
    await page.goto('/');
    await waitForLivePrices(page);

    const heatmap = page.getByTestId('heatmap');
    await expect(heatmap).toBeVisible();

    const tiles = page.getByTestId('heatmap-tile');
    await expect(tiles).toHaveCount(2, { timeout: 20_000 });
    for (const ticker of ['AAPL', 'MSFT']) {
      await expect(
        page.locator(`[data-testid="heatmap-tile"][data-ticker="${ticker}"]`),
      ).toBeVisible();
    }

    // Each tile must commit to a direction so the green/red colouring in
    // §13.10 is actually driven by P&L rather than rendering flat grey.
    const first = page.getByTestId('heatmap-tile').first();
    await expect
      .poll(() => first.getAttribute('data-pnl-direction'), { timeout: 20_000 })
      .toMatch(/^(positive|negative|flat)$/);
  });

  test('heatmap is empty when there are no positions', async ({ page }) => {
    await page.goto('/');
    await waitForLivePrices(page);
    await expect(page.getByTestId('heatmap')).toBeVisible();
    await expect(page.getByTestId('heatmap-tile')).toHaveCount(0);
  });

  test('P&L chart has data points from portfolio snapshots', async ({ page }) => {
    await page.goto('/');
    await waitForLivePrices(page);

    const chart = page.getByTestId('pnl-chart');
    await expect(chart).toBeVisible();
    const box = await chart.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // A seed snapshot is written at profile creation (PLAN §7), so the chart
    // is never empty even before any trade.
    await expect
      .poll(async () => Number((await chart.getAttribute('data-point-count')) ?? 0), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
  });

  test('a trade adds a new P&L snapshot point', async ({ page, request }) => {
    await page.goto('/');
    await waitForLivePrices(page);
    const chart = page.getByTestId('pnl-chart');
    const before = Number((await chart.getAttribute('data-point-count')) ?? 0);

    // PLAN §7: a snapshot is recorded immediately after each trade.
    await trade(request, 'NVDA', 'buy', 1);

    await expect
      .poll(async () => Number((await chart.getAttribute('data-point-count')) ?? 0), {
        timeout: 30_000,
        message: 'a snapshot should be recorded right after a trade',
      })
      .toBeGreaterThan(before);
  });

  test('main chart renders and follows the selected ticker', async ({ page }) => {
    await page.goto('/');
    await waitForLivePrices(page);

    const chart = page.getByTestId('main-chart');
    await expect(chart).toBeVisible();
    const box = await chart.boundingBox();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);

    await watchlistRow(page, 'NVDA').click();
    await expect(chart).toHaveAttribute('data-ticker', 'NVDA', { timeout: 15_000 });

    await expect
      .poll(async () => Number((await chart.getAttribute('data-point-count')) ?? 0), {
        timeout: 30_000,
        message: 'main chart should accumulate streamed points',
      })
      .toBeGreaterThan(1);
  });

  test('switching tickers keeps background-buffered history', async ({ page }) => {
    // PLAN §13.11: buffering continues for every tracked ticker, so switching
    // back must not show a truncated chart.
    await page.goto('/');
    await waitForLivePrices(page);
    const chart = page.getByTestId('main-chart');

    await watchlistRow(page, 'AAPL').click();
    await expect(chart).toHaveAttribute('data-ticker', 'AAPL', { timeout: 15_000 });
    await expect
      .poll(async () => Number((await chart.getAttribute('data-point-count')) ?? 0), {
        timeout: 30_000,
      })
      .toBeGreaterThan(3);
    const aaplPoints = Number(await chart.getAttribute('data-point-count'));

    await watchlistRow(page, 'TSLA').click();
    await expect(chart).toHaveAttribute('data-ticker', 'TSLA', { timeout: 15_000 });
    await page.waitForTimeout(3_000);

    await watchlistRow(page, 'AAPL').click();
    await expect(chart).toHaveAttribute('data-ticker', 'AAPL', { timeout: 15_000 });
    expect(
      Number(await chart.getAttribute('data-point-count')),
      'AAPL history should have kept growing while TSLA was selected',
    ).toBeGreaterThanOrEqual(aaplPoints);
  });

  test('positions table shows every column from the spec', async ({ page, request }) => {
    await trade(request, 'META', 'buy', 2);
    await page.goto('/');
    await waitForLivePrices(page);

    const row = page.locator('[data-testid="position-row"][data-ticker="META"]');
    await expect(row).toBeVisible({ timeout: 15_000 });
    for (const cell of [
      'position-quantity',
      'position-avg-cost',
      'position-current-price',
      'position-pnl',
      'position-pnl-pct',
    ]) {
      await expect(row.getByTestId(cell), `${cell} should render`).toBeVisible();
    }
  });
});
