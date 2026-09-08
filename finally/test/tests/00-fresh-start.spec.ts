/**
 * First-launch experience (PLAN §2, §12).
 *
 * Runs early in the file order so it sees seed state: start-native.sh (and
 * the tmpfs mount in docker-compose.test.yml) hand each run an empty database.
 */
import { test, expect } from '@playwright/test';
import {
  DEFAULT_WATCHLIST,
  SEED_CASH,
  numberFrom,
  waitForLivePrices,
  waitForPriceChange,
  watchlistRow,
} from '../support/helpers';

test.describe('fresh start', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('app loads without console errors or failed requests', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await page.reload();
    await waitForLivePrices(page);

    expect(failedRequests, 'no 5xx responses on first load').toEqual([]);
    expect(consoleErrors, 'no console errors on first load').toEqual([]);
  });

  test('shows the ten default watchlist tickers', async ({ page }) => {
    await waitForLivePrices(page);
    for (const ticker of DEFAULT_WATCHLIST) {
      await expect(watchlistRow(page, ticker), `${ticker} should be on the watchlist`).toBeVisible();
    }
    await expect(page.getByTestId('watchlist-row')).toHaveCount(DEFAULT_WATCHLIST.length);
  });

  test('shows the $10,000 seed cash balance', async ({ page }) => {
    await expect(page.getByTestId('cash-balance')).toBeVisible();
    expect(await numberFrom(page.getByTestId('cash-balance'))).toBeCloseTo(SEED_CASH, 2);
  });

  test('total portfolio value equals cash when there are no positions', async ({ page }) => {
    expect(await numberFrom(page.getByTestId('total-value'))).toBeCloseTo(SEED_CASH, 2);
  });

  test('positions table is empty on a fresh account', async ({ page }) => {
    await expect(page.getByTestId('positions-empty')).toBeVisible();
    await expect(page.getByTestId('position-row')).toHaveCount(0);
  });

  test('connection indicator reports a live stream', async ({ page }) => {
    await expect(page.getByTestId('connection-status')).toHaveAttribute(
      'data-status',
      'connected',
      { timeout: 30_000 },
    );
  });

  test('prices stream and update in place', async ({ page }) => {
    await waitForLivePrices(page);
    await waitForPriceChange(page, 'AAPL');
  });

  test('every watchlist row shows a positive price', async ({ page }) => {
    await waitForLivePrices(page);
    const rows = page.getByTestId('watchlist-row');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const price = await numberFrom(rows.nth(i).getByTestId('watchlist-price'));
      const ticker = await rows.nth(i).getAttribute('data-ticker');
      expect(price, `${ticker} should have a positive price`).toBeGreaterThan(0);
    }
  });

  test('price change flashes green or red', async ({ page }) => {
    // REVIEW.md notes functional tests miss a broken flash animation entirely,
    // so assert the flash state actually toggles on a tick (PLAN §2, §13.10).
    await waitForLivePrices(page);
    const priceEl = watchlistRow(page, 'AAPL').getByTestId('watchlist-price');

    await expect
      .poll(() => priceEl.getAttribute('data-flash'), {
        timeout: 30_000,
        message: 'price element should enter a flash state when the price ticks',
      })
      .toMatch(/^(up|down)$/);

    // ...and the flash must fade rather than sticking (~500ms per §13.10).
    await expect
      .poll(() => priceEl.getAttribute('data-flash'), {
        timeout: 10_000,
        message: 'flash should clear after its transition',
      })
      .not.toMatch(/^(up|down)$/);
  });

  test('core panels are all present', async ({ page }) => {
    await waitForLivePrices(page);
    for (const id of [
      'watchlist',
      'main-chart',
      'pnl-chart',
      'heatmap',
      'positions-table',
      'chat-panel',
    ]) {
      await expect(page.getByTestId(id), `${id} panel should render`).toBeVisible();
    }
  });

  test('sparklines accumulate from the SSE stream', async ({ page }) => {
    await waitForLivePrices(page);
    const spark = watchlistRow(page, 'AAPL').getByTestId('sparkline');
    await expect(spark).toBeVisible();
    await expect
      .poll(async () => Number((await spark.getAttribute('data-point-count')) ?? 0), {
        timeout: 30_000,
        message: 'sparkline should accumulate points as prices stream in',
      })
      .toBeGreaterThan(1);
  });
});
