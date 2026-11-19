import { mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isIdleRewrite, splitCost, type SourceUsageRow } from './cost.ts';
import { projectOf } from './project.ts';

const SCHEMA_VERSION = '1';

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
CREATE TABLE calls (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  turn_index INTEGER,
  model TEXT,
  initiator TEXT,
  reasoning_effort TEXT,
  ts INTEGER NOT NULL,
  duration_ms INTEGER,
  context_tokens INTEGER NOT NULL,
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
  gap_s REAL,
  idle_rewrite INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX calls_ts ON calls (ts);
CREATE INDEX calls_session ON calls (session_id, agent_id, ts);
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
    db.exec(`
      DROP TABLE IF EXISTS meta; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS calls;
      DROP TABLE IF EXISTS agents; DROP TABLE IF EXISTS scanned_files;
    `);
    db.exec(SCHEMA);
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?)").run(SCHEMA_VERSION);
  }
  return db;
}

interface SourceCall extends SourceUsageRow {
  id: number;
  session_id: string;
  agent_id: string | null;
  turn_index: number | null;
  model: string | null;
  initiator: string | null;
  reasoning_effort: string | null;
  duration_ms: number | null;
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

export function syncUsage(db: DatabaseSync, sourceFile: string): SyncResult {
  const source = new DatabaseSync(sourceFile, { readOnly: true, timeout: 10_000 });
  try {
    const lastId = (db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM calls').get() as { id: number }).id;
    const sessions = source
      .prepare('SELECT id, cwd, repository, branch, summary, created_at, updated_at FROM sessions')
      .all() as unknown as SourceSession[];
    const rows = source
      .prepare(
        `SELECT id, session_id, agent_id, turn_index, model, initiator, reasoning_effort, duration_ms, created_at,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
                total_nano_aiu, token_details_json
         FROM assistant_usage_events WHERE id > ? ORDER BY id`,
      )
      .iterate(lastId) as IterableIterator<SourceCall>;

    const upsertSession = db.prepare(
      `INSERT INTO sessions (id, cwd, repository, branch, project, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET cwd = excluded.cwd, repository = excluded.repository, branch = excluded.branch,
         project = excluded.project, summary = excluded.summary, created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    );
    const insertCall = db.prepare(
      `INSERT OR REPLACE INTO calls (id, session_id, agent_id, turn_index, model, initiator, reasoning_effort, ts,
         duration_ms, context_tokens, t_input, t_cache_read, t_cache_write, t_output, t_reasoning,
         n_input, n_cache_read, n_cache_write, n_output, n_reasoning, n_other, n_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const touched = new Set<string>();
    let newCalls = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const s of sessions) {
        upsertSession.run(s.id, s.cwd, s.repository, s.branch, projectOf(s.cwd, s.repository), s.summary, s.created_at, s.updated_at);
      }
      for (const row of rows) {
        const cost = splitCost(row);
        insertCall.run(
          row.id,
          row.session_id,
          row.agent_id ?? '',
          row.turn_index,
          row.model,
          row.initiator || null,
          row.reasoning_effort || null,
          parseTimestamp(row.created_at),
          row.duration_ms,
          cost.contextTokens,
          cost.tokens.input,
          cost.tokens.cacheRead,
          cost.tokens.cacheWrite,
          cost.tokens.output,
          cost.tokens.reasoning,
          cost.nano.input,
          cost.nano.cacheRead,
          cost.nano.cacheWrite,
          cost.nano.output,
          cost.nano.reasoning,
          cost.nanoOther,
          cost.nanoTotal,
        );
        touched.add(row.session_id);
        newCalls++;
      }
      for (const sessionId of touched) updateGaps(db, sessionId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { newCalls, sessions: sessions.length };
  } finally {
    source.close();
  }
}

// Recomputes each call's gap since the same agent's previous call, and the idle-rewrite flag.
function updateGaps(db: DatabaseSync, sessionId: string): void {
  const rows = db
    .prepare(
      `SELECT id, agent_id, ts, context_tokens, t_cache_write, gap_s, idle_rewrite
       FROM calls WHERE session_id = ? ORDER BY agent_id, ts, id`,
    )
    .all(sessionId) as unknown as {
    id: number;
    agent_id: string;
    ts: number;
    context_tokens: number;
    t_cache_write: number;
    gap_s: number | null;
    idle_rewrite: number;
  }[];
  const update = db.prepare('UPDATE calls SET gap_s = ?, idle_rewrite = ? WHERE id = ?');
  let previous: (typeof rows)[number] | undefined;
  for (const row of rows) {
    const gap = previous && previous.agent_id === row.agent_id ? (row.ts - previous.ts) / 1000 : null;
    const flag = isIdleRewrite(gap, row.context_tokens, row.t_cache_write) ? 1 : 0;
    if (gap !== row.gap_s || flag !== row.idle_rewrite) update.run(gap, flag, row.id);
    previous = row;
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
  const sessions = db.prepare("SELECT DISTINCT session_id FROM calls WHERE agent_id <> ''").all() as {
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
