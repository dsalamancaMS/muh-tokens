'use client';

import { useOptimistic, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import RouterLink from './RouterLink';
import { pathWithFilters, sessionHref, type Filters, type Metric, type Stack as StackBy, type View } from '@/lib/filters';
import { LOCALE, formatAic, formatBucket, formatDateTime, formatDuration, formatPct, formatTokens } from '@/lib/format';
import type { BreakdownRow, Timeline } from '@/lib/types';

const GROUP_LABELS: Record<StackBy, string> = {
  type: 'Token type',
  session: 'Session',
  project: 'Project',
  model: 'Model',
  agent: 'Agent',
};
const CONTRIBUTOR_TITLES: Record<StackBy, string> = {
  type: 'Top sessions',
  session: 'Top sessions',
  project: 'Top projects',
  model: 'Top models',
  agent: 'Top agents',
};
const VIEW_LABELS: Record<View, string> = { bars: 'Bars', lines: 'Lines', area: 'Area', cumulative: 'Cumulative' };
const STEP_LABELS: Record<Filters['bucketParam'], string> = { auto: 'Auto', hour: 'Hour', day: 'Day', week: 'Week' };
const DAY_MS = 86_400_000;
const OTHER = '__other';

function runningTotal(values: number[]): number[] {
  let total = 0;
  return values.map((value) => (total += value));
}

function formatTick(ms: number, stepMinutes: number, spanMs: number): string {
  const d = new Date(ms);
  if (stepMinutes >= 1440 || spanMs > 7 * DAY_MS) return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
  if (spanMs <= DAY_MS) return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit' });
}

interface Props {
  timeline: Timeline;
  filters: Filters;
  contributors: BreakdownRow[];
  // Credits in the whole range, for the contributors' share.
  totalAic: number;
}

export default function UsageChart({ timeline, filters, contributors, totalAic }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const current = { metric: filters.metric, stack: filters.stack, view: filters.view, bucketParam: filters.bucketParam };
  // The controls switch at once. The chart keeps its labels and data from `filters` until the new data arrives.
  const [controls, setControls] = useOptimistic(current);
  const back = pathWithFilters(pathname, filters);

  const change = (next: Partial<typeof current>) => {
    const updated = { ...controls, ...next };
    startTransition(() => {
      setControls(updated);
      router.replace(pathWithFilters(pathname, { ...filters, ...updated }), { scroll: false });
    });
  };

  const { metric, stack, view } = filters;
  const format = metric === 'aic' ? formatAic : formatTokens;
  const unit = metric === 'aic' ? 'AIC' : 'tokens';
  const minutes = timeline.bucketMinutes;
  const spanMs = filters.toMs - filters.fromMs;
  const totals = timeline.buckets.map((_, i) => timeline.series.reduce((sum, s) => sum + s.values[i], 0));
  const totalByBucket = new Map(timeline.buckets.map((bucket, i) => [bucket, totals[i]]));
  const empty = totals.every((value) => value === 0);

  const tooltipHeader = (ms: number) => {
    const label = minutes >= 60 ? formatBucket(ms, minutes) : formatDateTime(ms);
    const total = totalByBucket.get(ms) ?? 0;
    return view === 'cumulative' ? label : `${label}, total ${format(total)} ${unit}`;
  };
  const axisFormatter = (ms: number, location: string) => (location === 'tick' ? formatTick(ms, minutes, spanMs) : tooltipHeader(ms));

  const openSession = (seriesId: string | number | undefined) => {
    if (stack === 'session' && seriesId !== undefined && seriesId !== OTHER) router.push(sessionHref(String(seriesId), back));
  };

  const series = timeline.series.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    valueFormatter: (value: number | null) => (value ? `${format(value)} ${unit}` : null),
  }));
  const legend = { toggleVisibilityOnClick: true, position: { vertical: 'bottom', horizontal: 'center' } } as const;
  const tooltip = { trigger: 'axis', sort: 'desc' } as const;
  const yAxis = [{ valueFormatter: (value: number) => formatTokens(value), width: 48 }];

  const stepText = view === 'bars' || filters.bucketParam !== 'auto' ? `per ${filters.bucket}` : `${formatDuration(minutes * 60_000)} steps`;
  const title = `${metric === 'aic' ? 'AI credits' : 'Tokens'} by ${GROUP_LABELS[stack].toLowerCase()}`;
  const colorByKey = new Map(timeline.series.map((s) => [s.id, s.color]));
  const contributorDim = stack === 'type' ? 'session' : stack;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap sx={{ alignItems: { md: 'center' }, mb: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" component="h2">
              {title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {view === 'cumulative' ? 'Running total' : stepText}. Click a legend item to hide it.
              {stack === 'session' ? ' Click a series to open the session.' : ''}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={controls.metric}
              onChange={(_, next: Metric | null) => next && change({ metric: next })}
              aria-label="Metric"
            >
              <ToggleButton value="aic">AIC</ToggleButton>
              <ToggleButton value="tokens">Tokens</ToggleButton>
            </ToggleButtonGroup>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="group-label">Group by</InputLabel>
              <Select labelId="group-label" label="Group by" value={controls.stack} onChange={(e) => change({ stack: e.target.value as StackBy })}>
                {Object.entries(GROUP_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={controls.view}
              onChange={(_, next: View | null) => next && change({ view: next })}
              aria-label="Chart view"
            >
              {Object.entries(VIEW_LABELS).map(([value, label]) => (
                <ToggleButton key={value} value={value} sx={{ px: 1.25 }}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel id="step-label">Step</InputLabel>
              <Select
                labelId="step-label"
                label="Step"
                value={controls.bucketParam}
                onChange={(e) => change({ bucketParam: e.target.value as Filters['bucketParam'] })}
              >
                {Object.entries(STEP_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Stack>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 9 }}>
            <Box
              sx={{ height: { xs: 320, md: 400 }, position: 'relative', opacity: pending ? 0.45 : 1, transition: 'opacity 150ms' }}
              aria-busy={pending}
            >
              {empty ? (
                <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>No calls in this range.</Box>
              ) : view === 'bars' ? (
                <BarChart
                  skipAnimation
                  xAxis={[
                    {
                      scaleType: 'band',
                      data: timeline.buckets,
                      tickLabelMinGap: 12,
                      valueFormatter: (value: number, context) => axisFormatter(value, context.location),
                    },
                  ]}
                  yAxis={yAxis}
                  series={series.map((s, i) => ({ ...s, data: timeline.series[i].values, stack: 'total' }))}
                  onItemClick={(_, item) => openSession(item.seriesId)}
                  slotProps={{ legend, tooltip }}
                />
              ) : (
                <LineChart
                  margin={{ right: 40 }}
                  skipAnimation
                  xAxis={[
                    {
                      scaleType: 'time',
                      data: timeline.buckets.map((ms) => new Date(ms)),
                      tickNumber: 8,
                      tickLabelMinGap: 12,
                      valueFormatter: (value: Date, context) => axisFormatter(value.getTime(), context.location),
                    },
                  ]}
                  yAxis={yAxis}
                  series={series.map((s, i) => ({
                    ...s,
                    data: view === 'cumulative' ? runningTotal(timeline.series[i].values) : timeline.series[i].values,
                    showMark: false,
                    curve: view === 'cumulative' ? ('stepAfter' as const) : ('linear' as const),
                    area: view === 'area',
                    stack: view === 'area' ? 'total' : undefined,
                  }))}
                  onLineClick={(_, item) => openSession(item.seriesId)}
                  onAreaClick={(_, item) => openSession(item.seriesId)}
                  slotProps={{ legend, tooltip }}
                />
              )}
            </Box>
          </Grid>
          <Grid size={{ xs: 12, lg: 3 }} sx={{ borderLeft: { lg: 1 }, borderColor: { lg: 'divider' }, pl: { lg: 3 } }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {CONTRIBUTOR_TITLES[stack]}
            </Typography>
            <Stack spacing={1.25}>
              {contributors.map((row) => {
                const share = totalAic ? row.aicTotal / totalAic : 0;
                const color = stack === contributorDim ? (colorByKey.get(row.key) ?? 'text.secondary') : 'primary.main';
                const label =
                  contributorDim === 'session' ? (
                    <RouterLink href={sessionHref(row.key, back)} underline="hover" color="inherit">
                      {row.label}
                    </RouterLink>
                  ) : contributorDim === 'project' || contributorDim === 'model' ? (
                    <Link
                      component="button"
                      underline="hover"
                      color="inherit"
                      onClick={() => router.push(pathWithFilters(pathname, { ...filters, [contributorDim]: row.key }), { scroll: false })}
                      title={`Show only ${row.key}`}
                      sx={{ font: 'inherit', textAlign: 'left', verticalAlign: 'baseline' }}
                    >
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  );
                return (
                  <Box key={row.key}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                      <Typography variant="body2" noWrap title={row.label} sx={{ flexGrow: 1, minWidth: 0 }}>
                        {label}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatAic(row.aicTotal)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', width: 40, textAlign: 'right' }}>
                        {formatPct(share, 1)}
                      </Typography>
                    </Stack>
                    {row.detail && (
                      <Typography variant="caption" component="div" noWrap sx={{ color: 'text.secondary' }}>
                        {row.detail}
                      </Typography>
                    )}
                    <Box sx={{ mt: 0.5, height: 4, borderRadius: 2, bgcolor: 'action.hover', overflow: 'hidden' }}>
                      <Box sx={{ width: `${Math.max(1, share * 100)}%`, height: '100%', bgcolor: color }} />
                    </Box>
                  </Box>
                );
              })}
              {contributors.length === 0 && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Nothing in this range.
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" component="p" sx={{ mt: 1.5, color: 'text.secondary' }}>
              AIC and share of credits in the range.
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
