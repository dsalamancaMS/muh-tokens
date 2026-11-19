import os from 'node:os';
import path from 'node:path';

const copilotDir = process.env.MUH_TOKENS_COPILOT_DIR ?? path.join(os.homedir(), '.copilot');

export const SOURCE_DB = process.env.MUH_TOKENS_SOURCE_DB ?? path.join(copilotDir, 'session-store.db');
export const SESSION_STATE_DIR = path.join(copilotDir, 'session-state');
export const DATA_DB = process.env.MUH_TOKENS_DB ?? path.join(process.cwd(), '.data', 'muh-tokens.db');

// Minutes between background syncs. 0 turns the timer off; the Sync button and npm run sync still work.
export const SYNC_INTERVAL_MINUTES = Number(process.env.MUH_TOKENS_SYNC_MINUTES ?? 5);
