import { mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isIdleRewrite, splitCost, type SourceUsageRow } from './cost.ts';
import { projectOf } from './project.ts';

const SCHEMA_VERSION = '2';

// Usage is kept as 5-minute rollups per session, agent and model. Idle cache rewrites are found during
// sync and kept one row per call. agent_last holds each agent's latest call time to measure the next gap.
const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  cwd TEXT,
  repository TEXT,
  branch TEXT,
  project TEXT,
  summary TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE usage (
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  first_ts INTEGER NOT NULL,
  last_ts INTEGER NOT NULL,
  calls INTEGER NOT NULL,
  max_context INTEGER NOT NULL,
  t_input INTEGER NOT NULL,
  t_cache_read INTEGER NOT NULL,
  t_cache_write INTEGER NOT NULL,
  t_output INTEGER NOT NULL,
  t_reasoning INTEGER NOT NULL,
  n_input INTEGER NOT NULL,
  n_cache_read INTEGER NOT NULL,
  n_cache_write INTEGER NOT NULL,
  n_output INTEGER NOT NULL,
  n_reasoning INTEGER NOT NULL,
  n_other INTEGER NOT NULL,
  n_total INTEGER NOT NULL,
  rewrites INTEGER NOT NULL,
  rewrite_nano INTEGER NOT NULL,
  PRIMARY KEY (session_id, agent_id, model, bucket)
) WITHOUT ROWID;
CREATE INDEX usage_bucket ON usage (bucket);
CREATE TABLE rewrites (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  ts INTEGER NOT NULL,
  gap_s REAL NOT NULL,
  context_tokens INTEGER NOT NULL,
  t_cache_write INTEGER NOT NULL,
  n_cache_write INTEGER NOT NULL,
  n_total INTEGER NOT NULL
);
CREATE INDEX rewrites_session ON rewrites (session_id);
CREATE TABLE agent_last (
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (session_id, agent_id)
) WITHOUT ROWID;
CREATE TABLE agents (
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT,
  agent_type TEXT,
  model TEXT,
  execution_mode TEXT,
  started_at TEXT,
  PRIMARY KEY (session_id, agent_id)
);
CREATE TABLE scanned_files (session_id TEXT PRIMARY KEY, offset INTEGER NOT NULL);
`;

export const BUCKET_MS = 5 * 60_000;
export const UNKNOWN_MODEL = '(unknown)';

export function openStore(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { timeout: 10_000 });
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
  const version = hasMeta
    ? (db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined)?.value
    : undefined;
  if (version !== SCHEMA_VERSION) {
    // The store only holds derived data, so a schema change rebuilds it from the source.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}"`);
    if (tables.length > 0) db.exec('VACUUM');
    db.exec(SCHEMA);
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?)").run(SCHEMA_VERSION);
  }
  return db;
}

interface SourceCall extends SourceUsageRow {
  id: number;
  session_id: string;
  agent_id: string | null;
  model: string | null;
  created_at: string;
}

interface SourceSession {
  id: string;
  cwd: string | null;
  repository: string | null;
  branch: string | null;
  summary: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// SQLite's datetime('now') default has no 'T' or 'Z'; the CLI writes ISO strings in UTC.
export function parseTimestamp(value: string): number {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return Date.parse(iso);
}

export interface SyncResult {
  newCalls: number;
  sessions: number;
}

interface Rollup {
  sessionId: string;
  agentId: string;
  model: string;
  bucket: number;
  firstTs: number;
  lastTs: number;
  calls: number;
  maxContext: number;
  // input, cache read, cache write, output, reasoning tokens, then the same five in nano-AIC, then other and total nano-AIC.
  sums: number[];
  rewrites: number;
  rewriteNano: number;
}

const SUM_COLUMNS = [
  't_input', 't_cache_read', 't_cache_write', 't_output', 't_reasoning',
  'n_input', 'n_cache_read', 'n_cache_write', 'n_output', 'n_reasoning', 'n_other', 'n_total',
];

// Adds calls with IDs above the last synced ID. Reading the last ID inside the write transaction keeps two
// concurrent syncs from counting the same calls twice.
export function syncUsage(db: DatabaseSync, sourceFile: string): SyncResult {
  const source = new DatabaseSync(sourceFile, { readOnly: true, timeout: 10_000 });
  try {
    const sessions = source
      .prepare('SELECT id, cwd, repository, branch, summary, created_at, updated_at FROM sessions')
      .all() as unknown as SourceSession[];
    const upsertSession = db.prepare(
      `INSERT INTO sessions (id, cwd, repository, branch, project, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET cwd = excluded.cwd, repository = excluded.repository, branch = excluded.branch,
         project = excluded.project, summary = excluded.summary, created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    );
    const upsertUsage = db.prepare(
      `INSERT INTO usage (session_id, agent_id, model, bucket, first_ts, last_ts, calls, max_context,
         ${SUM_COLUMNS.join(', ')}, rewrites, rewrite_nano)
       VALUES (${new Array(8 + SUM_COLUMNS.length + 2).fill('?').join(', ')})
       ON CONFLICT (session_id, agent_id, model, bucket) DO UPDATE SET
         first_ts = MIN(first_ts, excluded.first_ts), last_ts = MAX(last_ts, excluded.last_ts),
         calls = calls + excluded.calls, max_context = MAX(max_context, excluded.max_context),
         ${SUM_COLUMNS.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')},
         rewrites = rewrites + excluded.rewrites, rewrite_nano = rewrite_nano + excluded.rewrite_nano`,
    );
    const insertRewrite = db.prepare(
      `INSERT OR REPLACE INTO rewrites (id, session_id, agent_id, model, ts, gap_s, context_tokens, t_cache_write,
         n_cache_write, n_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const getLast = db.prepare('SELECT ts FROM agent_last WHERE session_id = ? AND agent_id = ?');
    const setLast = db.prepare(
      'INSERT INTO agent_last (session_id, agent_id, ts) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET ts = excluded.ts',
    );
    const setMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');

    let newCalls = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      const lastId = Number(
        (db.prepare("SELECT value FROM meta WHERE key = 'last_call_id'").get() as { value: string } | undefined)?.value ?? 0,
      );
      for (const s of sessions) {
        upsertSession.run(s.id, s.cwd, s.repository, s.branch, projectOf(s.cwd, s.repository), s.summary, s.created_at, s.updated_at);
      }
      const rows = source
        .prepare(
          `SELECT id, session_id, agent_id, model, created_at, input_tokens, output_tokens, cache_read_tokens,
                  cache_write_tokens, reasoning_tokens, total_nano_aiu, token_details_json
           FROM assistant_usage_events WHERE id > ? ORDER BY id`,
        )
        .iterate(lastId) as IterableIterator<SourceCall>;

      const rollups = new Map<string, Rollup>();
      const lastSeen = new Map<string, number | null>();
      let maxId = lastId;
      for (const row of rows) {
        const agentId = row.agent_id ?? '';
        const model = row.model || UNKNOWN_MODEL;
        const ts = parseTimestamp(row.created_at);
        const cost = splitCost(row);

        const agentKey = `${row.session_id}\u0000${agentId}`;
        if (!lastSeen.has(agentKey)) {
          lastSeen.set(agentKey, (getLast.get(row.session_id, agentId) as { ts: number } | undefined)?.ts ?? null);
        }
        const previous = lastSeen.get(agentKey) ?? null;
        // Calls normally arrive in time order. One that does not gets no gap rather than a negative one.
        const gap = previous !== null && ts >= previous ? (ts - previous) / 1000 : null;
        lastSeen.set(agentKey, previous === null ? ts : Math.max(previous, ts));
        const rewrite = isIdleRewrite(gap, cost.contextTokens, cost.tokens.cacheWrite);
        if (rewrite) {
          insertRewrite.run(row.id, row.session_id, agentId, model, ts, gap, cost.contextTokens, cost.tokens.cacheWrite,
            cost.nano.cacheWrite, cost.nanoTotal);
        }

        const bucket = Math.floor(ts / BUCKET_MS) * BUCKET_MS;
        const key = `${agentKey}\u0000${model}\u0000${bucket}`;
        let rollup = rollups.get(key);
        if (!rollup) {
          rollup = { sessionId: row.session_id, agentId, model, bucket, firstTs: ts, lastTs: ts, calls: 0, maxContext: 0,
            sums: new Array(SUM_COLUMNS.length).fill(0), rewrites: 0, rewriteNano: 0 };
          rollups.set(key, rollup);
        }
        rollup.firstTs = Math.min(rollup.firstTs, ts);
        rollup.lastTs = Math.max(rollup.lastTs, ts);
        rollup.calls++;
        rollup.maxContext = Math.max(rollup.maxContext, cost.contextTokens);
        const values = [
          cost.tokens.input, cost.tokens.cacheRead, cost.tokens.cacheWrite, cost.tokens.output, cost.tokens.reasoning,
          cost.nano.input, cost.nano.cacheRead, cost.nano.cacheWrite, cost.nano.output, cost.nano.reasoning,
          cost.nanoOther, cost.nanoTotal,
        ];
        values.forEach((value, i) => (rollup.sums[i] += value));
        if (rewrite) {
          rollup.rewrites++;
          rollup.rewriteNano += cost.nanoTotal;
        }
        maxId = Math.max(maxId, row.id);
        newCalls++;
      }

      for (const r of rollups.values()) {
        upsertUsage.run(r.sessionId, r.agentId, r.model, r.bucket, r.firstTs, r.lastTs, r.calls, r.maxContext, ...r.sums,
          r.rewrites, r.rewriteNano);
      }
      for (const [key, ts] of lastSeen) {
        const [sessionId, agentId] = key.split('\u0000');
        if (ts !== null) setLast.run(sessionId, agentId, ts);
      }
      setMeta.run('last_call_id', String(maxId));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return { newCalls, sessions: sessions.length };
  } finally {
    source.close();
  }
}

interface SubagentEvent {
  type?: string;
  agentId?: string;
  timestamp?: string;
  data?: {
    agentName?: string;
    agentDisplayName?: string;
    agentType?: string;
    model?: string;
    executionMode?: string;
  };
}

const MARKER = Buffer.from('"type":"subagent.');
const CHUNK_BYTES = 8 * 1024 * 1024;

// JSON string values escape their quotes, so MARKER only matches a real "type" key.
function scanLines(buffer: Buffer, onEvent: (event: SubagentEvent) => void): void {
  let index = buffer.indexOf(MARKER);
  while (index >= 0) {
    const start = buffer.lastIndexOf(10, index) + 1;
    let end = buffer.indexOf(10, index);
    if (end < 0) end = buffer.length;
    try {
      const event = JSON.parse(buffer.toString('utf8', start, end)) as SubagentEvent;
      if (event.type === 'subagent.started' || event.type === 'subagent.configured') onEvent(event);
    } catch {
      // A malformed line is skipped; the rest of the file is still read.
    }
    index = buffer.indexOf(MARKER, end);
  }
}

// Reads complete lines from start to end and returns the offset after the last complete line.
export async function readSubagentEvents(
  file: string,
  start: number,
  end: number,
  onEvent: (event: SubagentEvent) => void,
): Promise<number> {
  const handle = await fs.open(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(CHUNK_BYTES);
    let position = start;
    let consumed = start;
    let carry = Buffer.alloc(0);
    while (position < end) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(CHUNK_BYTES, end - position), position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const data = carry.length > 0 ? Buffer.concat([carry, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);
      const lastNewline = data.lastIndexOf(10);
      if (lastNewline < 0) {
        carry = Buffer.from(data);
        continue;
      }
      scanLines(data.subarray(0, lastNewline + 1), onEvent);
      consumed += lastNewline + 1;
      carry = Buffer.from(data.subarray(lastNewline + 1));
    }
    return consumed;
  } finally {
    await handle.close();
  }
}

// Finds sub-agent names in each session's events.jsonl. Only bytes appended since the last scan are read.
export async function scanAgents(db: DatabaseSync, stateDir: string): Promise<number> {
  const sessions = db.prepare("SELECT DISTINCT session_id FROM agent_last WHERE agent_id <> ''").all() as {
    session_id: string;
  }[];
  const getOffset = db.prepare('SELECT offset FROM scanned_files WHERE session_id = ?');
  const setOffset = db.prepare(
    'INSERT INTO scanned_files (session_id, offset) VALUES (?, ?) ON CONFLICT (session_id) DO UPDATE SET offset = excluded.offset',
  );
  const upsertAgent = db.prepare(
    `INSERT INTO agents (session_id, agent_id, name, agent_type, model, execution_mode, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id, agent_id) DO UPDATE SET
       name = COALESCE(excluded.name, agents.name),
       agent_type = COALESCE(excluded.agent_type, agents.agent_type),
       model = COALESCE(excluded.model, agents.model),
       execution_mode = COALESCE(excluded.execution_mode, agents.execution_mode),
       started_at = COALESCE(agents.started_at, excluded.started_at)`,
  );

  let found = 0;
  for (const { session_id: sessionId } of sessions) {
    const file = path.join(stateDir, sessionId, 'events.jsonl');
    let size: number;
    try {
      size = (await fs.stat(file)).size;
    } catch {
      continue;
    }
    let offset = (getOffset.get(sessionId) as { offset: number } | undefined)?.offset ?? 0;
    if (size < offset) offset = 0;
    if (size === offset) continue;

    const events: SubagentEvent[] = [];
    const consumed = await readSubagentEvents(file, offset, size, (event) => events.push(event));
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const event of events) {
        if (!event.agentId) continue;
        const data = event.data ?? {};
        upsertAgent.run(
          sessionId,
          event.agentId,
          data.agentName ?? data.agentDisplayName ?? null,
          data.agentType ?? null,
          data.model ?? null,
          data.executionMode ?? null,
          event.type === 'subagent.started' ? (event.timestamp ?? null) : null,
        );
        found++;
      }
      setOffset.run(sessionId, consumed);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return found;
}
