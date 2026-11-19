# muh-tokens

A local web app that shows GitHub Copilot CLI token and AI credit (AIC) usage over time. It reads the session store that Copilot CLI writes on your machine and nothing else.

- The Overview page shows four totals (AIC, idle rewrite cost, tokens, calls) and one usage chart. The chart shows AIC or tokens, grouped by token type, session, project, model or agent, as bars, lines, a stacked area or a running total. Bars use hour, day or week steps; the other views use a finer step unless you pick one. Click a legend item to hide that series. When the chart is grouped by session, clicking a series opens that session. Beside the chart, the top contributors for the current grouping link to the session or apply the project or model filter. Below it are the token and credit split by type, the idle cache rewrite summary, and a table of the top sessions, projects, models and agents.
- The Sessions page lists every session in the selected range with its AIC, tokens, calls, rewrite cost and per-type split. More columns are available from the column menu.
- The session page shows one session: a timeline of AIC or tokens by type with idle rewrite AIC and a running total, the token and credit split, the idle cache rewrites, the largest context per agent in each 5-minute period, and the sub-agents. The Back link returns to the page you came from with its filters.

All filters live in the URL, so any view can be bookmarked or shared. The filter bar stays pinned under the top bar on wider screens.

## Running it

Requires Node 24 or later, because it uses `node:sqlite`.

```sh
npm install
npm run dev        # http://localhost:4817
```

Pages read only the app's own database, never the Copilot store. The server syncs new usage when it starts and then every 5 minutes, and the Sync button in the top bar syncs on demand. To sync without starting the server, run `npm run sync`.

Other scripts: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` and `npm start`.

### Docker

```sh
docker compose up -d --build    # http://localhost:4817
```

Compose mounts `~/.copilot` read-only at `/copilot` and keeps the app's store in the `muh-tokens-data` volume. Set `COPILOT_DIR` to mount a different Copilot folder. The port is bound to 127.0.0.1 only.

The container's `TZ` defaults to `Australia/Hobart`. Set `TZ` to your browser's timezone, or server-rendered times will not match the browser and React reports a hydration error.

The mount must stay read-only. The Copilot database uses WAL mode, and SQLite's WAL index is shared memory, which is not kept consistent between the host and a container VM. A read-only mount stops the container from writing to it. `npm run sync` is not available in the image; use the Sync button or wait for the timer.

## Data

The app reads two sources:

- `~/.copilot/session-store.db`, opened read-only. It uses the `sessions` and `assistant_usage_events` tables.
- `~/.copilot/session-state/<session>/events.jsonl`, which it scans for `subagent.started` and `subagent.configured` events to get sub-agent names. Each sync indexes these after it reads new calls.

It stores the results in `.data/muh-tokens.db`, which is about 8 MB for 220,000 calls. Calls are not kept one by one. They are summed into 5-minute buckets per session, agent and model, with the tokens and AIC of each type, the call count, the largest context and the idle rewrite totals. Idle cache rewrites are the one exception: each one is kept as its own row. Charts can therefore go no finer than 5 minutes.

Syncs are incremental. New calls are found by event ID and added to their buckets, and each `events.jsonl` is read from the offset where the last scan stopped. Delete `.data/` to rebuild from scratch. The store is also rebuilt when its schema version changes.

These environment variables override the default paths:

| Variable | Default |
| --- | --- |
| `MUH_TOKENS_COPILOT_DIR` | `~/.copilot` |
| `MUH_TOKENS_SOURCE_DB` | `$MUH_TOKENS_COPILOT_DIR/session-store.db` |
| `MUH_TOKENS_DB` | `./.data/muh-tokens.db` |
| `MUH_TOKENS_SYNC_MINUTES` | `5`. Set it to `0` to turn off the timer and sync only from the button or at startup. |

## How usage is split

Each model call records its input tokens (uncached input, cache reads and cache writes together), output tokens, reasoning tokens, and a `token_details_json` price list with the cost of each token type. The app reports five types:

- Input: uncached input tokens.
- Cache read and cache write: priced separately, from the price list.
- Output: output tokens that are not reasoning.
- Reasoning: a subset of output tokens. Its cost is its share of the output cost.

When a call has no price list, its tokens are taken from the token columns and its whole cost is counted as "other".

AIC is `total_nano_aiu / 1e9`. These are the values the CLI recorded locally. They may not match what your account is billed.

## Idle cache rewrites

When an agent waits long enough between calls, the prompt cache expires and the next call writes the whole context to the cache again. The app flags a call as an idle cache rewrite when all of these are true:

- At least 300 seconds have passed since the same agent's previous call in the same session.
- The context (all input tokens) is at least 20,000 tokens.
- Cache writes are at least half of the context.

The first call of each agent has no gap and is never flagged.
