import { TOKEN_TYPES } from './cost.ts';
import type { ByType, CallRow } from './types.ts';

const STEPS_MINUTES = [1, 5, 15, 30, 60, 180, 360, 1440];

export function pickStepMinutes(spanMs: number, maxBuckets = 160): number {
  return STEPS_MINUTES.find((step) => spanMs / (step * 60_000) <= maxBuckets) ?? 1440;
}

// Floors to a local-time step boundary, so hour and day steps line up with the clock.
export function floorToStep(ms: number, stepMinutes: number): number {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  if (stepMinutes >= 1440) {
    d.setHours(0, 0);
  } else if (stepMinutes >= 60) {
    const hours = stepMinutes / 60;
    d.setHours(Math.floor(d.getHours() / hours) * hours, 0);
  } else {
    d.setMinutes(Math.floor(d.getMinutes() / stepMinutes) * stepMinutes);
  }
  return d.getTime();
}

function nextStep(ms: number, stepMinutes: number): number {
  const d = new Date(ms);
  if (stepMinutes >= 1440) d.setDate(d.getDate() + stepMinutes / 1440);
  else d.setMinutes(d.getMinutes() + stepMinutes);
  return floorToStep(d.getTime(), stepMinutes);
}

function zero(): ByType {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
}

export interface SessionBuckets {
  stepMinutes: number;
  starts: number[];
  aic: ByType[];
  tokens: ByType[];
  rewriteAic: number[];
  cumulativeAic: number[];
}

export function bucketCalls(calls: CallRow[], stepMinutes?: number): SessionBuckets {
  if (calls.length === 0) return { stepMinutes: 1, starts: [], aic: [], tokens: [], rewriteAic: [], cumulativeAic: [] };
  const firstTs = calls[0].ts;
  const lastTs = calls[calls.length - 1].ts;
  const step = stepMinutes ?? pickStepMinutes(lastTs - firstTs);

  const starts: number[] = [];
  const end = floorToStep(lastTs, step);
  for (let ms = floorToStep(firstTs, step); ms <= end; ms = nextStep(ms, step)) {
    if (starts.length > 0 && ms <= starts[starts.length - 1]) break;
    starts.push(ms);
  }
  const index = new Map(starts.map((ms, i) => [ms, i]));
  const aic = starts.map(zero);
  const tokens = starts.map(zero);
  const rewriteAic = starts.map(() => 0);

  for (const call of calls) {
    const i = index.get(floorToStep(call.ts, step));
    if (i === undefined) continue;
    for (const type of TOKEN_TYPES) {
      aic[i][type] += call.aic[type];
      tokens[i][type] += call.tokens[type];
    }
    if (call.idleRewrite) rewriteAic[i] += call.aicTotal;
  }

  let running = 0;
  const cumulativeAic = aic.map((bucket) => {
    running += TOKEN_TYPES.reduce((total, type) => total + bucket[type], 0);
    return running;
  });
  return { stepMinutes: step, starts, aic, tokens, rewriteAic, cumulativeAic };
}
