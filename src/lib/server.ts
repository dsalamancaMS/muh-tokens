import type { DatabaseSync } from 'node:sqlite';
import { DATA_DB, SESSION_STATE_DIR, SOURCE_DB, SYNC_INTERVAL_MS } from './config.ts';
import { parseFilters, type Filters, type SearchParams } from './filters.ts';
import { getEarliestTs } from './queries.ts';
import { openStore, scanAgents, syncUsage } from './store.ts';
import type { SyncStatus } from './types.ts';

interface State {
  db: DatabaseSync;
  lastSync: number;
  scan: Promise<void> | null;
  scanError: string | null;
}

// Kept on globalThis so that dev-mode module reloads reuse one connection.
const holder = globalThis as unknown as { __muhTokens?: State };

function state(): State {
  holder.__muhTokens ??= { db: openStore(DATA_DB), lastSync: 0, scan: null, scanError: null };
  return holder.__muhTokens;
}

// Returns the store after pulling new calls from the Copilot session store, at most once per
// SYNC_INTERVAL_MS. Sub-agent names are indexed in the background.
export function getStore(): DatabaseSync {
  const s = state();
  if (Date.now() - s.lastSync >= SYNC_INTERVAL_MS) {
    try {
      syncUsage(s.db, SOURCE_DB);
    } catch (error) {
      throw new Error(`Could not read the Copilot session store at ${SOURCE_DB}: ${(error as Error).message}`);
    }
    s.lastSync = Date.now();
    s.scan ??= scanAgents(s.db, SESSION_STATE_DIR)
      .then(() => {
        s.scanError = null;
      })
      .catch((error: Error) => {
        s.scanError = error.message;
      })
      .finally(() => {
        s.scan = null;
      });
  }
  return s.db;
}

export function getSyncStatus(): SyncStatus {
  const s = state();
  return { lastSync: s.lastSync, scanning: s.scan !== null, scanError: s.scanError };
}

// Parses the dashboard filters against the current time. Pages render per request, so "now" is the request time.
export function getRequestFilters(db: DatabaseSync, params: SearchParams): Filters {
  return parseFilters(params, Date.now(), getEarliestTs(db));
}
