'use client';

import { useOptimistic, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { LineChart } from '@mui/x-charts/LineChart';
import { filtersToParams, type Chart, type Filters } from '@/lib/filters';
import { LOCALE, formatAic, formatBucket, formatDateTime, formatDuration, formatTokens } from '@/lib/format';
import type { Timeline } from '@/lib/types';

const CHART_LABELS: Record<Chart, string> = { line: 'Line', area: 'Stacked area', cumulative: 'Cumulative' };
const DAY_MS = 86_400_000;

function runningTotal(values: number[]): number[] {
  let total = 0;
  return values.map((value) => (total += value));
}

// The same series as the bar chart on a continuous time axis, at a finer step.
export default function TimeChart({ timeline, filters }: { timeline: Timeline; filters: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [chart, setChart] = useOptimistic(filters.chart);
  const format = filters.metric === 'aic' ? formatAic : formatTokens;
  const minutes = timeline.bucketMinutes;
  const spanMs = filters.toMs - filters.fromMs;

  const change = (next: Chart | null) => {
    if (!next) return;
    const query = filtersToParams({ ...filters, chart: next }).toString();
    startTransition(() => {
      setChart(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const openSession = (seriesId: string | number | undefined) => {
    if (filters.stack === 'session' && seriesId !== undefined && seriesId !== '__other') router.push(`/sessions/${seriesId}`);
  };

  const formatTick = (ms: number) =>
    spanMs > 2 * DAY_MS
      ? new Date(ms).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })
      : new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">
              {filters.metric === 'aic' ? 'AI credits' : 'Tokens'} over time
              {chart === 'cumulative' ? ', running total' : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDuration(minutes * 60_000)} steps. Uses the metric and stack-by settings above.
            </Typography>
          </Box>
          <ToggleButtonGroup size="small" exclusive value={chart} onChange={(_, next: Chart | null) => change(next)} aria-label="Chart type">
            {Object.entries(CHART_LABELS).map(([value, label]) => (
              <ToggleButton key={value} value={value}>
                {label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
        <Box sx={{ height: 400 }}>
          <LineChart
            skipAnimation
            xAxis={[
              {
                scaleType: 'time',
                data: timeline.buckets.map((ms) => new Date(ms)),
                tickNumber: 8,
                valueFormatter: (value: Date, context) =>
                  context.location === 'tick'
                    ? formatTick(value.getTime())
                    : minutes >= 1440
                      ? formatBucket(value.getTime(), minutes)
                      : formatDateTime(value.getTime()),
              },
            ]}
            yAxis={[{ valueFormatter: (value: number) => format(value), width: 64 }]}
            series={timeline.series.map((series) => ({
              id: series.id,
              label: series.label,
              color: series.color,
              data: chart === 'cumulative' ? runningTotal(series.values) : series.values,
              showMark: false,
              area: chart === 'area',
              stack: chart === 'area' ? 'total' : undefined,
              valueFormatter: (value: number | null) => (value ? format(value) : null),
            }))}
            onLineClick={(_, item) => openSession(item.seriesId)}
            onAreaClick={(_, item) => openSession(item.seriesId)}
            slotProps={{ legend: { position: { vertical: 'bottom', horizontal: 'center' } } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
