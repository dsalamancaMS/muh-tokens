import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { TOKEN_TYPE_COLORS, TOKEN_TYPE_LABELS, TOKEN_TYPES, type TokenType } from './cost.ts';
import { bucketRange, bucketStart, type Filters, type Stack } from './filters.ts';
import { floorToStep, pickStepMinutes, stepRange } from './sessionTimeline.ts';
import type {
  AgentSummary,
  RewriteSummary,
  BreakdownRow,
  ByType,
  RewriteRow,
  SessionDetail,
  SessionRow,
  Timeline,
  TimelineSeries,
  UsageSlice,
  UsageTotals,
} from './types.ts';

const NANO = 1e9;
const COLUMN: Record<TokenType, string> = {
  input: 'input',
  cacheRead: 'cache_read',
  cacheWrite: 'cache_write',
  output: 'output',
  reasoning: 'reasoning',
};

const FROM = `FROM usage c
  LEFT JOIN sessions s ON s.id = c.session_id
  LEFT JOIN agents a ON a.session_id = c.session_id AND a.agent_id = c.agent_id`;

const AGENT_LABEL = `CASE WHEN c.agent_id = '' THEN 'main agent' ELSE COALESCE(a.name, 'unnamed sub-agent') END`;
const TOTAL_TOKENS = 'c.t_input + c.t_cache_read + c.t_cache_write + c.t_output + c.t_reasoning';

const SUMS = [
  'SUM(c.calls) AS calls',
  'COUNT(DISTINCT c.session_id) AS sessions',
  ...TOKEN_TYPES.map((t) => `SUM(c.n_${COLUMN[t]}) AS n_${COLUMN[t]}`),
  ...TOKEN_TYPES.map((t) => `SUM(c.t_${COLUMN[t]}) AS t_${COLUMN[t]}`),
  'SUM(c.n_total) AS n_total',
  'SUM(c.rewrites) AS rewrites',
  'SUM(c.rewrite_nano) AS rewrite_nano',
].join(', ');

const STACK_KEY: Record<Exclude<Stack, 'type'>, string> = {
  session: 'c.session_id',
  model: 'c.model',
  agent: AGENT_LABEL,
  project: "COALESCE(s.project, '(unknown)')",
};

const OTHER = '__other';
const STACK_LIMIT = 8;
// Kept apart from the token-type colours, so a colour means the same thing on every chart.
const PALETTE = ['#3949ab', '#00897b', '#d81b60', '#f9a825', '#00acc1', '#8d6e63', '#7cb342', '#f4511e', '#5e35b1', '#039be5'];
export const OTHER_COLOR = '#757575';

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Each key gets a colour from a hash of its name, so a project keeps its colour when the range changes.
// Collisions move to the next free colour, in the order the keys are given.
export function categoryColors(keys: string[]): Map<string, string> {
  const used = new Set<number>();
  const colors = new Map<string, string>();
  for (const key of keys) {
    let i = hash(key) % PALETTE.length;
    for (let tries = 0; used.has(i) && tries < PALETTE.length; tries++) i = (i + 1) % PALETTE.length;
    used.add(i);
    colors.set(key, PALETTE[i]);
  }
  return colors;
}

type Row = Record<string, SQLInputValue>;

function num(value: SQLInputValue | undefined): number {
  return typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : Number(value ?? 0) || 0;
}

function str(value: SQLInputValue | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function byType(row: Row, prefix: 'n' | 't', scale = 1): ByType {
  const result = {} as ByType;
  for (const type of TOKEN_TYPES) result[type] = num(row[`${prefix}_${COLUMN[type]}`]) / scale;
  return result;
}

function sum(values: ByType): number {
  return TOKEN_TYPES.reduce((total, type) => total + values[type], 0);
}

function toTotals(row: Row): UsageTotals {
  const tokens = byType(row, 't');
  return {
    calls: num(row.calls),
    sessions: num(row.sessions),
    aic: byType(row, 'n', NANO),
    tokens,
    aicTotal: num(row.n_total) / NANO,
    tokensTotal: sum(tokens),
    rewrites: num(row.rewrites),
    rewriteAic: num(row.rewrite_nano) / NANO,
  };
}

function where(filters: Filters): { sql: string; args: SQLInputValue[] } {
  return {
    sql: 'c.bucket >= ? AND c.bucket < ? AND (? IS NULL OR s.project = ?) AND (? IS NULL OR c.model = ?)',
    args: [filters.fromMs, filters.toMs, filters.project, filters.project, filters.model, filters.model],
  };
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

function sessionTitle(summary: string | null, id: string): string {
  return summary?.trim() || `Session ${shortId(id)}`;
}

export function getEarliestTs(db: DatabaseSync): number {
  return num((db.prepare('SELECT MIN(first_ts) AS ts FROM usage').get() as Row | undefined)?.ts) || Date.now();
}

export function getFilterOptions(db: DatabaseSync): { projects: string[]; models: string[] } {
  const projects = db
    .prepare(`SELECT s.project AS v FROM usage c JOIN sessions s ON s.id = c.session_id GROUP BY 1 ORDER BY SUM(c.n_total) DESC`)
    .all() as Row[];
  const models = db.prepare('SELECT c.model AS v FROM usage c GROUP BY 1 ORDER BY SUM(c.n_total) DESC').all() as Row[];
  return {
    projects: projects.map((r) => str(r.v)).filter((v): v is string => !!v),
    models: models.map((r) => str(r.v)).filter((v): v is string => !!v),
  };
}

export function getTotals(db: DatabaseSync, filters: Filters): UsageTotals {
  const w = where(filters);
  return toTotals(db.prepare(`SELECT ${SUMS} ${FROM} WHERE ${w.sql}`).get(...w.args) as Row);
}

function sessionLabels(db: DatabaseSync, ids: string[]): Map<string, string> {
  const rows = db
    .prepare('SELECT id, summary FROM sessions WHERE id IN (SELECT value FROM json_each(?))')
    .all(JSON.stringify(ids)) as Row[];
  const labels = new Map(ids.map((id) => [id, sessionTitle(null, id)]));
  for (const row of rows) labels.set(String(row.id), sessionTitle(str(row.summary), String(row.id)));
  return labels;
}

interface StackRows {
  keys: Omit<TimelineSeries, 'values'>[];
  // 5-minute bucket start and one value per key.
  rows: { bucket: number; values: number[] }[];
}

function stackRows(db: DatabaseSync, filters: Filters): StackRows {
  const w = where(filters);
  const scale = filters.metric === 'aic' ? NANO : 1;

  if (filters.stack === 'type') {
    const prefix = filters.metric === 'aic' ? 'n' : 't';
    const rows = db
      .prepare(
        `SELECT c.bucket AS bucket, ${TOKEN_TYPES.map((t) => `SUM(c.${prefix}_${COLUMN[t]}) AS ${prefix}_${COLUMN[t]}`).join(', ')}
         ${FROM} WHERE ${w.sql} GROUP BY c.bucket`,
      )
      .all(...w.args) as Row[];
    return {
      keys: TOKEN_TYPES.map((type) => ({ id: type, label: TOKEN_TYPE_LABELS[type], color: TOKEN_TYPE_COLORS[type] })),
      rows: rows.map((row) => ({
        bucket: num(row.bucket),
        values: TOKEN_TYPES.map((type) => num(row[`${prefix}_${COLUMN[type]}`]) / scale),
      })),
    };
  }

  const keySql = STACK_KEY[filters.stack];
  const metricSql = filters.metric === 'aic' ? 'c.n_total' : TOTAL_TOKENS;
  const top = (
    db
      .prepare(`SELECT ${keySql} AS k ${FROM} WHERE ${w.sql} GROUP BY k ORDER BY SUM(${metricSql}) DESC LIMIT ${STACK_LIMIT}`)
      .all(...w.args) as Row[]
  ).map((r) => String(r.k));
  const rows = db
    .prepare(
      `SELECT c.bucket AS bucket,
              CASE WHEN ${keySql} IN (SELECT value FROM json_each(?)) THEN ${keySql} ELSE '${OTHER}' END AS k,
              SUM(${metricSql}) AS v
       ${FROM} WHERE ${w.sql} GROUP BY c.bucket, k`,
    )
    .all(JSON.stringify(top), ...w.args) as Row[];

  const labels = filters.stack === 'session' ? sessionLabels(db, top) : new Map(top.map((k) => [k, k]));
  const keys = rows.some((r) => r.k === OTHER) ? [...top, OTHER] : top;
  const position = new Map(keys.map((k, i) => [k, i]));
  const colors = categoryColors(top);
  return {
    keys: keys.map((key) => ({
      id: key,
      label: key === OTHER ? 'Other' : (labels.get(key) ?? key),
      color: key === OTHER ? OTHER_COLOR : colors.get(key),
    })),
    rows: rows.map((row) => {
      const values = new Array(keys.length).fill(0);
      values[position.get(String(row.k))!] = num(row.v) / scale;
      return { bucket: num(row.bucket), values };
    }),
  };
}

function aggregate(source: StackRows, buckets: number[], bucketMinutes: number, floor: (ms: number) => number): Timeline {
  const index = new Map(buckets.map((b, i) => [b, i]));
  const series: TimelineSeries[] = source.keys.map((key) => ({ ...key, values: new Array(buckets.length).fill(0) }));
  for (const row of source.rows) {
    const i = index.get(floor(row.bucket));
    if (i === undefined) continue;
    row.values.forEach((value, s) => (series[s].values[i] += value));
  }
  return { buckets, bucketMinutes, series };
}

const BUCKET_MINUTES = { hour: 60, day: 1440, week: 10080 };
const FINE_CHART_POINTS = 200;

// Bars use the hour, day or week buckets. Line views use the same buckets when the user picked one,
// otherwise the finest step that keeps the range under FINE_CHART_POINTS points.
export function getUsageTimeline(db: DatabaseSync, filters: Filters): Timeline {
  const source = stackRows(db, filters);
  if (filters.view === 'bars' || filters.bucketParam !== 'auto') {
    const bucket = filters.bucket;
    return aggregate(source, bucketRange(filters.fromMs, filters.toMs, bucket), BUCKET_MINUTES[bucket], (ms) =>
      bucketStart(ms, bucket),
    );
  }
  const step = pickStepMinutes(filters.toMs - filters.fromMs, FINE_CHART_POINTS);
  return aggregate(source, stepRange(filters.fromMs, filters.toMs, step), step, (ms) => floorToStep(ms, step));
}

function sessionDetails(db: DatabaseSync, ids: string[]): Map<string, { label: string; detail: string }> {
  const rows = db
    .prepare('SELECT id, summary, project FROM sessions WHERE id IN (SELECT value FROM json_each(?))')
    .all(JSON.stringify(ids)) as Row[];
  const result = new Map(ids.map((id) => [id, { label: sessionTitle(null, id), detail: shortId(id) }]));
  for (const row of rows) {
    const id = String(row.id);
    result.set(id, { label: sessionTitle(str(row.summary), id), detail: `${str(row.project) ?? '(unknown)'} • ${shortId(id)}` });
  }
  return result;
}

export function getBreakdown(db: DatabaseSync, filters: Filters, dimension: Exclude<Stack, 'type'>, limit = 15): BreakdownRow[] {
  const w = where(filters);
  const rows = db
    .prepare(
      `SELECT ${STACK_KEY[dimension]} AS k, ${SUMS} ${FROM} WHERE ${w.sql} GROUP BY k ORDER BY n_total DESC LIMIT ?`,
    )
    .all(...w.args, limit) as Row[];
  const keys = rows.map((r) => String(r.k));
  const details = dimension === 'session' ? sessionDetails(db, keys) : null;
  return rows.map((row) => {
    const key = String(row.k);
    const session = details?.get(key);
    return { key, label: session?.label ?? key, detail: session?.detail, ...toTotals(row) };
  });
}

const GAP_BANDS: [number, string][] = [
  [600, '5 to 10 min'],
  [1800, '10 to 30 min'],
  [7200, '30 min to 2 h'],
  [Infinity, 'Over 2 h'],
];

// The sessions that paid most for idle cache rewrites, and how long the agents were idle before them.
export function getRewriteSummary(db: DatabaseSync, filters: Filters, limit = 5): RewriteSummary {
  const w = where(filters);
  const top = db
    .prepare(
      `SELECT c.session_id AS k, SUM(c.rewrite_nano) AS n, SUM(c.rewrites) AS r ${FROM}
       WHERE ${w.sql} AND c.rewrites > 0 GROUP BY k ORDER BY n DESC LIMIT ?`,
    )
    .all(...w.args, limit) as Row[];
  const details = sessionDetails(db, top.map((r) => String(r.k)));
  const bandSql = `CASE ${GAP_BANDS.slice(0, -1).map(([max], i) => `WHEN r.gap_s < ${max} THEN ${i}`).join(' ')} ELSE ${GAP_BANDS.length - 1} END`;
  const gaps = db
    .prepare(
      `SELECT ${bandSql} AS band, COUNT(*) AS n, SUM(r.n_total) AS aic FROM rewrites r
       LEFT JOIN sessions s ON s.id = r.session_id
       WHERE r.ts >= ? AND r.ts < ? AND (? IS NULL OR s.project = ?) AND (? IS NULL OR r.model = ?)
       GROUP BY band`,
    )
    .all(...w.args) as Row[];
  const byBand = new Map(gaps.map((row) => [num(row.band), row]));
  return {
    sessions: top.map((row) => {
      const key = String(row.k);
      return { key, ...details.get(key)!, aic: num(row.n) / NANO, rewrites: num(row.r) };
    }),
    gaps: GAP_BANDS.map(([, label], i) => ({ label, count: num(byBand.get(i)?.n), aic: num(byBand.get(i)?.aic) / NANO })),
  };
}

const SESSION_SELECT = `SELECT c.session_id AS id, s.summary, s.project, s.cwd, s.branch,
    MIN(c.first_ts) AS first_ts, MAX(c.last_ts) AS last_ts,
    COUNT(DISTINCT NULLIF(c.agent_id, '')) AS subagents,
    GROUP_CONCAT(DISTINCT c.model) AS models,
    MAX(c.max_context) AS peak_context,
    ${SUMS}
  ${FROM}`;

function toSession(row: Row): SessionRow {
  const id = String(row.id);
  return {
    id,
    title: sessionTitle(str(row.summary), id),
    project: str(row.project) ?? '(unknown)',
    cwd: str(row.cwd),
    branch: str(row.branch),
    firstTs: num(row.first_ts),
    lastTs: num(row.last_ts),
    subagents: num(row.subagents),
    models: (str(row.models) ?? '').split(',').join(', '),
    peakContext: num(row.peak_context),
    ...toTotals(row),
  };
}

// Sessions active in the range. Totals cover the whole session, not only the part in the range.
export function getSessions(db: DatabaseSync, filters: Filters): SessionRow[] {
  const rows = db
    .prepare(
      `${SESSION_SELECT}
       WHERE (? IS NULL OR s.project = ?)
       GROUP BY c.session_id
       HAVING MAX(c.last_ts) >= ? AND MIN(c.first_ts) < ? AND (? IS NULL OR SUM(c.model = ?) > 0)
       ORDER BY n_total DESC`,
    )
    .all(filters.project, filters.project, filters.fromMs, filters.toMs, filters.model, filters.model) as Row[];
  return rows.map(toSession);
}

export function getSessionDetail(db: DatabaseSync, id: string): SessionDetail | null {
  const sessionRow = db.prepare(`${SESSION_SELECT} WHERE c.session_id = ? GROUP BY c.session_id`).get(id) as Row | undefined;
  if (!sessionRow) return null;

  const slices = (
    db
      .prepare(`SELECT c.*, ${AGENT_LABEL} AS agent ${FROM} WHERE c.session_id = ? ORDER BY c.bucket`)
      .all(id) as Row[]
  ).map(
    (row): UsageSlice => ({
      ts: num(row.bucket),
      agentId: String(row.agent_id),
      agent: String(row.agent),
      model: String(row.model),
      calls: num(row.calls),
      maxContext: num(row.max_context),
      tokens: byType(row, 't'),
      aic: byType(row, 'n', NANO),
      aicTotal: num(row.n_total) / NANO,
      rewriteAic: num(row.rewrite_nano) / NANO,
    }),
  );

  const rewrites = (
    db
      .prepare(
        `SELECT c.*, ${AGENT_LABEL} AS agent FROM rewrites c
         LEFT JOIN agents a ON a.session_id = c.session_id AND a.agent_id = c.agent_id
         WHERE c.session_id = ? ORDER BY c.n_total DESC`,
      )
      .all(id) as Row[]
  ).map(
    (row): RewriteRow => ({
      id: num(row.id),
      ts: num(row.ts),
      agentId: String(row.agent_id),
      agent: String(row.agent),
      model: String(row.model),
      gapS: num(row.gap_s),
      context: num(row.context_tokens),
      cacheWriteTokens: num(row.t_cache_write),
      cacheWriteAic: num(row.n_cache_write) / NANO,
      aicTotal: num(row.n_total) / NANO,
    }),
  );

  const agents = (
    db
      .prepare(
        `SELECT c.agent_id, ${AGENT_LABEL} AS name, a.execution_mode, GROUP_CONCAT(DISTINCT c.model) AS models,
                MIN(c.first_ts) AS first_ts, MAX(c.last_ts) AS last_ts, MAX(c.max_context) AS peak_context, ${SUMS}
         ${FROM} WHERE c.session_id = ? GROUP BY c.agent_id ORDER BY n_total DESC`,
      )
      .all(id) as Row[]
  ).map((row): AgentSummary => {
    const agentId = String(row.agent_id);
    const name = String(row.name);
    return {
      agentId,
      name,
      label: agentId ? `${name} (${shortId(agentId)})` : name,
      models: (str(row.models) ?? '').split(',').join(', '),
      executionMode: str(row.execution_mode),
      firstTs: num(row.first_ts),
      lastTs: num(row.last_ts),
      peakContext: num(row.peak_context),
      ...toTotals(row),
    };
  });

  return { session: toSession(sessionRow), slices, rewrites, agents };
}
