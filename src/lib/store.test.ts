import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { parseFilters } from './filters.ts';
import { getSessionDetail, getTotals } from './queries.ts';
import { openStore, readSubagentEvents, scanAgents, syncUsage } from './store.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'muh-tokens-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const SESSION = 'session-1';
const T0 = Date.UTC(2026, 10, 19, 0, 0, 0);

function createSource(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT, repository TEXT, branch TEXT, summary TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE assistant_usage_events (
      id INTEGER PRIMARY KEY, session_id TEXT, agent_id TEXT, turn_index INTEGER, model TEXT, initiator TEXT,
      reasoning_effort TEXT, duration_ms INTEGER, created_at TEXT, input_tokens INTEGER, output_tokens INTEGER,
      cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER, total_nano_aiu INTEGER,
      token_details_json TEXT);
  `);
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    SESSION,
    '/tmp/work/demo',
    null,
    'main',
    'Demo session',
    new Date(T0).toISOString(),
    new Date(T0).toISOString(),
  );
  return db;
}

// Adds a call `seconds` after T0 whose context is all cache read, or all cache write when `rewrite` is set.
function addCall(db: DatabaseSync, id: number, agentId: string | null, seconds: number, rewrite = false): void {
  const context = 50_000;
  const [read, write] = rewrite ? [0, context] : [context, 0];
  const details = JSON.stringify([
    { tokenType: 'cache_read', tokenCount: read, costPerBatch: 1_000_000, batchSize: 1000 },
    { tokenType: 'cache_write', tokenCount: write, costPerBatch: 10_000_000, batchSize: 1000 },
    { tokenType: 'output', tokenCount: 100, costPerBatch: 50_000_000, batchSize: 1000 },
  ]);
  const total = read * 1000 + write * 10_000 + 100 * 50_000;
  db.prepare('INSERT INTO assistant_usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    SESSION,
    agentId,
    id,
    'claude-test',
    'agent',
    null,
    1000,
    new Date(T0 + seconds * 1000).toISOString(),
    context,
    100,
    read,
    write,
    0,
    total,
    details,
  );
}

test('syncUsage rolls calls into 5-minute buckets incrementally and records idle rewrites per agent', () => {
  const sourceFile = path.join(dir, 'source.db');
  const source = createSource(sourceFile);
  addCall(source, 1, null, 0);
  addCall(source, 2, 'agent-a', 30);
  addCall(source, 3, null, 400, true);
  source.close();

  const store = openStore(path.join(dir, 'store.db'));
  assert.equal(syncUsage(store, sourceFile).newCalls, 3);
  assert.equal(syncUsage(store, sourceFile).newCalls, 0);

  // The sub-agent's gap is measured from its call in the earlier sync. Call 5 lands in the same
  // bucket as call 4 but arrives in a later sync, so the bucket must be added to, not replaced.
  const more = new DatabaseSync(sourceFile);
  addCall(more, 4, 'agent-a', 630, true);
  assert.equal(syncUsage(store, sourceFile).newCalls, 1);
  addCall(more, 5, 'agent-a', 700, true);
  more.close();
  assert.equal(syncUsage(store, sourceFile).newCalls, 1);

  const rewrites = store.prepare('SELECT id, gap_s FROM rewrites ORDER BY id').all();
  assert.deepEqual(
    rewrites.map((row) => [row.id, row.gap_s]),
    [
      [3, 400],
      [4, 600],
    ],
  );
  const usage = store.prepare('SELECT agent_id, (bucket - ?) / 1000 AS s, calls, rewrites FROM usage ORDER BY bucket, agent_id').all(T0);
  assert.deepEqual(
    usage.map((row) => [row.agent_id, row.s, row.calls, row.rewrites]),
    [
      ['', 0, 1, 0],
      ['agent-a', 0, 1, 0],
      ['', 300, 1, 1],
      ['agent-a', 600, 2, 1],
    ],
  );

  const filters = parseFilters({ range: 'all' }, T0 + 86_400_000, T0);
  const totals = getTotals(store, filters);
  assert.equal(totals.calls, 5);
  assert.equal(totals.rewrites, 2);
  assert.equal(totals.aicTotal, (2 * 50_000_000 + 3 * 500_000_000 + 5 * 5_000_000) / 1e9);
  assert.equal(totals.rewriteAic, 2 * 505_000_000 / 1e9);

  const detail = getSessionDetail(store, SESSION);
  assert.equal(detail?.session.project, 'demo');
  assert.equal(detail?.session.lastTs, T0 + 700_000);
  assert.deepEqual(detail?.rewrites.map((r) => r.id), [3, 4]);
  assert.deepEqual(detail?.agents.map((agent) => [agent.agentId, agent.calls]).sort(), [
    ['', 2],
    ['agent-a', 3],
  ]);
  store.close();
});

test('scanAgents names sub-agents from events.jsonl and resumes after the last complete line', async () => {
  const sourceFile = path.join(dir, 'source2.db');
  const source = createSource(sourceFile);
  addCall(source, 1, 'agent-a', 0);
  source.close();
  const store = openStore(path.join(dir, 'store2.db'));
  syncUsage(store, sourceFile);

  const stateDir = path.join(dir, 'session-state');
  mkdirSync(path.join(stateDir, SESSION), { recursive: true });
  const events = path.join(stateDir, SESSION, 'events.jsonl');
  const started = JSON.stringify({
    type: 'subagent.started',
    agentId: 'agent-a',
    timestamp: new Date(T0).toISOString(),
    data: { agentName: 'code-reviewer', agentType: 'custom', model: 'claude-test' },
  });
  // The second line is unfinished, as if Copilot were still writing it.
  writeFileSync(events, `{"type":"user.message","data":{"content":"\\"type\\":\\"subagent.fake"}}\n${started}\n{"type":"subagent.co`);

  assert.equal(await scanAgents(store, stateDir), 1);
  assert.equal(store.prepare('SELECT name FROM agents WHERE agent_id = ?').get('agent-a')?.name, 'code-reviewer');
  assert.equal(getSessionDetail(store, SESSION)?.agents[0].name, 'code-reviewer');

  appendFileSync(events, 'mpleted","agentId":"agent-a","data":{}}\n');
  const seen: string[] = [];
  const offset = (store.prepare('SELECT offset FROM scanned_files').get() as { offset: number }).offset;
  await readSubagentEvents(events, offset, Number.MAX_SAFE_INTEGER, (event) => seen.push(event.type ?? ''));
  assert.deepEqual(seen, []);
  assert.equal(await scanAgents(store, stateDir), 0);
  store.close();
});
