import { DATA_DB, SESSION_STATE_DIR, SOURCE_DB } from '../src/lib/config.ts';
import { openStore, scanAgents, syncUsage } from '../src/lib/store.ts';

const db = openStore(DATA_DB);
let started = performance.now();
const usage = syncUsage(db, SOURCE_DB);
console.log(`calls: ${usage.newCalls} new, sessions: ${usage.sessions} (${Math.round(performance.now() - started)} ms)`);
started = performance.now();
const agents = await scanAgents(db, SESSION_STATE_DIR);
console.log(`sub-agent events: ${agents} new (${Math.round(performance.now() - started)} ms)`);
db.close();
