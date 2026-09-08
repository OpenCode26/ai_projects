/**
 * AI chat panel and /api/chat, running against LLM_MOCK=true (PLAN §9, §13.6,
 * §13.7, §12). The mock is a deterministic rule-based matcher, so these
 * assertions are stable without hitting OpenRouter.
 */
import { test, expect } from '@playwright/test';
import {
  chat,
  getPortfolio,
  getWatchlistTickers,
  positionRow,
  resetAccount,
  sendChat,
  trade,
  waitForLivePrices,
} from '../support/helpers';

test.describe('chat API', () => {
  test.afterEach(async ({ request }) => resetAccount(request));

  test('a conversational message returns a message and no actions', async ({ request }) => {
    const res = await chat(request, 'hello, what can you do?');
    expect(typeof res.message).toBe('string');
    expect(res.message.length).toBeGreaterThan(0);
    expect(res.trades ?? []).toHaveLength(0);
    expect(res.watchlist_changes ?? []).toHaveLength(0);

    // PLAN §13.6: portfolio/watchlist are omitted (or null) on a non-mutating turn.
    expect(res.portfolio ?? null).toBeNull();
    expect(res.watchlist ?? null).toBeNull();
  });

  test('a buy instruction executes the trade and returns fresh state', async ({ request }) => {
    const before = await getPortfolio(request);
    const res = await chat(request, 'buy 5 AAPL');

    expect(res.trades ?? [], 'mock should emit a trade for a buy instruction').toHaveLength(1);
    expect(res.trades![0].ticker).toBe('AAPL');
    expect(res.trades![0].side).toBe('buy');

    // PLAN §13.6: a mutating turn carries post-execution state inline so the
    // frontend never has to guess whether to re-fetch.
    expect(res.portfolio, 'mutating turn must include post-execution portfolio').toBeTruthy();
    expect(res.watchlist, 'mutating turn must include post-execution watchlist').toBeTruthy();
    expect(res.portfolio!.cash_balance).toBeLessThan(before.cash_balance);

    const inlinePos = res.portfolio!.positions.find((p) => p.ticker === 'AAPL');
    expect(inlinePos, 'inline portfolio should already reflect the trade').toBeTruthy();

    // The inline state must agree with a fresh read -- not a stale pre-trade copy.
    const fetched = await getPortfolio(request);
    expect(fetched.positions.find((p) => p.ticker === 'AAPL')!.quantity).toBeCloseTo(
      inlinePos!.quantity,
      6,
    );
  });

  test('a watchlist instruction adds the ticker', async ({ request }) => {
    const res = await chat(request, 'add PYPL to my watchlist');
    expect(res.watchlist_changes ?? []).toHaveLength(1);
    expect(res.watchlist_changes![0].ticker).toBe('PYPL');
    expect(res.watchlist_changes![0].action).toBe('add');
    expect(await getWatchlistTickers(request)).toContain('PYPL');
  });

  test('a remove instruction drops the ticker', async ({ request }) => {
    await chat(request, 'add PYPL to my watchlist');
    const res = await chat(request, 'remove PYPL from my watchlist');
    expect(res.watchlist_changes ?? []).toHaveLength(1);
    expect(res.watchlist_changes![0].action).toBe('remove');
    expect(await getWatchlistTickers(request)).not.toContain('PYPL');
  });

  test('a sell instruction executes against an existing position', async ({ request }) => {
    await trade(request, 'MSFT', 'buy', 4);
    const res = await chat(request, 'sell 2 MSFT');
    expect(res.trades ?? []).toHaveLength(1);
    expect(res.trades![0].side).toBe('sell');

    const pos = (await getPortfolio(request)).positions.find((p) => p.ticker === 'MSFT')!;
    expect(pos.quantity).toBeCloseTo(2, 6);
  });

  test('a trade that fails validation is reported, not silently dropped', async ({ request }) => {
    // PLAN §9 / §13.7: a failed trade's error must reach the chat response.
    const before = await getPortfolio(request);
    const res = await chat(request, 'buy 999999 AAPL');

    const serialized = JSON.stringify(res).toLowerCase();
    expect(
      /insufficient|not enough|cannot|unable|fail|error/.test(serialized),
      `failed trade should surface an error, got: ${JSON.stringify(res)}`,
    ).toBe(true);

    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(before.cash_balance, 2);
    expect(after.positions.find((p) => p.ticker === 'AAPL')).toBeUndefined();
  });

  test('conversation history persists', async ({ request }) => {
    // PLAN §9 step 7: messages are stored, so history survives a reload.
    const marker = `ping-${Date.now()}`;
    await chat(request, marker);

    const res = await request.get('/api/chat');
    if (res.status() === 200) {
      const body = await res.json();
      const rows = Array.isArray(body) ? body : (body.messages ?? []);
      expect(rows.some((m: any) => String(m.content).includes(marker))).toBe(true);
    } else {
      // No GET on /api/chat -- history is delivered some other way; the UI spec
      // below covers persistence from the user's point of view.
      test.info().annotations.push({ type: 'note', description: 'no GET /api/chat history endpoint' });
    }
  });

  test('rejects an empty message', async ({ request }) => {
    const res = await request.post('/api/chat', { data: { message: '' } });
    expect(res.status(), 'an empty message should not be accepted').toBeGreaterThanOrEqual(400);
  });
});

test.describe('chat UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForLivePrices(page);
  });
  test.afterEach(async ({ request }) => resetAccount(request));

  test('sending a message shows it and the assistant reply', async ({ page }) => {
    await sendChat(page, 'hello there');

    await expect(
      page.locator('[data-testid="chat-message"][data-role="user"]').last(),
    ).toContainText('hello there');
    await expect(
      page.locator('[data-testid="chat-message"][data-role="assistant"]').last(),
    ).not.toBeEmpty({ timeout: 30_000 });
  });

  test('a loading indicator appears while the response is in flight', async ({ page }) => {
    // Hold the response open so the indicator is observable rather than a race.
    await page.route('**/api/chat', async (route) => {
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });
    await sendChat(page, 'hello');
    await expect(page.getByTestId('chat-loading')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-loading')).toBeHidden({ timeout: 30_000 });
    await page.unroute('**/api/chat');
  });

  test('a chat-executed trade updates the portfolio panels inline', async ({ page }) => {
    // Conversation history persists server-side across tests in this file
    // (PLAN §9 step 7), so `chat-action` may already have earlier matches --
    // scope to the action just added, not the panel-wide locator.
    await sendChat(page, 'buy 5 AAPL');

    const lastAction = page
      .locator('[data-testid="chat-message"][data-role="assistant"]')
      .last()
      .getByTestId('chat-action');
    await expect(lastAction).toBeVisible({ timeout: 30_000 });
    await expect(lastAction).toContainText('AAPL');

    // The panels must reflect the trade without a manual reload (PLAN §13.6).
    await expect(positionRow(page, 'AAPL')).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('[data-testid="heatmap-tile"][data-ticker="AAPL"]'),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('a chat-driven watchlist change updates the watchlist panel inline', async ({ page }) => {
    await sendChat(page, 'add PYPL to my watchlist');
    await expect(
      page.locator('[data-testid="watchlist-row"][data-ticker="PYPL"]'),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('conversation survives a page reload', async ({ page }) => {
    const marker = `remember-${Date.now()}`;
    await sendChat(page, marker);
    await expect(
      page.locator('[data-testid="chat-message"][data-role="assistant"]').last(),
    ).not.toBeEmpty({ timeout: 30_000 });

    await page.reload();
    await waitForLivePrices(page);
    await expect(page.getByTestId('chat-panel')).toContainText(marker, { timeout: 20_000 });
  });
});
