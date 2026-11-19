# muh-tokens

A local web app that shows GitHub Copilot CLI token and AI credit (AIC) usage over time. It reads the session store that Copilot CLI writes on your machine and nothing else.

- The dashboard shows totals, a stacked timeline of AIC or tokens, the split by token type, the top sessions, and breakdowns by model, project and agent. The timeline can be stacked by token type, session, model, project or agent. When it is stacked by session, clicking a bar opens that session.
- The sessions page lists every session in the selected range with its AIC, tokens, calls and per-type split.
- The session page shows one session: a timeline of AIC or tokens by type with a running AIC total, the context size of each call per agent, the sub-agents, the most expensive idle cache rewrites, and every model call.

## Running it

Requires Node 24 or later, because it uses `node:sqlite`.

```sh
npm install
npm run dev        # http://localhost:4817
```

Each page load syncs new usage from the Copilot store, at most once every 10 seconds. To sync without starting the server, run `npm run sync`.

Other scripts: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` and `npm start`.

## Data

The app reads two sources:

- `~/.copilot/session-store.db`, opened read-only. It uses the `sessions` and `assistant_usage_events` tables.
- `~/.copilot/session-state/<session>/events.jsonl`, which it scans for `subagent.started` and `subagent.configured` events to get sub-agent names. Page loads index these in the background, so a new sub-agent can show as its ID until the next load.

It copies what it needs into `.data/muh-tokens.db`. Syncs are incremental: new calls are found by event ID, and each `events.jsonl` is read from the offset where the last scan stopped. Delete `.data/` to rebuild from scratch.

These environment variables override the default paths:

| Variable | Default |
| --- | --- |
| `MUH_TOKENS_COPILOT_DIR` | `~/.copilot` |
| `MUH_TOKENS_SOURCE_DB` | `$MUH_TOKENS_COPILOT_DIR/session-store.db` |
| `MUH_TOKENS_DB` | `./.data/muh-tokens.db` |

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
