import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketRange, filtersToParams, parseFilters } from './filters.ts';
import { bucketSlices, pickStepMinutes, stepRange } from './sessionTimeline.ts';
import type { UsageSlice } from './types.ts';

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

test('pickStepMinutes keeps a timeline to at most 160 buckets and never goes below the 5-minute rollup', () => {
  assert.equal(pickStepMinutes(60 * 60_000), 5);
  assert.equal(pickStepMinutes(10 * 60 * 60_000), 5);
  assert.equal(pickStepMinutes(8 * DAY), 180);
});

test('stepRange starts at the step containing the start and stops before the end', () => {
  const from = new Date(2026, 10, 19, 10, 7).getTime();
  const to = new Date(2026, 10, 19, 11, 0).getTime();
  assert.deepEqual(
    stepRange(from, to, 15),
    [0, 15, 30, 45].map((minute) => new Date(2026, 10, 19, 10, minute).getTime()),
  );
});

test('bucketSlices sums each type per step and tracks rewrites and the running total', () => {
  const zero = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  const slice = (minute: number, aic: number, rewriteAic = 0): UsageSlice => ({
    ts: new Date(2026, 10, 19, 10, minute).getTime(),
    agentId: '',
    agent: 'main agent',
    model: 'm',
    calls: 1,
    maxContext: 0,
    tokens: { ...zero, cacheRead: 10 },
    aic: { ...zero, cacheRead: aic },
    aicTotal: aic,
    rewriteAic,
  });
  const buckets = bucketSlices([slice(0, 1), slice(5, 2), slice(30, 4, 4)], 15);
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
