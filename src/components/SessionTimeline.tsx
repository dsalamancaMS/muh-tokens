'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import {
  BarPlot,
  ChartsAxisHighlight,
  ChartsDataProvider,
  ChartsGrid,
  ChartsLegend,
  ChartsSurface,
  ChartsTooltip,
  ChartsWrapper,
  ChartsXAxis,
  ChartsYAxis,
  LinePlot,
} from '@mui/x-charts';
import { TOKEN_TYPE_COLORS, TOKEN_TYPE_LABELS, TOKEN_TYPES } from '@/lib/cost';
import { formatAic, formatBucket, formatTokens, formatDuration } from '@/lib/format';
import type { SessionBuckets } from '@/lib/sessionTimeline';
import type { Metric } from '@/lib/filters';

// Per-bucket usage by token type, with the running AIC total on a second axis.
export default function SessionTimeline({ buckets }: { buckets: SessionBuckets }) {
  const [metric, setMetric] = useState<Metric>('aic');
  const values = metric === 'aic' ? buckets.aic : buckets.tokens;
  const format = metric === 'aic' ? formatAic : formatTokens;

  const series = [
    ...TOKEN_TYPES.map((type) => ({
      type: 'bar' as const,
      id: type,
      label: TOKEN_TYPE_LABELS[type],
      color: TOKEN_TYPE_COLORS[type],
      data: values.map((bucket) => bucket[type]),
      stack: 'total',
      yAxisId: 'value',
      valueFormatter: (value: number | null) => (value ? format(value) : null),
    })),
    ...(metric === 'aic'
      ? [
          {
            type: 'line' as const,
            id: 'rewrites',
            label: 'Idle rewrite AIC',
            color: '#e53935',
            data: buckets.rewriteAic.map((value) => value || null),
            yAxisId: 'value',
            showMark: true,
            valueFormatter: (value: number | null) => (value ? formatAic(value) : null),
          },
          {
            type: 'line' as const,
            id: 'cumulative',
            label: 'Running total AIC',
            color: '#7a7a7a',
            data: buckets.cumulativeAic,
            yAxisId: 'cumulative',
            showMark: false,
            valueFormatter: (value: number | null) => (value === null ? null : formatAic(value)),
          },
        ]
      : []),
  ];

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="h2">
              Usage over time
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {formatDuration(buckets.stepMinutes * 60_000)} steps by token type. Red points are credits spent on idle cache rewrites.
            </Typography>
          </Box>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={metric}
            onChange={(_, value: Metric | null) => value && setMetric(value)}
            aria-label="Metric"
          >
            <ToggleButton value="aic">AIC</ToggleButton>
            <ToggleButton value="tokens">Tokens</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Box sx={{ height: { xs: 300, md: 380 } }}>
          <ChartsDataProvider
            series={series}
            xAxis={[
              {
                id: 'time',
                scaleType: 'band',
                data: buckets.starts,
                valueFormatter: (value: number) => formatBucket(value, buckets.stepMinutes),
              },
            ]}
            yAxis={[
              { id: 'value', width: 48, valueFormatter: (value: number) => formatTokens(value) },
              { id: 'cumulative', position: 'right', width: 48, valueFormatter: (value: number) => formatTokens(value) },
            ]}
            skipAnimation
          >
            <ChartsWrapper legendPosition={{ vertical: 'bottom', horizontal: 'center' }}>
              <ChartsLegend toggleVisibilityOnClick />
              <ChartsSurface>
                <ChartsGrid horizontal />
                <BarPlot />
                <LinePlot />
                <ChartsAxisHighlight x="band" />
                <ChartsXAxis axisId="time" />
                <ChartsYAxis axisId="value" />
                {metric === 'aic' && <ChartsYAxis axisId="cumulative" />}
              </ChartsSurface>
              <ChartsTooltip trigger="axis" sort="desc" />
            </ChartsWrapper>
          </ChartsDataProvider>
        </Box>
      </CardContent>
    </Card>
  );
}
