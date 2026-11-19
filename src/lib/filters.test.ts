import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketRange, filtersToParams, parseFilters } from './filters.ts';
import { bucketCalls, pickStepMinutes } from './sessionTimeline.ts';
import type { CallRow } from './types.ts';

const DAY = 86_400_000;
const now = new Date(2026, 10, 19, 15, 30).getTime();

test('parseFilters defaults to the last 7 days with hourly or daily buckets chosen from the span', () => {
  const filters = parseFilters({}, now, 0);
  assert.equal(filters.preset, '7d');
  assert.equal(filters.toMs - filters.fromMs, 7 * DAY);
  assert.equal(filters.bucket, 'day');
  assert.equal(parseFilters({ range: '24h' }, now, 0).bucket, 'hour');
  assert.equal(parseFilters({ range: 'all' }, now, now - 400 * DAY).bucket, 'week');
});

test('parseFilters treats a custom "to" date as inclusive and rejects reversed ranges', () => {
  const filters = parseFilters({ range: 'custom', from: '2026-11-01', to: '2026-11-03' }, now, 0);
  assert.equal(filters.fromMs, new Date(2026, 10, 1).getTime());
  assert.equal(filters.toMs, new Date(2026, 10, 4).getTime());
  assert.equal(filters.to, '2026-11-03');
  assert.equal(parseFilters({ range: 'custom', from: '2026-11-05', to: '2026-11-03' }, now, 0).preset, '7d');
});

test('filtersToParams writes only the values that differ from the defaults', () => {
  const filters = parseFilters({ range: '30d', stack: 'model', metric: 'tokens', project: 'AKSpider' }, now, 0);
  const params = filtersToParams(filters);
  assert.equal(params.toString(), 'range=30d&project=AKSpider&stack=model&metric=tokens');
  assert.equal(filtersToParams(parseFilters({}, now, 0)).toString(), '');
});

test('bucketRange covers the range with local day starts', () => {
  const from = new Date(2026, 10, 1, 13).getTime();
  const to = new Date(2026, 10, 4, 2).getTime();
  assert.deepEqual(
    bucketRange(from, to, 'day'),
    [1, 2, 3, 4].map((day) => new Date(2026, 10, day).getTime()),
  );
});

test('pickStepMinutes keeps a session timeline to at most 160 buckets', () => {
  assert.equal(pickStepMinutes(60 * 60_000), 1);
  assert.equal(pickStepMinutes(10 * 60 * 60_000), 5);
  assert.equal(pickStepMinutes(8 * DAY), 180);
});

test('bucketCalls sums each type per bucket and tracks rewrites and the running total', () => {
  const zero = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  const call = (minute: number, aic: number, idleRewrite = false): CallRow => ({
    id: minute,
    ts: new Date(2026, 10, 19, 10, minute).getTime(),
    agentId: '',
    agent: 'main agent',
    model: 'm',
    initiator: null,
    effort: null,
    durationMs: null,
    context: 0,
    tokens: { ...zero, cacheRead: 10 },
    aic: { ...zero, cacheRead: aic },
    aicTotal: aic,
    gapS: null,
    idleRewrite,
  });
  const buckets = bucketCalls([call(0, 1), call(3, 2), call(12, 4, true)], 5);
  assert.equal(buckets.starts.length, 3);
  assert.deepEqual(
    buckets.aic.map((b) => b.cacheRead),
    [3, 0, 4],
  );
  assert.deepEqual(
    buckets.tokens.map((b) => b.cacheRead),
    [20, 0, 10],
  );
  assert.deepEqual(buckets.rewriteAic, [0, 0, 4]);
  assert.deepEqual(buckets.cumulativeAic, [3, 3, 7]);
});
