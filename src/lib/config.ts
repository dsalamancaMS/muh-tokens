import os from 'node:os';
import path from 'node:path';

const copilotDir = process.env.MUH_TOKENS_COPILOT_DIR ?? path.join(os.homedir(), '.copilot');

export const SOURCE_DB = process.env.MUH_TOKENS_SOURCE_DB ?? path.join(copilotDir, 'session-store.db');
export const SESSION_STATE_DIR = path.join(copilotDir, 'session-state');
export const DATA_DB = process.env.MUH_TOKENS_DB ?? path.join(process.cwd(), '.data', 'muh-tokens.db');

// Minimum time between two syncs triggered by page loads.
export const SYNC_INTERVAL_MS = 10_000;
