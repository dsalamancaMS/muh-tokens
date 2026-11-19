'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { ScatterChart } from '@mui/x-charts/ScatterChart';
import { formatDateTime, formatShortDateTime, formatTokens } from '@/lib/format';

export interface ContextSeries {
  id: string;
  label: string;
  color: string;
  // [timestamp ms, context tokens] pairs.
  points: [number, number][];
}

const REWRITE_COLOR = '#e53935';

// Largest context per agent in each 5-minute bucket. Idle cache rewrites are drawn on top, larger and in red.
export default function ContextScatter({ series, rewrites }: { series: ContextSeries[]; rewrites: [number, number][] }) {
  const toData = (points: [number, number][]) => points.map(([x, y]) => ({ x, y }));
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Typography variant="h6" component="h2">
          Context size
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Largest input sent by each agent in each 5-minute period. The busiest agents have their own colour, the rest are grey. Red
          points are idle cache rewrites.
        </Typography>
        <Box sx={{ height: { xs: 300, md: 360 } }}>
          <ScatterChart
            skipAnimation
            renderer="svg-batch"
            xAxis={[
              {
                scaleType: 'time',
                tickLabelMinGap: 24,
                valueFormatter: (value: Date | number, context) =>
                  context.location === 'tick' ? formatShortDateTime(Number(value)) : formatDateTime(Number(value)),
              },
            ]}
            yAxis={[{ width: 56, valueFormatter: (value: number) => formatTokens(value) }]}
            series={[
              ...series.map((s) => ({
                id: s.id,
                label: s.label,
                color: s.color,
                data: toData(s.points),
                markerSize: 2.5,
                valueFormatter: (value: { x: number; y: number } | null) =>
                  value ? `up to ${formatTokens(value.y)} tokens at ${formatDateTime(value.x)}` : '',
              })),
              {
                id: '__rewrites',
                label: 'Idle cache rewrite',
                color: REWRITE_COLOR,
                data: toData(rewrites),
                markerSize: 6,
                valueFormatter: (value: { x: number; y: number } | null) =>
                  value ? `${formatTokens(value.y)} tokens rewritten at ${formatDateTime(value.x)}` : '',
              },
            ]}
            slotProps={{ legend: { toggleVisibilityOnClick: true, position: { vertical: 'bottom', horizontal: 'center' } } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
