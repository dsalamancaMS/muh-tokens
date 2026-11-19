'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { filtersToParams, type Filters, type Preset } from '@/lib/filters';
import { formatTime } from '@/lib/format';
import type { SyncStatus } from '@/lib/types';

const PRESET_LABELS: [Preset, string][] = [
  ['24h', '24h'],
  ['7d', '7d'],
  ['30d', '30d'],
  ['90d', '90d'],
  ['all', 'All'],
  ['custom', 'Custom'],
];

interface Props {
  filters: Filters;
  projects: string[];
  models: string[];
  sync: SyncStatus;
  showBucket?: boolean;
}

export default function FiltersBar({ filters, projects, models, sync, showBucket = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState({ from: filters.from, to: filters.to });

  const apply = (change: Partial<Filters>) => {
    const query = filtersToParams({ ...filters, ...change }).toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  };

  return (
    <Stack spacing={1} sx={{ mb: 3 }}>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filters.preset}
          onChange={(_, preset: Preset | null) => {
            if (!preset) return;
            if (preset === 'custom') apply({ preset, from: custom.from, to: custom.to });
            else apply({ preset });
          }}
          aria-label="Time range"
        >
          {PRESET_LABELS.map(([value, label]) => (
            <ToggleButton key={value} value={value} sx={{ px: 1.5 }}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {filters.preset === 'custom' && (
          <>
            <TextField
              size="small"
              type="date"
              label="From"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              onBlur={() => apply({ preset: 'custom', ...custom })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              onBlur={() => apply({ preset: 'custom', ...custom })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </>
        )}
        {showBucket && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="bucket-label">Bucket</InputLabel>
            <Select
              labelId="bucket-label"
              label="Bucket"
              value={filters.bucketParam}
              onChange={(e) => apply({ bucketParam: e.target.value as Filters['bucketParam'] })}
            >
              <MenuItem value="auto">Auto ({filters.bucket})</MenuItem>
              <MenuItem value="hour">Hour</MenuItem>
              <MenuItem value="day">Day</MenuItem>
              <MenuItem value="week">Week</MenuItem>
            </Select>
          </FormControl>
        )}
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="project-label">Project</InputLabel>
          <Select
            labelId="project-label"
            label="Project"
            value={filters.project ?? ''}
            onChange={(e) => apply({ project: e.target.value || null })}
          >
            <MenuItem value="">All projects</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project} value={project}>
                {project}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="model-label">Model</InputLabel>
          <Select
            labelId="model-label"
            label="Model"
            value={filters.model ?? ''}
            onChange={(e) => apply({ model: e.target.value || null })}
          >
            <MenuItem value="">All models</MenuItem>
            {models.map((model) => (
              <MenuItem key={model} value={model}>
                {model}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1} sx={{ ml: 'auto', alignItems: 'center' }}>
          {sync.syncing && <Chip size="small" label="Syncing" />}
          {sync.error && <Chip size="small" color="warning" label="Last sync failed" title={sync.error} />}
          <Typography variant="caption" color="text.secondary">
            {sync.lastSync ? `Synced ${formatTime(sync.lastSync)}` : 'Not synced since the server started'}
          </Typography>
        </Stack>
      </Stack>
      {pending && <LinearProgress />}
    </Stack>
  );
}
