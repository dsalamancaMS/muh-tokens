'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { filtersToParams, type Filters, type Metric, type Stack as StackBy } from '@/lib/filters';
import { formatAic, formatBucket, formatTokens } from '@/lib/format';
import type { Timeline } from '@/lib/types';

const STACK_LABELS: Record<StackBy, string> = {
  type: 'Token type',
  session: 'Session',
  model: 'Model',
  agent: 'Agent',
  project: 'Project',
};

export default function TimelineChart({ timeline, filters }: { timeline: Timeline; filters: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const format = filters.metric === 'aic' ? formatAic : formatTokens;
  const minutes = timeline.bucketMinutes;

  const apply = (change: Partial<Filters>) => {
    const query = filtersToParams({ ...filters, ...change }).toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {filters.metric === 'aic' ? 'AI credits' : 'Tokens'} per {filters.bucket}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filters.metric}
            onChange={(_, metric: Metric | null) => metric && apply({ metric })}
            aria-label="Metric"
          >
            <ToggleButton value="aic">AIC</ToggleButton>
            <ToggleButton value="tokens">Tokens</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="stack-label">Stack by</InputLabel>
            <Select
              labelId="stack-label"
              label="Stack by"
              value={filters.stack}
              onChange={(e) => apply({ stack: e.target.value as StackBy })}
            >
              {Object.entries(STACK_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
        {filters.stack === 'session' && (
          <Typography variant="body2" color="text.secondary">
            Click a bar segment to open the session.
          </Typography>
        )}
        <Box sx={{ height: 400 }}>
          <BarChart
            skipAnimation
            xAxis={[
              {
                scaleType: 'band',
                data: timeline.buckets,
                valueFormatter: (value: number) => formatBucket(value, minutes),
              },
            ]}
            yAxis={[{ valueFormatter: (value: number) => format(value), width: 64 }]}
            series={timeline.series.map((series) => ({
              id: series.id,
              label: series.label,
              data: series.values,
              color: series.color,
              stack: 'total',
              valueFormatter: (value: number | null) => (value ? format(value) : null),
            }))}
            onItemClick={(_, item) => {
              if (filters.stack === 'session' && item.seriesId !== '__other') router.push(`/sessions/${item.seriesId}`);
            }}
            slotProps={{ legend: { position: { vertical: 'bottom', horizontal: 'center' } } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
