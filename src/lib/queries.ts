import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { TOKEN_TYPE_COLORS, TOKEN_TYPE_LABELS, TOKEN_TYPES, type TokenType } from './cost.ts';
import { bucketRange, type Bucket, type Filters, type Stack } from './filters.ts';
import type {
  AgentSummary,
  BreakdownRow,
  ByType,
  CallRow,
  SessionDetail,
  SessionRow,
  Timeline,
  TimelineSeries,
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

const FROM = `FROM calls c
  LEFT JOIN sessions s ON s.id = c.session_id
  LEFT JOIN agents a ON a.session_id = c.session_id AND a.agent_id = c.agent_id`;

const AGENT_LABEL = `CASE WHEN c.agent_id = '' THEN 'main agent' ELSE COALESCE(a.name, 'unnamed sub-agent') END`;
const TOTAL_TOKENS = 'c.t_input + c.t_cache_read + c.t_cache_write + c.t_output + c.t_reasoning';

const SUMS = [
  'COUNT(*) AS calls',
  'COUNT(DISTINCT c.session_id) AS sessions',
  ...TOKEN_TYPES.map((t) => `SUM(c.n_${COLUMN[t]}) AS n_${COLUMN[t]}`),
  ...TOKEN_TYPES.map((t) => `SUM(c.t_${COLUMN[t]}) AS t_${COLUMN[t]}`),
  'SUM(c.n_total) AS n_total',
  'SUM(c.idle_rewrite) AS rewrites',
  'SUM(c.idle_rewrite * c.n_total) AS rewrite_nano',
].join(', ');

const BUCKET_SQL: Record<Bucket, string> = {
  hour: "strftime('%s', strftime('%Y-%m-%d %H:00:00', c.ts / 1000, 'unixepoch', 'localtime'), 'utc') * 1000",
  day: "strftime('%s', date(c.ts / 1000, 'unixepoch', 'localtime'), 'utc') * 1000",
  week: "strftime('%s', date(c.ts / 1000, 'unixepoch', 'localtime', '-6 days', 'weekday 1'), 'utc') * 1000",
};

const STACK_KEY: Record<Exclude<Stack, 'type'>, string> = {
  session: 'c.session_id',
  model: "COALESCE(c.model, '(unknown)')",
  agent: AGENT_LABEL,
  project: "COALESCE(s.project, '(unknown)')",
};

const OTHER = '__other';
const STACK_LIMIT = 8;
const PALETTE = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#e53935', '#00acc1', '#fdd835', '#6d4c41', '#bdbdbd'];

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
    sql: 'c.ts >= ? AND c.ts < ? AND (? IS NULL OR s.project = ?) AND (? IS NULL OR c.model = ?)',
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
  return num((db.prepare('SELECT MIN(ts) AS ts FROM calls').get() as Row | undefined)?.ts) || Date.now();
}

export function getFilterOptions(db: DatabaseSync): { projects: string[]; models: string[] } {
  const projects = db
    .prepare(`SELECT s.project AS v FROM calls c JOIN sessions s ON s.id = c.session_id GROUP BY 1 ORDER BY SUM(c.n_total) DESC`)
    .all() as Row[];
  const models = db.prepare('SELECT c.model AS v FROM calls c GROUP BY 1 ORDER BY SUM(c.n_total) DESC').all() as Row[];
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

export function getTimeline(db: DatabaseSync, filters: Filters): Timeline {
  const w = where(filters);
  const bucketSql = BUCKET_SQL[filters.bucket];
  const buckets = bucketRange(filters.fromMs, filters.toMs, filters.bucket);
  const index = new Map(buckets.map((b, i) => [b, i]));
  const scale = filters.metric === 'aic' ? NANO : 1;

  // SQLite and JavaScript can disagree on a bucket start around DST changes; keep any extra bucket.
  const indexOf = (bucket: number): number => {
    let i = index.get(bucket);
    if (i === undefined) {
      buckets.push(bucket);
      buckets.sort((a, b) => a - b);
      index.clear();
      buckets.forEach((b, j) => index.set(b, j));
      i = index.get(bucket)!;
    }
    return i;
  };

  if (filters.stack === 'type') {
    const prefix = filters.metric === 'aic' ? 'n' : 't';
    const rows = db
      .prepare(
        `SELECT ${bucketSql} AS bucket, ${TOKEN_TYPES.map((t) => `SUM(c.${prefix}_${COLUMN[t]}) AS ${prefix}_${COLUMN[t]}`).join(', ')}
         ${FROM} WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`,
      )
      .all(...w.args) as Row[];
    for (const row of rows) indexOf(num(row.bucket));
    const series: TimelineSeries[] = TOKEN_TYPES.map((type) => ({
      id: type,
      label: TOKEN_TYPE_LABELS[type],
      color: TOKEN_TYPE_COLORS[type],
      values: new Array(buckets.length).fill(0),
    }));
    for (const row of rows) {
      const i = index.get(num(row.bucket))!;
      TOKEN_TYPES.forEach((type, s) => (series[s].values[i] = num(row[`${prefix}_${COLUMN[type]}`]) / scale));
    }
    return { buckets, series };
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
      `SELECT ${bucketSql} AS bucket,
              CASE WHEN ${keySql} IN (SELECT value FROM json_each(?)) THEN ${keySql} ELSE '${OTHER}' END AS k,
              SUM(${metricSql}) AS v
       ${FROM} WHERE ${w.sql} GROUP BY bucket, k`,
    )
    .all(JSON.stringify(top), ...w.args) as Row[];
  for (const row of rows) indexOf(num(row.bucket));

  const labels = filters.stack === 'session' ? sessionLabels(db, top) : new Map(top.map((k) => [k, k]));
  const keys = rows.some((r) => r.k === OTHER) ? [...top, OTHER] : top;
  const series: TimelineSeries[] = keys.map((key, i) => ({
    id: key,
    label: key === OTHER ? 'Other' : (labels.get(key) ?? key),
    color: key === OTHER ? PALETTE[PALETTE.length - 1] : PALETTE[i % (PALETTE.length - 1)],
    values: new Array(buckets.length).fill(0),
  }));
  const position = new Map(keys.map((k, i) => [k, i]));
  for (const row of rows) series[position.get(String(row.k))!].values[index.get(num(row.bucket))!] = num(row.v) / scale;
  return { buckets, series };
}

export function getBreakdown(db: DatabaseSync, filters: Filters, dimension: Exclude<Stack, 'type'>, limit = 15): BreakdownRow[] {
  const w = where(filters);
  const rows = db
    .prepare(
      `SELECT ${STACK_KEY[dimension]} AS k, ${SUMS} ${FROM} WHERE ${w.sql} GROUP BY k ORDER BY n_total DESC LIMIT ?`,
    )
    .all(...w.args, limit) as Row[];
  const keys = rows.map((r) => String(r.k));
  const labels = dimension === 'session' ? sessionLabels(db, keys) : null;
  return rows.map((row) => ({ key: String(row.k), label: labels?.get(String(row.k)) ?? String(row.k), ...toTotals(row) }));
}

const SESSION_SELECT = `SELECT c.session_id AS id, s.summary, s.project, s.cwd, s.branch,
    MIN(c.ts) AS first_ts, MAX(c.ts) AS last_ts,
    COUNT(DISTINCT NULLIF(c.agent_id, '')) AS subagents,
    GROUP_CONCAT(DISTINCT c.model) AS models,
    MAX(c.context_tokens) AS peak_context,
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
       HAVING MAX(c.ts) >= ? AND MIN(c.ts) < ? AND (? IS NULL OR SUM(c.model = ?) > 0)
       ORDER BY n_total DESC`,
    )
    .all(filters.project, filters.project, filters.fromMs, filters.toMs, filters.model, filters.model) as Row[];
  return rows.map(toSession);
}

export function getSessionDetail(db: DatabaseSync, id: string): SessionDetail | null {
  const sessionRow = db.prepare(`${SESSION_SELECT} WHERE c.session_id = ? GROUP BY c.session_id`).get(id) as Row | undefined;
  if (!sessionRow) return null;

  const calls = (
    db
      .prepare(
        `SELECT c.*, ${AGENT_LABEL} AS agent ${FROM} WHERE c.session_id = ? ORDER BY c.ts, c.id`,
      )
      .all(id) as Row[]
  ).map(
    (row): CallRow => ({
      id: num(row.id),
      ts: num(row.ts),
      agentId: String(row.agent_id),
      agent: String(row.agent),
      model: str(row.model) ?? '(unknown)',
      initiator: str(row.initiator),
      effort: str(row.reasoning_effort),
      durationMs: row.duration_ms === null ? null : num(row.duration_ms),
      context: num(row.context_tokens),
      tokens: byType(row, 't'),
      aic: byType(row, 'n', NANO),
      aicTotal: num(row.n_total) / NANO,
      gapS: row.gap_s === null ? null : num(row.gap_s),
      idleRewrite: num(row.idle_rewrite) === 1,
    }),
  );

  const agents = (
    db
      .prepare(
        `SELECT c.agent_id, ${AGENT_LABEL} AS name, a.execution_mode, GROUP_CONCAT(DISTINCT c.model) AS models,
                MIN(c.ts) AS first_ts, MAX(c.ts) AS last_ts, MAX(c.context_tokens) AS peak_context, ${SUMS}
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

  return { session: toSession(sessionRow), calls, agents };
}
