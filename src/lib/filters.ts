export const PRESETS = ['24h', '7d', '30d', '90d', 'all', 'custom'] as const;
export type Preset = (typeof PRESETS)[number];
export const BUCKETS = ['hour', 'day', 'week'] as const;
export type Bucket = (typeof BUCKETS)[number];
export const STACKS = ['type', 'session', 'model', 'agent', 'project'] as const;
export type Stack = (typeof STACKS)[number];
export const METRICS = ['aic', 'tokens'] as const;
export type Metric = (typeof METRICS)[number];
export const CHARTS = ['line', 'area', 'cumulative'] as const;
export type Chart = (typeof CHARTS)[number];

export interface Filters {
  preset: Preset;
  fromMs: number;
  toMs: number;
  from: string;
  to: string;
  bucket: Bucket;
  bucketParam: Bucket | 'auto';
  project: string | null;
  model: string | null;
  stack: Stack;
  metric: Metric;
  chart: Chart;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const DAY_MS = 86_400_000;
const PRESET_MS: Record<string, number> = { '24h': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS, '90d': 90 * DAY_MS };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// Parses YYYY-MM-DD as local midnight.
export function parseLocalDate(value: string | undefined): number | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function formatLocalDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function autoBucket(spanMs: number): Bucket {
  if (spanMs <= 3 * DAY_MS) return 'hour';
  if (spanMs <= 180 * DAY_MS) return 'day';
  return 'week';
}

// `earliestMs` is the first recorded call, used for the "all" preset.
export function parseFilters(params: SearchParams, now: number, earliestMs: number): Filters {
  let preset = oneOf(first(params.range), PRESETS, '7d');
  let fromMs: number;
  let toMs = now;
  if (preset === 'custom') {
    const from = parseLocalDate(first(params.from));
    const to = parseLocalDate(first(params.to));
    if (from === null || to === null || to < from) {
      preset = '7d';
      fromMs = now - PRESET_MS['7d'];
    } else {
      fromMs = from;
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      toMs = end.getTime();
    }
  } else if (preset === 'all') {
    fromMs = Math.min(earliestMs, now);
  } else {
    fromMs = now - PRESET_MS[preset];
  }

  const bucketParam = oneOf(first(params.bucket), [...BUCKETS, 'auto'] as const, 'auto');
  const lastDay = new Date(toMs - 1);
  return {
    preset,
    fromMs,
    toMs,
    from: formatLocalDate(fromMs),
    to: formatLocalDate(lastDay.getTime()),
    bucket: bucketParam === 'auto' ? autoBucket(toMs - fromMs) : bucketParam,
    bucketParam,
    project: first(params.project) || null,
    model: first(params.model) || null,
    stack: oneOf(first(params.stack), STACKS, 'type'),
    metric: oneOf(first(params.metric), METRICS, 'aic'),
    chart: oneOf(first(params.chart), CHARTS, 'line'),
  };
}

// Start of the local hour, day or ISO week (Monday) that contains `ms`.
export function bucketStart(ms: number, bucket: Bucket): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  if (bucket === 'hour') return d.getTime();
  d.setHours(0);
  if (bucket === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function nextBucket(ms: number, bucket: Bucket): number {
  const d = new Date(ms);
  if (bucket === 'hour') d.setHours(d.getHours() + 1);
  else d.setDate(d.getDate() + (bucket === 'week' ? 7 : 1));
  return d.getTime();
}

export function bucketRange(fromMs: number, toMs: number, bucket: Bucket): number[] {
  const starts: number[] = [];
  for (let ms = bucketStart(fromMs, bucket); ms < toMs; ms = nextBucket(ms, bucket)) starts.push(ms);
  return starts;
}

export function filtersToParams(filters: Partial<Filters>): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.preset && filters.preset !== '7d') params.set('range', filters.preset);
  if (filters.preset === 'custom') {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  if (filters.bucketParam && filters.bucketParam !== 'auto') params.set('bucket', filters.bucketParam);
  if (filters.project) params.set('project', filters.project);
  if (filters.model) params.set('model', filters.model);
  if (filters.stack && filters.stack !== 'type') params.set('stack', filters.stack);
  if (filters.metric && filters.metric !== 'aic') params.set('metric', filters.metric);
  if (filters.chart && filters.chart !== 'line') params.set('chart', filters.chart);
  return params;
}
