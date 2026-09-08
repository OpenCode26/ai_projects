import { expect, type APIRequestContext, type Page, type Locator } from '@playwright/test';

export const DEFAULT_WATCHLIST = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'NFLX',
];

export const SEED_CASH = 10_000;

/** PLAN §13.8 — fractional-share comparisons tolerate float drift. */
export const QTY_EPSILON = 1e-6;

export interface Portfolio {
  cash_balance: number;
  total_value: number;
  positions: Array<{
    ticker: string;
    quantity: number;
    avg_cost: number;
    current_price?: number;
    unrealized_pnl?: number;
  }>;
}

export interface ChatResponse {
  message: string;
  trades?: Array<{ ticker: string; side: string; quantity: number }>;
  watchlist_changes?: Array<{ ticker: string; action: string }>;
  portfolio?: Portfolio | null;
  watchlist?: unknown;
  errors?: unknown;
}

/* ------------------------------------------------------------------ */
/* API helpers                                                         */
/* ------------------------------------------------------------------ */

export async function getPortfolio(request: APIRequestContext): Promise<Portfolio> {
  const res = await request.get('/api/portfolio');
  expect(res.status(), 'GET /api/portfolio should succeed').toBe(200);
  return res.json();
}

export async function getWatchlistTickers(request: APIRequestContext): Promise<string[]> {
  const res = await request.get('/api/watchlist');
  expect(res.status(), 'GET /api/watchlist should succeed').toBe(200);
  const body = await res.json();
  const rows = Array.isArray(body) ? body : (body.watchlist ?? body.tickers ?? []);
  return rows.map((r: any) => (typeof r === 'string' ? r : r.ticker));
}

export async function positionFor(request: APIRequestContext, ticker: string) {
  const portfolio = await getPortfolio(request);
  return portfolio.positions.find((p) => p.ticker === ticker.toUpperCase());
}

export async function trade(
  request: APIRequestContext,
  ticker: string,
  side: 'buy' | 'sell',
  quantity: number,
) {
  return request.post('/api/portfolio/trade', { data: { ticker, side, quantity } });
}

export async function addToWatchlist(request: APIRequestContext, ticker: string) {
  return request.post('/api/watchlist', { data: { ticker } });
}

export async function removeFromWatchlist(request: APIRequestContext, ticker: string) {
  return request.delete(`/api/watchlist/${ticker}`);
}

export async function chat(request: APIRequestContext, message: string): Promise<ChatResponse> {
  const res = await request.post('/api/chat', { data: { message }, timeout: 45_000 });
  expect(res.status(), `POST /api/chat "${message}" should succeed`).toBe(200);
  return res.json();
}

/**
 * Restore the account to a clean-ish state: flatten every position, then trim
 * the watchlist back to the ten seed tickers. Specs mutate shared single-user
 * state, so each one tidies up after itself rather than relying on run order.
 */
export async function resetAccount(request: APIRequestContext) {
  const portfolio = await getPortfolio(request);
  for (const pos of portfolio.positions) {
    if (pos.quantity > QTY_EPSILON) {
      await trade(request, pos.ticker, 'sell', pos.quantity);
    }
  }
  const tickers = await getWatchlistTickers(request);
  for (const t of tickers) {
    if (!DEFAULT_WATCHLIST.includes(t)) await removeFromWatchlist(request, t);
  }
  for (const t of DEFAULT_WATCHLIST) {
    if (!tickers.includes(t)) await addToWatchlist(request, t);
  }
}

/** Read the price the server would fill at, via the watchlist's latest prices. */
export async function currentPrice(request: APIRequestContext, ticker: string): Promise<number> {
  const res = await request.get('/api/watchlist');
  const body = await res.json();
  const rows = Array.isArray(body) ? body : (body.watchlist ?? []);
  const row = rows.find((r: any) => r.ticker === ticker.toUpperCase());
  expect(row, `${ticker} should be on the watchlist with a price`).toBeTruthy();
  return Number(row.price ?? row.current_price);
}

/**
 * Consume the SSE stream directly (no browser) until `count` price events
 * arrive or the deadline passes, then disconnect.
 *
 * Uses Node's fetch rather than Playwright's APIRequestContext: the stream
 * never ends on its own, so it has to be read incrementally and aborted --
 * `response.body()` would just block until the request timeout fires.
 */
export async function collectSseEvents(
  count: number,
  timeoutMs = 20_000,
): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const events: any[] = [];

  try {
    const res = await fetch(`${baseUrl()}/api/stream/prices`, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
    expect(res.status, 'SSE stream should return 200').toBe(200);
    expect(
      res.headers.get('content-type') ?? '',
      'SSE stream must be text/event-stream',
    ).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (events.length < count) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Keep the trailing partial frame in the buffer.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      events.push(...parseSseFrames(frames.join('\n\n')));
    }
    await reader.cancel().catch(() => {});
  } catch (err: any) {
    // An abort just means we hit the deadline -- return whatever arrived.
    if (err?.name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
  }

  return events.slice(0, count);
}

export function baseUrl(): string {
  return process.env.BASE_URL ?? 'http://localhost:8000';
}

export function parseSseFrames(raw: string): any[] {
  const events: any[] = [];
  for (const frame of raw.split('\n\n')) {
    const dataLines = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) continue;
    try {
      events.push(JSON.parse(dataLines.join('\n')));
    } catch {
      /* keepalive comments and partial frames are expected; skip them */
    }
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

/** Pull the first number out of an element's text, ignoring $ , % and spaces. */
export async function numberFrom(locator: Locator): Promise<number> {
  const text = (await locator.innerText()).replace(/[$,\s]/g, '');
  const match = text.match(/-?\d+(\.\d+)?/);
  expect(match, `expected a number in "${text}"`).toBeTruthy();
  return Number(match![0]);
}

export function watchlistRow(page: Page, ticker: string): Locator {
  return page.locator(`[data-testid="watchlist-row"][data-ticker="${ticker.toUpperCase()}"]`);
}

export function positionRow(page: Page, ticker: string): Locator {
  return page.locator(`[data-testid="position-row"][data-ticker="${ticker.toUpperCase()}"]`);
}

/** Wait until the app has an open SSE stream and has painted at least one price. */
export async function waitForLivePrices(page: Page) {
  await expect(page.getByTestId('connection-status')).toHaveAttribute(
    'data-status',
    'connected',
    { timeout: 30_000 },
  );
  await expect
    .poll(async () => {
      const prices = page.getByTestId('watchlist-price');
      if ((await prices.count()) === 0) return 0;
      return numberFrom(prices.first());
    }, { timeout: 30_000, message: 'watchlist should show a non-zero streamed price' })
    .toBeGreaterThan(0);
}

/** Wait for a watchlist price to actually tick, proving the stream is live. */
export async function waitForPriceChange(page: Page, ticker: string, timeoutMs = 30_000) {
  const priceEl = watchlistRow(page, ticker).getByTestId('watchlist-price');
  const initial = await numberFrom(priceEl);
  await expect
    .poll(() => numberFrom(priceEl), {
      timeout: timeoutMs,
      message: `${ticker} price should change as the simulator ticks`,
    })
    .not.toBe(initial);
}

export async function submitTrade(
  page: Page,
  ticker: string,
  quantity: number,
  side: 'buy' | 'sell',
) {
  await page.getByTestId('trade-ticker').fill(ticker);
  await page.getByTestId('trade-quantity').fill(String(quantity));
  await page.getByTestId(side === 'buy' ? 'trade-buy' : 'trade-sell').click();
}

export async function sendChat(page: Page, message: string) {
  await page.getByTestId('chat-input').fill(message);
  await page.getByTestId('chat-send').click();
}
