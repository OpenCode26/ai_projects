/**
 * SSE price stream contract and resilience (PLAN §6, §10, §12).
 */
import { test, expect } from '@playwright/test';
import {
  DEFAULT_WATCHLIST,
  addToWatchlist,
  collectSseEvents,
  removeFromWatchlist,
  resetAccount,
  trade,
} from '../support/helpers';

test.describe('SSE price stream', () => {
  test.afterEach(async ({ request }) => resetAccount(request));

  test('streams well-formed price events for watched tickers', async () => {
    const events = await collectSseEvents(20);
    expect(events.length, 'stream should emit price events').toBeGreaterThan(0);

    for (const evt of events) {
      // PLAN §6: each event carries ticker, price, previous price, timestamp,
      // and change direction.
      expect(evt).toHaveProperty('ticker');
      expect(evt).toHaveProperty('price');
      expect(Number(evt.price)).toBeGreaterThan(0);
      expect(evt).toHaveProperty('timestamp');
      const direction = evt.direction ?? evt.change_direction;
      expect(['up', 'down', 'flat', 'unchanged', null, undefined]).toContain(direction);
    }

    const streamed = new Set(events.map((e) => e.ticker));
    expect(
      [...streamed].some((t) => DEFAULT_WATCHLIST.includes(t as string)),
      'stream should cover default watchlist tickers',
    ).toBe(true);
  });

  test('prices actually move over successive events', async () => {
    // The simulator uses GBM at ~500ms, so a given ticker should not be frozen.
    const events = await collectSseEvents(200, 15_000);
    const byTicker = new Map<string, number[]>();
    for (const e of events) {
      const list = byTicker.get(e.ticker) ?? [];
      list.push(Number(e.price));
      byTicker.set(e.ticker, list);
    }
    const moved = [...byTicker.values()].filter(
      (prices) => prices.length > 1 && new Set(prices).size > 1,
    );
    expect(moved.length, 'at least one ticker should show a changing price').toBeGreaterThan(0);
  });

  test('a newly added ticker starts appearing on the stream', async ({ request }) => {
    await addToWatchlist(request, 'PYPL');
    await expect
      .poll(
        async () => {
          const events = await collectSseEvents(100, 10_000);
          return events.some((e) => e.ticker === 'PYPL');
        },
        { timeout: 30_000, message: 'PYPL should join the stream after being watched' },
      )
      .toBe(true);
  });

  test('tracked set is watchlist UNION open positions', async ({ request }) => {
    // PLAN §6 -- removing a held ticker from the watchlist must not stop it
    // being priced, because portfolio valuation still needs it.
    await trade(request, 'NFLX', 'buy', 1);
    await removeFromWatchlist(request, 'NFLX');

    await expect
      .poll(
        async () => {
          const events = await collectSseEvents(150, 10_000);
          return events.some((e) => e.ticker === 'NFLX');
        },
        {
          timeout: 30_000,
          message: 'a held-but-unwatched ticker must stay on the price stream',
        },
      )
      .toBe(true);
  });
});

test.describe('SSE resilience in the browser', () => {
  test('reconnects after the connection drops', async ({ page, context }) => {
    // Neither `context.route(...).abort()` nor `context.setOffline()` can
    // reliably sever an *already-open* SSE stream in Chromium: `route.abort()`
    // only intercepts requests made after it's registered, and Chromium's
    // network-condition emulation (offline/throttling) does not apply to
    // loopback traffic (127.0.0.1/localhost) -- confirmed empirically here,
    // `setOffline(true)` left an established connection to 127.0.0.1
    // reporting "connected" for the full 30s timeout.
    //
    // So instead of dropping a live connection, this blocks the *first*
    // connection attempt before navigation, forcing the app into a
    // disconnected state, then lifts the block and relies on EventSource's
    // built-in retry (`retry: 3000` from the server, PLAN §6) to recover --
    // the same reconnect code path a mid-stream drop would exercise.
    await context.route('**/api/stream/prices', (route) => route.abort());
    await page.goto('/');

    const status = page.getByTestId('connection-status');
    await expect(status).not.toHaveAttribute('data-status', 'connected', { timeout: 15_000 });

    await context.unroute('**/api/stream/prices');
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: 30_000 });
  });
});
