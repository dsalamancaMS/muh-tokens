import type { DatabaseSync } from 'node:sqlite';
import { DATA_DB, SESSION_STATE_DIR, SOURCE_DB, SYNC_INTERVAL_MINUTES } from './config.ts';
import { parseFilters, type Filters, type SearchParams } from './filters.ts';
import { getEarliestTs } from './queries.ts';
import { openStore, scanAgents, syncUsage, type SyncResult } from './store.ts';
import type { SyncStatus } from './types.ts';

interface State {
  db: DatabaseSync;
  lastSync: number;
  running: Promise<SyncResult> | null;
  error: string | null;
  timer: NodeJS.Timeout | null;
}

// Kept on globalThis so that instrumentation, pages and dev-mode module reloads share one connection.
const holder = globalThis as unknown as { __muhTokens?: State };

function state(): State {
  holder.__muhTokens ??= { db: openStore(DATA_DB), lastSync: 0, running: null, error: null, timer: null };
  return holder.__muhTokens;
}

// Pages only read the store. New usage arrives through runSync.
export function getStore(): DatabaseSync {
  return state().db;
}

// Copies new calls from the Copilot session store, then indexes sub-agent names. A sync that is already
// running is shared rather than started twice.
export function runSync(): Promise<SyncResult> {
  const s = state();
  s.running ??= (async () => {
    try {
      const result = syncUsage(s.db, SOURCE_DB);
      await scanAgents(s.db, SESSION_STATE_DIR);
      s.lastSync = Date.now();
      s.error = null;
      return result;
    } catch (error) {
      s.error = `Could not sync from ${SOURCE_DB}: ${(error as Error).message}`;
      throw new Error(s.error);
    } finally {
      s.running = null;
    }
  })();
  return s.running;
}

export function startSyncTimer(): void {
  const s = state();
  if (s.timer) return;
  const tick = () => runSync().catch((error: Error) => console.error(error.message));
  if (SYNC_INTERVAL_MINUTES > 0) {
    s.timer = setInterval(tick, SYNC_INTERVAL_MINUTES * 60_000);
    s.timer.unref();
  }
  void tick();
}

export function getSyncStatus(): SyncStatus {
  const s = state();
  return { lastSync: s.lastSync, syncing: s.running !== null, error: s.error };
}

// Parses the dashboard filters against the current time. Pages render per request, so "now" is the request time.
export function getRequestFilters(db: DatabaseSync, params: SearchParams): Filters {
  return parseFilters(params, Date.now(), getEarliestTs(db));
}
