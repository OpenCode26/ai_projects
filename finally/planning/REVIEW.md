# PLAN.md Review

Reviewed: `planning/PLAN.md` (current state: `backend/` empty, no `frontend/` yet — pre-implementation)
Reviewer focus: internal consistency, completeness/ambiguity, architectural feasibility, technical correctness, testing adequacy, production-readiness gaps.

---

## Strengths

- **Coherent single-container architecture.** SSE + static Next.js export + FastAPI on one port is a sound, low-complexity choice for a single-user local app, and the "Why These Choices" table gives honest, defensible rationale rather than hand-waving.
- **Schema is well thought out.** The `avg_cost` weighted-average formula (§7) is textbook-correct, the sell-never-changes-avg_cost / realized-P&L-computed-on-the-fly rule is a sensible simplification, and the `UNIQUE(user_id, ticker)` + uppercase-normalization rule closes an obvious dedup bug before it happens.
- **Server determines trade execution price.** The trade endpoint body is `{ticker, quantity, side}` — no client-supplied price — so the client cannot manipulate fill price. This is called out implicitly rather than explicitly, but it's the right design and worth keeping.
- **Tracked-ticker union rule (§6)** — watchlist ∪ open positions — is a genuinely good catch that prevents a real bug (losing pricing for a held position after removing it from the watchlist), and it's consistently cross-referenced from §8's DELETE endpoint.
- **LLM failure handling has a real fallback path** (retry once, then canned message) rather than assuming the structured-output call always succeeds.
- **Mock LLM mode is specified precisely enough to be testable** — the rule-based matcher description (§9) gives E2E tests a stable, assertable contract instead of "some mock."
- **Clear separation of concerns** between frontend/backend/planning with explicit "Key Boundaries" — reduces the chance of two agents stepping on each other's territory.

---

## Issues / Risks (ranked by severity)

### Critical

**1. No stated process/worker model for the in-memory price cache + SSE background task.**
§6 says "a single background task ... writes to an in-memory price cache" and SSE reads from it. §11's Dockerfile just says `CMD: uvicorn serving FastAPI app` with no worker count. If the container (or a well-meaning agent optimizing for throughput) runs uvicorn with `--workers > 1`, each worker process gets its **own** in-memory cache and its **own** background market-data task — clients connecting to different workers would see different, possibly stale or empty, price streams, and portfolio valuation would become nondeterministic depending on which worker handled which request. This needs an explicit statement: **single worker/process only**, and ideally a one-line justification (single local user, no need for horizontal scaling) so a future agent doesn't "fix" it by adding workers.

### High

**2. Docker persistence mechanism is internally contradictory (§4 vs §11).**
- §4: "`db/` at the top level is the runtime volume mount point... The SQLite file (`db/finally.db`) is created here... and persists across container restarts via Docker volume," and explicitly reiterated in §11: "The `db/` directory in the project root maps to `/app/db`... The backend writes `finally.db` to this path."
- But the §11 example command is `docker run -v finally-data:/app/db ...` — a **named Docker volume**, which is managed by Docker under `/var/lib/docker/volumes/...` and is **not** the same as a host bind mount of `./db`. With a named volume, `db/finally.db` does not appear in the project directory at all, contradicting §4's description (and the `.gitkeep`-with-gitignored-`finally.db` framing in the directory tree, which only makes sense for a bind mount).
- This is exactly the kind of thing `scripts/start_mac.sh` needs a single unambiguous answer for. Pick one (bind mount `-v "$(pwd)/db:/app/db"` is what the rest of the doc implies) and make both sections agree.

**3. No stated strategy for non-blocking SQLite access in an async server.**
The backend is FastAPI/uvicorn running an event loop that also drives the SSE push loop (~500ms cadence) and a 30s snapshot background task, while simultaneously handling trade/chat requests that hit SQLite. Standard `sqlite3` is synchronous; calling it directly from async route handlers will block the event loop and can visibly stutter the SSE stream during a write (e.g., a chat-triggered trade). The plan should state whether the backend uses `aiosqlite`, runs sqlite calls via `run_in_executor`/threadpool, uses WAL mode, or otherwise — this is a foundational decision, not an implementation detail an agent should have to invent silently under time pressure.

**4. No ticker-universe / validation story, but the feature set depends on one.**
The simulator "starts from realistic seed prices (e.g., AAPL ~$190, GOOGL ~$175, etc.)" for what reads like a fixed, small set of names, yet:
- The LLM structured-output example (§9) shows `{"ticker": "PYPL", "action": "add"}` — a ticker not in the seed list.
- Users can `POST /api/watchlist` or ask the LLM to add/trade *any* string.
- There's no stated behavior for what price a newly-added, previously-unseeded ticker gets in simulator mode, nor any validation that a ticker is a "real" or supported symbol before it's accepted into `watchlist`/`positions`/`trades`.
Without this, a Market Data agent and a Backend agent will each guess independently and likely disagree (e.g., one assumes a closed universe of ~15 names, the other assumes anything goes with a randomly generated seed price). This should be resolved explicitly: either (a) a fixed, enumerable ticker universe with seed prices for all of them, with adds/trades outside it rejected with a clear error, or (b) a rule for synthesizing a plausible seed price for arbitrary tickers.

### Medium

**5. `trades` table has no read path.** The schema keeps a full append-only trade log "for trade history," but there is no `GET /api/trades` (or similar) endpoint in §8, and no trade-history UI element in §10's layout list (only a positions table showing current holdings, not historical fills). Either drop the implication that trade history is user-facing, or add the endpoint + a UI panel — right now the data model promises something the API/frontend spec never delivers.

**6. `/api/chat` request/response shapes are under-specified relative to other endpoints.** §8's other POST endpoints show explicit request bodies (`{ticker, quantity, side}`, `{ticker}`); chat's body isn't shown at all (presumably `{message: str}`, but say so). More importantly: when the LLM auto-executes trades/watchlist changes, does the `/api/chat` response include the resulting portfolio/watchlist state, or must the frontend separately re-fetch `/api/portfolio` and `/api/watchlist` after any response containing non-empty `trades`/`watchlist_changes`? A Frontend agent will have to guess one of these; state it explicitly.

**7. Multi-trade execution order/semantics unspecified.** If the LLM returns two trades in one response (e.g., "sell some AAPL and use it to buy TSLA"), are they executed sequentially against the mutating cash balance (so trade 2 can be funded by trade 1's proceeds), or evaluated against a single portfolio snapshot taken before either executes? The cost-basis/validation rules in §7 assume sequential single-trade semantics; §9 doesn't say whether that extends to a batch from one chat turn.

**8. No pagination/bounding on growth-prone data.**
- `portfolio_snapshots` is written every 30s indefinitely with no stated retention/downsampling and `GET /api/portfolio/history` has no range/limit parameters — fine for a demo session, but will return an ever-growing payload over a multi-day-open session.
- Client-side price history for sparklines/main chart is "accumulated on the frontend from the SSE stream since page load" (§2, §10) with no stated cap. At ~500ms cadence that's ~7,200 points/hour/ticker × up to 10+ tickers held in browser memory/state indefinitely — worth an explicit rolling-window (e.g., keep last N points) to avoid unbounded memory growth in a long-running tab.

**9. Fractional-share float precision isn't addressed.** `quantity`/`avg_cost` are SQLite `REAL`. Repeated buys/sells of fractional shares can accumulate floating-point drift (e.g., a position that should be exactly 0 sits at `1e-13`, or a "sell all" request for `0.30000000000000004` shares fails an exact `>` comparison against stored quantity). The plan should call for an epsilon-tolerant comparison when validating "insufficient shares" and when deciding a position row should be deleted.

**10. LLM failure handling in §9 step 5 only covers parse failures, not request failures.** "If parsing fails, retry once, then fall back" doesn't say what happens on an HTTP error/timeout/rate-limit from OpenRouter itself (a very real occurrence for a live external call). The same retry-then-fallback shape should explicitly cover network/HTTP failures, not just malformed JSON.

### Low

**11. SSE + multiple browser tabs under HTTP/1.1.** Browsers cap concurrent connections per origin at 6 under HTTP/1.1 (uvicorn's default, not HTTP/2). Each open tab holds one long-lived SSE connection open indefinitely; a user with several tabs open could exhaust the connection pool and see ordinary `fetch()` calls (trades, chat) stall behind the SSE streams. Low likelihood for a single-user local demo, but worth a one-line acknowledgment or a note to serve over HTTP/2 if this becomes visible.

**12. Relationship between the main chart and the watchlist sparklines is implied, not stated.** §2/§10 are explicit that sparklines accumulate "since page load." Is the main per-ticker chart the same client-side accumulation buffer (meaning switching to a ticker just added mid-session shows a short/empty chart), or does it work differently? Also unclear whether a ticker's buffer keeps accumulating in the background while a different ticker is selected, or only while it's the active selection.

**13. No aggregate realized P&L anywhere.** Realized P&L per sell is "computed on the fly rather than stored" (§7) — fine — but nothing in §8/§10 surfaces a running total of realized gains/losses across all trades, even though the header/positions table surface unrealized P&L prominently. Possibly intentional (out of scope), but worth a deliberate decision rather than an omission.

**14. Color spec is incomplete for a project whose vision leans heavily on visual polish.** §2 gives exact hex for background and three accent colors, but not for the green/red used in price-flash animations, sparkline direction, and heatmap P&L coloring — the single most visually prominent recurring element in the app. Worth pinning down alongside the existing palette so a Frontend agent doesn't pick clashing greens/reds.

**15. Two directories named `db/` with different purposes** (`backend/db/` = schema/seed *code*; top-level `db/` = runtime *data* volume). The Key Boundaries text does disambiguate this, but the identical naming is an easy source of confusion worth a stronger visual distinction (e.g., renaming one, or bolding the distinction more prominently) rather than relying on prose alone.

**16. "Massive (Polygon.io) API"** — it's not clear from the plan alone whether "Massive" is a wrapper/rebrand of Polygon.io or a distinct product with its own auth scheme and base URL. Since this is a stretch goal it's not blocking, but the Market Data agent will need an actual link/reference to build against.

---

## Open Questions / Clarifications Needed

1. What worker/process count is uvicorn expected to run with in production, and should this be pinned explicitly (e.g., `--workers 1`) given the in-memory price cache? *(ties to Critical #1)*
2. Bind mount vs. named Docker volume for `db/` — which is authoritative, §4 or §11's example command? *(ties to High #2)*
3. What SQLite access pattern is expected (`aiosqlite`, threadpool executor, WAL mode, or something else)? *(ties to High #3)*
4. Is there a fixed/enumerable ticker universe for the simulator, or can arbitrary tickers be added via watchlist/chat? If arbitrary, how is an initial seed price synthesized for a ticker the simulator has never seen? Is there any format validation (e.g., reject `"$$$"` or 200-character strings) before a ticker reaches `watchlist`/`positions`/`trades`? *(ties to High #4)*
5. Should trade history be retrievable via API and shown in the UI, given the `trades` table is explicitly an append-only log? If not, why keep the full log rather than just the fields needed to recompute state? *(ties to Medium #5)*
6. Does the `/api/chat` response include updated portfolio/watchlist state when it auto-executes actions, or does the frontend always re-fetch `/api/portfolio` and `/api/watchlist` afterward? What is the exact request body shape for `POST /api/chat`? *(ties to Medium #6)*
7. When an LLM response contains multiple trades, are they applied sequentially with intermediate cash-balance updates (so a sell can fund a following buy in the same turn), or against a single pre-turn snapshot? Same question for ordering between `trades` and `watchlist_changes` when both are present. *(ties to Medium #7)*
8. Should `GET /api/portfolio/history` support a time range or limit, or is "return everything" acceptable for the project's expected session lengths? Is any pruning/downsampling of `portfolio_snapshots` expected over long-running deployments? *(ties to Medium #8)*
9. Does the client cap how much price history it buffers per ticker for sparklines/main chart, or is unbounded accumulation for the life of the tab acceptable? *(ties to Medium #8)*
10. What tolerance (if any) should trade validation use when comparing fractional `quantity` against a requested sell size, to avoid float-precision false negatives on "insufficient shares"? *(ties to Medium #9)*
11. Does the LLM call retry/fallback behavior (§9 step 5) also cover HTTP-level failures (timeout, 5xx, rate limit) from OpenRouter, or only JSON-parse failures as currently worded? *(ties to Medium #10)*
12. What exact hex values should be used for price-flash green/red, sparkline up/down coloring, and heatmap P&L coloring, to sit consistently alongside the three named accent colors? *(ties to Low #14)*
13. Is the main per-ticker chart fed by the same "since page load" client-side buffer as the sparklines, and does buffering continue for non-selected tickers in the background? *(ties to Low #12)*

---

## Testing Strategy Gaps

§12's unit/E2E coverage is reasonably matched to the described features, but a few behaviors specified elsewhere in the plan have no corresponding test called out:

- **Watchlist/position tracking union (§6)**: no test scenario for "remove a ticker from the watchlist while holding a position — it keeps streaming/pricing and the position is still valued correctly." This is one of the more subtle, easy-to-regress behaviors in the whole spec and deserves an explicit E2E (or at least backend integration) test.
- **Ticker uppercase normalization / dedup (§7)**: no test that adding `"aapl"` when `"AAPL"` is already on the watchlist is a no-op / doesn't violate the unique constraint.
- **Lazy DB initialization**: no test that a fresh/empty SQLite file is correctly bootstrapped with schema + seed data on first request, which is the entire premise of §7's "no migration step" design.
- **30-second snapshot cadence**: hard to unit test a real 30s wait; the plan should call for an injectable/mockable clock or a configurable interval so this can be tested quickly rather than skipped or slow.
- **LLM request-level failure paths** (timeout/5xx/rate-limit, as opposed to malformed JSON) — not just parse-failure handling — should have a backend test given §9 step 5 needs to cover it (see Open Question 11).
- Given the Vision section leans heavily on "visually stunning" / animation-driven UX (price flashes, heatmap coloring, sparklines), there's no visual regression or screenshot-diff testing mentioned anywhere in §12. Not necessarily required, but worth a deliberate call on whether Playwright screenshot assertions are in scope, since functional E2E tests alone won't catch a broken flash animation or a heatmap rendering all-gray.

---

## Simplification Opportunities

- **§11's two persistence mechanisms could collapse into one clear instruction** — just state the bind-mount command in both places (or better, only in §11, with §4 pointing to it) instead of describing the mechanism prose-only in §4 and then contradicting it with a different mechanism in the example command.
- **Consider dropping the `trades` table's "no read API" tension** by either committing to a minimal trade-history endpoint (cheap to add, reuses existing patterns) or explicitly scoping it out as "logged for future use, not user-facing in v1" so agents don't wonder if they missed a requirement.
- **The epsilon/float-precision concern (Medium #9) could be sidestepped entirely** by rounding `quantity` to a fixed number of decimal places (e.g., 6) at the point of trade execution rather than requiring every comparison site to remember to use a tolerance — simpler to get right once than to re-derive at each validation call site.
