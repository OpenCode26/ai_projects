/**
 * API-level contract tests (PLAN §8, §13).
 *
 * These run without a browser, so they give useful signal before the frontend
 * export exists, and they pin the exact request/response shapes every other
 * spec (and the frontend) depends on.
 */
import { test, expect } from '@playwright/test';
import {
  DEFAULT_WATCHLIST,
  addToWatchlist,
  currentPrice,
  getPortfolio,
  getWatchlistTickers,
  removeFromWatchlist,
  resetAccount,
  trade,
} from '../support/helpers';

test.describe('system', () => {
  test('health endpoint responds', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
  });

  test('lazy DB init seeds profile and watchlist on first request', async ({ request }) => {
    // PLAN §7: no migration step -- the first request bootstraps schema + seed
    // data. If this passes on a fresh db file, lazy init works.
    const tickers = await getWatchlistTickers(request);
    for (const t of DEFAULT_WATCHLIST) {
      expect(tickers, `${t} should be seeded onto the watchlist`).toContain(t);
    }
    const portfolio = await getPortfolio(request);
    expect(portfolio.cash_balance).toBeGreaterThan(0);
  });

  test('portfolio history has at least the seed snapshot', async ({ request }) => {
    // PLAN §7: one snapshot row is written at seed time so the P&L chart is
    // never empty on a fresh start.
    const res = await request.get('/api/portfolio/history');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body.snapshots ?? body.history ?? []);
    expect(rows.length).toBeGreaterThan(0);
    expect(Number(rows[0].total_value)).toBeGreaterThan(0);
  });
});

test.describe('watchlist', () => {
  test.afterEach(async ({ request }) => resetAccount(request));

  test('add and remove a ticker', async ({ request }) => {
    const add = await addToWatchlist(request, 'PYPL');
    expect(add.status(), 'adding a new ticker should succeed').toBeLessThan(300);
    expect(await getWatchlistTickers(request)).toContain('PYPL');

    const remove = await removeFromWatchlist(request, 'PYPL');
    expect(remove.status()).toBeLessThan(300);
    expect(await getWatchlistTickers(request)).not.toContain('PYPL');
  });

  test('lowercase ticker is normalized, not duplicated', async ({ request }) => {
    // PLAN §7 + REVIEW.md: "aapl" and "AAPL" are the same ticker and must not
    // create a second row past UNIQUE(user_id, ticker).
    const before = await getWatchlistTickers(request);
    expect(before).toContain('AAPL');

    const res = await addToWatchlist(request, 'aapl');
    expect(
      res.status(),
      'duplicate add must not blow up on the unique constraint',
    ).toBeLessThan(500);

    const after = await getWatchlistTickers(request);
    expect(after.filter((t) => t.toUpperCase() === 'AAPL')).toHaveLength(1);
    expect(after).not.toContain('aapl');
    expect(after.length).toBe(before.length);
  });

  test('lowercase add of a new ticker stores the uppercase form', async ({ request }) => {
    await addToWatchlist(request, 'pypl');
    const tickers = await getWatchlistTickers(request);
    expect(tickers).toContain('PYPL');
    expect(tickers).not.toContain('pypl');
  });

  test('lowercase delete removes the uppercase row', async ({ request }) => {
    await addToWatchlist(request, 'PYPL');
    const res = await removeFromWatchlist(request, 'pypl');
    expect(res.status()).toBeLessThan(300);
    expect(await getWatchlistTickers(request)).not.toContain('PYPL');
  });

  test.describe('ticker validation (PLAN §13.4)', () => {
    for (const bad of ['$$$', 'TOOLONGTICKER', '', '12345678', 'AA PL', 'A@PL']) {
      test(`rejects ${JSON.stringify(bad)} with 400`, async ({ request }) => {
        const res = await addToWatchlist(request, bad);
        expect(
          res.status(),
          'non-conforming tickers must be rejected at the API boundary',
        ).toBe(400);
      });
    }

    test('accepts an arbitrary 1-5 char alphanumeric ticker', async ({ request }) => {
      // The universe is open, not a closed enum -- the simulator synthesizes a
      // deterministic seed price for unseen tickers.
      const res = await addToWatchlist(request, 'ZZZ9');
      expect(res.status()).toBeLessThan(300);
      expect(await getWatchlistTickers(request)).toContain('ZZZ9');

      const price = await currentPrice(request, 'ZZZ9');
      expect(price, 'synthesized seed price should land in $10-$500').toBeGreaterThanOrEqual(10);
      expect(price).toBeLessThanOrEqual(500 * 1.5);
    });
  });
});

test.describe('trading', () => {
  test.afterEach(async ({ request }) => resetAccount(request));

  test('buy reduces cash and creates a position', async ({ request }) => {
    const before = await getPortfolio(request);
    const res = await trade(request, 'AAPL', 'buy', 5);
    expect(res.status(), await res.text()).toBe(200);

    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeLessThan(before.cash_balance);

    const pos = after.positions.find((p) => p.ticker === 'AAPL');
    expect(pos, 'a position row should exist after buying').toBeTruthy();
    expect(pos!.quantity).toBeCloseTo(5, 6);
    expect(pos!.avg_cost).toBeGreaterThan(0);

    // Cash spent should match quantity * fill price -- no fees (PLAN §2).
    const spent = before.cash_balance - after.cash_balance;
    expect(spent).toBeCloseTo(pos!.quantity * pos!.avg_cost, 2);
  });

  test('selling part of a position leaves avg_cost unchanged', async ({ request }) => {
    // PLAN §7: sells only reduce quantity; they never touch the cost basis.
    await trade(request, 'MSFT', 'buy', 4);
    const afterBuy = await getPortfolio(request);
    const bought = afterBuy.positions.find((p) => p.ticker === 'MSFT')!;

    await trade(request, 'MSFT', 'sell', 1);
    const afterSell = await getPortfolio(request);
    const held = afterSell.positions.find((p) => p.ticker === 'MSFT')!;

    expect(held.quantity).toBeCloseTo(3, 6);
    expect(held.avg_cost).toBeCloseTo(bought.avg_cost, 6);
    expect(afterSell.cash_balance).toBeGreaterThan(afterBuy.cash_balance);
  });

  test('selling the full position removes the row', async ({ request }) => {
    await trade(request, 'NVDA', 'buy', 2);
    await trade(request, 'NVDA', 'sell', 2);
    const portfolio = await getPortfolio(request);
    expect(portfolio.positions.find((p) => p.ticker === 'NVDA')).toBeUndefined();
  });

  test('weighted average cost is recomputed across two buys', async ({ request }) => {
    // PLAN §7: avg_cost = (old_qty*old_avg + buy_qty*price) / (old_qty+buy_qty)
    await trade(request, 'META', 'buy', 1);
    const first = (await getPortfolio(request)).positions.find((p) => p.ticker === 'META')!;
    const firstCost = first.quantity * first.avg_cost;

    const cashBefore = (await getPortfolio(request)).cash_balance;
    await trade(request, 'META', 'buy', 3);
    const cashAfter = (await getPortfolio(request)).cash_balance;
    const secondCost = cashBefore - cashAfter;

    const merged = (await getPortfolio(request)).positions.find((p) => p.ticker === 'META')!;
    expect(merged.quantity).toBeCloseTo(4, 6);
    expect(merged.avg_cost).toBeCloseTo((firstCost + secondCost) / 4, 2);
  });

  test('fractional shares are supported end to end', async ({ request }) => {
    await trade(request, 'GOOGL', 'buy', 0.25);
    const pos = (await getPortfolio(request)).positions.find((p) => p.ticker === 'GOOGL');
    expect(pos!.quantity).toBeCloseTo(0.25, 6);

    const res = await trade(request, 'GOOGL', 'sell', 0.25);
    expect(res.status()).toBe(200);
    expect((await getPortfolio(request)).positions.find((p) => p.ticker === 'GOOGL')).toBeUndefined();
  });

  test('repeated fractional trades still allow selling the full position', async ({ request }) => {
    // PLAN §13.8: float drift must not make "sell everything I hold" fail an
    // insufficient-shares check by ~1e-13.
    for (let i = 0; i < 6; i++) await trade(request, 'TSLA', 'buy', 0.1);
    const pos = (await getPortfolio(request)).positions.find((p) => p.ticker === 'TSLA')!;

    const res = await trade(request, 'TSLA', 'sell', pos.quantity);
    expect(res.status(), await res.text()).toBe(200);
    expect((await getPortfolio(request)).positions.find((p) => p.ticker === 'TSLA')).toBeUndefined();
  });

  test('buy with insufficient cash returns 400 with an error message', async ({ request }) => {
    const res = await trade(request, 'AAPL', 'buy', 1_000_000);
    expect(res.status()).toBe(400);
    const body = await res.json();
    // PLAN §8 pins this as {"error": "..."} -- not FastAPI's default {"detail": ...}.
    expect(body).toHaveProperty('error');
    expect(String(body.error)).not.toHaveLength(0);

    // The failed buy must not have moved anything.
    const portfolio = await getPortfolio(request);
    expect(portfolio.positions.find((p) => p.ticker === 'AAPL')).toBeUndefined();
  });

  test('sell more than owned returns 400 and leaves the position intact', async ({ request }) => {
    await trade(request, 'JPM', 'buy', 2);
    const res = await trade(request, 'JPM', 'sell', 10);
    expect(res.status()).toBe(400);
    expect(await res.json()).toHaveProperty('error');

    const pos = (await getPortfolio(request)).positions.find((p) => p.ticker === 'JPM')!;
    expect(pos.quantity).toBeCloseTo(2, 6);
  });

  test('selling a ticker with no position returns 400', async ({ request }) => {
    const res = await trade(request, 'NFLX', 'sell', 1);
    expect(res.status()).toBe(400);
    expect(await res.json()).toHaveProperty('error');
  });

  test('non-positive quantities are rejected', async ({ request }) => {
    for (const qty of [0, -5]) {
      const res = await trade(request, 'AAPL', 'buy', qty);
      expect(res.status(), `quantity ${qty} should be rejected`).toBe(400);
    }
  });

  test('total value equals cash plus marked-to-market positions', async ({ request }) => {
    await trade(request, 'AMZN', 'buy', 3);
    const p = await getPortfolio(request);
    const positionsValue = p.positions.reduce(
      (sum, pos) => sum + pos.quantity * Number(pos.current_price ?? 0),
      0,
    );
    // Prices tick every ~500ms, so allow drift between the two reads.
    expect(p.total_value).toBeGreaterThan(0);
    expect(Math.abs(p.total_value - (p.cash_balance + positionsValue))).toBeLessThan(
      Math.max(1, positionsValue * 0.05),
    );
  });

  test('trades are recorded in the trade log', async ({ request }) => {
    // PLAN §13.5: GET /api/trades, most recent first.
    await trade(request, 'V', 'buy', 1);
    const res = await request.get('/api/trades');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body.trades ?? []);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].ticker).toBe('V');
    expect(rows[0].side).toBe('buy');
  });
});

test.describe('watchlist removal while holding a position', () => {
  // REVIEW.md calls this out as the single most easy-to-regress behaviour in
  // the spec: tracked tickers are watchlist UNION open positions (PLAN §6), so
  // dropping a held ticker from the watchlist must not stop pricing it.
  test.afterEach(async ({ request }) => resetAccount(request));

  test('position survives, stays priced, and keeps contributing to total value', async ({
    request,
  }) => {
    await trade(request, 'NFLX', 'buy', 2);
    const beforeRemove = await getPortfolio(request);
    const posBefore = beforeRemove.positions.find((p) => p.ticker === 'NFLX')!;
    expect(posBefore.quantity).toBeCloseTo(2, 6);

    const res = await removeFromWatchlist(request, 'NFLX');
    expect(res.status()).toBeLessThan(300);
    expect(await getWatchlistTickers(request)).not.toContain('NFLX');

    const afterRemove = await getPortfolio(request);
    const posAfter = afterRemove.positions.find((p) => p.ticker === 'NFLX');
    expect(posAfter, 'removing from the watchlist must not delete the position').toBeTruthy();
    expect(posAfter!.quantity).toBeCloseTo(2, 6);
    expect(
      Number(posAfter!.current_price),
      'a held-but-unwatched ticker must still be priced',
    ).toBeGreaterThan(0);
    expect(afterRemove.total_value).toBeGreaterThan(afterRemove.cash_balance);
  });

  test('an unwatched held ticker keeps ticking on the SSE stream', async ({ request }) => {
    await trade(request, 'NFLX', 'buy', 1);
    await removeFromWatchlist(request, 'NFLX');

    const first = Number(
      (await getPortfolio(request)).positions.find((p) => p.ticker === 'NFLX')!.current_price,
    );
    await expect
      .poll(
        async () =>
          Number(
            (await getPortfolio(request)).positions.find((p) => p.ticker === 'NFLX')!
              .current_price,
          ),
        { timeout: 20_000, message: 'unwatched held ticker should keep receiving price updates' },
      )
      .not.toBe(first);
  });

  test('the ticker can still be sold after leaving the watchlist', async ({ request }) => {
    await trade(request, 'NFLX', 'buy', 1);
    await removeFromWatchlist(request, 'NFLX');
    const res = await trade(request, 'NFLX', 'sell', 1);
    expect(res.status(), await res.text()).toBe(200);
    expect((await getPortfolio(request)).positions.find((p) => p.ticker === 'NFLX')).toBeUndefined();
  });
});
