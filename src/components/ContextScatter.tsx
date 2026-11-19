'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { ScatterChart } from '@mui/x-charts/ScatterChart';
import { formatDateTime, formatTokens } from '@/lib/format';

export interface ContextSeries {
  id: string;
  label: string;
  // [timestamp ms, context tokens] pairs.
  points: [number, number][];
}

const REWRITE_COLOR = '#d32f2f';

// Largest context per agent in each 5-minute bucket. Idle cache rewrites are drawn on top in red.
export default function ContextScatter({ series, rewrites }: { series: ContextSeries[]; rewrites: [number, number][] }) {
  const toData = (points: [number, number][]) => points.map(([x, y]) => ({ x, y }));
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6">Context size</Typography>
        <Typography variant="body2" color="text.secondary">
          Largest input sent by each agent in each 5-minute period. Red points are idle cache rewrites: the call came 5 minutes or more
          after the same agent&apos;s previous call, so the prompt cache had expired and the context was written again.
        </Typography>
        <Box sx={{ height: 380 }}>
          <ScatterChart
            skipAnimation
            renderer="svg-batch"
            xAxis={[{ scaleType: 'time', valueFormatter: (value: Date | number) => formatDateTime(Number(value)) }]}
            yAxis={[{ width: 64, valueFormatter: (value: number) => formatTokens(value) }]}
            series={[
              ...series.map((s) => ({
                id: s.id,
                label: s.label,
                data: toData(s.points),
                markerSize: 2,
                valueFormatter: (value: { x: number; y: number } | null) =>
                  value ? `up to ${formatTokens(value.y)} tokens at ${formatDateTime(value.x)}` : '',
              })),
              {
                id: '__rewrites',
                label: 'Idle cache rewrite',
                color: REWRITE_COLOR,
                data: toData(rewrites),
                markerSize: 5,
                valueFormatter: (value: { x: number; y: number } | null) =>
                  value ? `${formatTokens(value.y)} tokens rewritten at ${formatDateTime(value.x)}` : '',
              },
            ]}
            slotProps={{ legend: { position: { vertical: 'bottom', horizontal: 'center' } } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
