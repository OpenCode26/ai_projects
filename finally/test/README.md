# FinAlly E2E tests

Playwright end-to-end suite covering the scenarios in `planning/PLAN.md` §12,
plus the regression cases called out in `planning/REVIEW.md`.

All runs use `LLM_MOCK=true` (deterministic rule-based chat responses, no
OpenRouter call) and the built-in market simulator (`MASSIVE_API_KEY` empty).

## Running

### Against a container

```bash
docker compose -f test/docker-compose.test.yml up --build \
  --abort-on-container-exit --exit-code-from playwright
```

The app container gets a `tmpfs` at `/app/db`, so every run starts from an
empty database and the fresh-start specs really do see seed state.

### Against a natively-run stack

For environments without Docker. Playwright builds the frontend and starts
uvicorn itself:

```bash
cd test
npm install && npx playwright install chromium
STACK=native npx playwright test
```

### Against an already-running app

```bash
cd test
BASE_URL=http://localhost:8000 npx playwright test
```

## Layout

| Path | Contents |
|---|---|
| `tests/01-api-contract.spec.ts` | REST contract, trade math, validation — no browser |
| `tests/02-sse-stream.spec.ts` | SSE event shape, price movement, tracked-set union, reconnection |
| `tests/00-fresh-start.spec.ts` | First launch: seed watchlist, $10k cash, streaming, flash animation |
| `tests/04-watchlist-ui.spec.ts` | Add/remove/select tickers, uppercase dedup, remove-while-holding |
| `tests/05-trading-ui.spec.ts` | Buy/sell through the trade bar, validation errors, fractional shares |
| `tests/06-portfolio-viz.spec.ts` | Heatmap tiles, P&L chart, main chart, positions table |
| `tests/07-chat.spec.ts` | `/api/chat` contract and the chat panel, against the mock matcher |
| `support/helpers.ts` | API wrappers, SSE reader, UI locators, account reset |
| `support/start-native.sh` | Builds the frontend and starts uvicorn for `STACK=native` |

Files are numbered because the suite runs single-worker and in order: the
fresh-start specs assert absolute seed values, so they need to see the database
before later specs trade against it. Every other spec restores the account in
`afterEach` rather than depending on what ran before it.

## Notes for other agents

- **Selectors are `data-testid`, never CSS classes or visible copy.** The full
  list the specs depend on is enumerated in `support/helpers.ts` and in the
  spec files themselves. Restyling or rewording the UI should never break a test;
  removing or renaming a testid will.
- **Canvas charts are asserted via attributes, not pixels.** Lightweight Charts
  renders to `<canvas>`, which Playwright cannot introspect, so the specs read
  `data-point-count`, `data-ticker`, and `data-pnl-direction` instead. Without
  those attributes the chart tests can only prove a container exists.
- **The 30s snapshot cadence is shortened for tests** via
  `FINALLY_SNAPSHOT_INTERVAL_SECONDS`, which is why the P&L chart specs finish
  in seconds rather than minutes.
