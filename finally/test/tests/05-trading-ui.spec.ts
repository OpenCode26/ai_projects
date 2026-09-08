/**
 * Trading through the trade bar (PLAN §2, §10, §12).
 */
import { test, expect } from '@playwright/test';
import {
  numberFrom,
  positionRow,
  resetAccount,
  submitTrade,
  trade,
  waitForLivePrices,
} from '../support/helpers';

test.describe('trading UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForLivePrices(page);
  });
  test.afterEach(async ({ request }) => resetAccount(request));

  test('buying shares decreases cash and creates a position row', async ({ page }) => {
    const cashBefore = await numberFrom(page.getByTestId('cash-balance'));

    await submitTrade(page, 'AAPL', 5, 'buy');

    const row = positionRow(page, 'AAPL');
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await numberFrom(row.getByTestId('position-quantity'))).toBeCloseTo(5, 4);

    await expect
      .poll(() => numberFrom(page.getByTestId('cash-balance')), {
        timeout: 15_000,
        message: 'cash should drop after a buy',
      })
      .toBeLessThan(cashBefore);

    expect(await numberFrom(row.getByTestId('position-avg-cost'))).toBeGreaterThan(0);
  });

  test('selling shares increases cash and reduces the position', async ({ page, request }) => {
    await trade(request, 'MSFT', 'buy', 4);
    await page.reload();
    await waitForLivePrices(page);

    const cashBefore = await numberFrom(page.getByTestId('cash-balance'));
    await submitTrade(page, 'MSFT', 1, 'sell');

    await expect
      .poll(() => numberFrom(positionRow(page, 'MSFT').getByTestId('position-quantity')), {
        timeout: 15_000,
        message: 'quantity should fall after a sell',
      })
      .toBeCloseTo(3, 4);

    await expect
      .poll(() => numberFrom(page.getByTestId('cash-balance')), {
        timeout: 15_000,
        message: 'cash should rise after a sell',
      })
      .toBeGreaterThan(cashBefore);
  });

  test('selling the whole position removes the row', async ({ page, request }) => {
    await trade(request, 'NVDA', 'buy', 2);
    await page.reload();
    await waitForLivePrices(page);
    await expect(positionRow(page, 'NVDA')).toBeVisible();

    await submitTrade(page, 'NVDA', 2, 'sell');
    await expect(positionRow(page, 'NVDA')).toHaveCount(0, { timeout: 15_000 });
  });

  test('buying more than the cash balance surfaces an error and changes nothing', async ({
    page,
  }) => {
    const cashBefore = await numberFrom(page.getByTestId('cash-balance'));

    await submitTrade(page, 'AAPL', 999_999, 'buy');

    await expect(page.getByTestId('trade-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('trade-error')).not.toBeEmpty();
    await expect(positionRow(page, 'AAPL')).toHaveCount(0);
    expect(await numberFrom(page.getByTestId('cash-balance'))).toBeCloseTo(cashBefore, 2);
  });

  test('selling shares you do not own surfaces an error', async ({ page }) => {
    await submitTrade(page, 'NFLX', 3, 'sell');
    await expect(page.getByTestId('trade-error')).toBeVisible({ timeout: 15_000 });
    await expect(positionRow(page, 'NFLX')).toHaveCount(0);
  });

  test('fractional quantities are accepted', async ({ page }) => {
    await submitTrade(page, 'GOOGL', 0.5, 'buy');
    const row = positionRow(page, 'GOOGL');
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await numberFrom(row.getByTestId('position-quantity'))).toBeCloseTo(0.5, 4);
  });

  test('lowercase ticker in the trade bar hits the same position', async ({ page, request }) => {
    await trade(request, 'AMZN', 'buy', 1);
    await page.reload();
    await waitForLivePrices(page);

    await submitTrade(page, 'amzn', 1, 'buy');
    await expect
      .poll(() => numberFrom(positionRow(page, 'AMZN').getByTestId('position-quantity')), {
        timeout: 15_000,
        message: 'lowercase input must merge into the existing AMZN position',
      })
      .toBeCloseTo(2, 4);
    await expect(page.getByTestId('position-row')).toHaveCount(1);
  });

  test('unrealized P&L is displayed and tracks the live mark', async ({ page, request }) => {
    await trade(request, 'TSLA', 'buy', 3);
    await page.reload();
    await waitForLivePrices(page);

    const pnl = positionRow(page, 'TSLA').getByTestId('position-pnl');
    await expect(pnl).toBeVisible();
    const first = await pnl.innerText();
    await expect
      .poll(() => pnl.innerText(), {
        timeout: 30_000,
        message: 'P&L should move as the mark moves',
      })
      .not.toBe(first);
  });

  test('total value reflects cash plus positions after a trade', async ({ page }) => {
    await submitTrade(page, 'JPM', 2, 'buy');
    await expect(positionRow(page, 'JPM')).toBeVisible({ timeout: 15_000 });

    // Buying converts cash into an equally-valued position, so total value is
    // essentially unchanged (no fees, instant fill at the current price).
    await expect
      .poll(() => numberFrom(page.getByTestId('total-value')), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const cash = await numberFrom(page.getByTestId('cash-balance'));
    const total = await numberFrom(page.getByTestId('total-value'));
    expect(total).toBeGreaterThan(cash);
  });
});
