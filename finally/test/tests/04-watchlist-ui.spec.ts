/**
 * Watchlist management through the UI (PLAN §2, §10, §12).
 */
import { test, expect } from '@playwright/test';
import {
  addToWatchlist,
  getWatchlistTickers,
  resetAccount,
  trade,
  waitForLivePrices,
  watchlistRow,
  positionRow,
} from '../support/helpers';

test.describe('watchlist UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForLivePrices(page);
  });
  test.afterEach(async ({ request }) => resetAccount(request));

  test('add a ticker and see it start streaming', async ({ page }) => {
    await page.getByTestId('watchlist-add-input').fill('PYPL');
    await page.getByTestId('watchlist-add-submit').click();

    const row = watchlistRow(page, 'PYPL');
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => Number((await row.getByTestId('watchlist-price').innerText()).replace(/[$,\s]/g, '')), {
        timeout: 30_000,
        message: 'newly added ticker should receive a price',
      })
      .toBeGreaterThan(0);
  });

  test('remove a ticker', async ({ page, request }) => {
    await addToWatchlist(request, 'PYPL');
    await page.reload();
    await waitForLivePrices(page);

    await expect(watchlistRow(page, 'PYPL')).toBeVisible();
    await watchlistRow(page, 'PYPL').getByTestId('watchlist-remove').click();
    await expect(watchlistRow(page, 'PYPL')).toHaveCount(0, { timeout: 15_000 });

    expect(await getWatchlistTickers(request)).not.toContain('PYPL');
  });

  test('adding a lowercase duplicate does not create a second row', async ({ page }) => {
    const before = await page.getByTestId('watchlist-row').count();
    await page.getByTestId('watchlist-add-input').fill('aapl');
    await page.getByTestId('watchlist-add-submit').click();

    await expect(page.getByTestId('watchlist-row')).toHaveCount(before);
    await expect(watchlistRow(page, 'AAPL')).toHaveCount(1);
  });

  test('adding a lowercase new ticker renders it uppercased', async ({ page }) => {
    await page.getByTestId('watchlist-add-input').fill('pypl');
    await page.getByTestId('watchlist-add-submit').click();
    await expect(watchlistRow(page, 'PYPL')).toBeVisible({ timeout: 15_000 });
  });

  test('clicking a ticker selects it in the main chart', async ({ page }) => {
    await watchlistRow(page, 'TSLA').click();
    await expect(page.getByTestId('main-chart')).toHaveAttribute('data-ticker', 'TSLA', {
      timeout: 15_000,
    });
  });

  test('removing a held ticker keeps its position in the table', async ({ page, request }) => {
    // The headline regression from REVIEW.md, verified through the UI: the
    // position panel must not lose a holding just because it left the
    // watchlist, and it must keep being marked to market (PLAN §6, §8).
    await trade(request, 'NFLX', 'buy', 2);
    await page.reload();
    await waitForLivePrices(page);
    await expect(positionRow(page, 'NFLX')).toBeVisible({ timeout: 15_000 });

    await watchlistRow(page, 'NFLX').getByTestId('watchlist-remove').click();
    await expect(watchlistRow(page, 'NFLX')).toHaveCount(0, { timeout: 15_000 });

    const row = positionRow(page, 'NFLX');
    await expect(row, 'position must survive watchlist removal').toBeVisible();

    const priceCell = row.getByTestId('position-current-price');
    const first = (await priceCell.innerText()).replace(/[$,\s]/g, '');
    await expect
      .poll(async () => (await priceCell.innerText()).replace(/[$,\s]/g, ''), {
        timeout: 30_000,
        message: 'an unwatched holding must keep updating its mark',
      })
      .not.toBe(first);
  });

  test('invalid ticker input is rejected in the UI', async ({ page }) => {
    const before = await page.getByTestId('watchlist-row').count();
    await page.getByTestId('watchlist-add-input').fill('$$$');
    await page.getByTestId('watchlist-add-submit').click();
    // Whether the app validates client-side or surfaces the API's 400, the
    // outcome must be the same: no bogus row appears.
    await expect(page.getByTestId('watchlist-row')).toHaveCount(before);
  });
});
