'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { pathWithFilters, type Filters, type Preset } from '@/lib/filters';
import { formatShortDateTime } from '@/lib/format';

const PRESET_LABELS: [Preset, string][] = [
  ['24h', '24h'],
  ['7d', '7d'],
  ['30d', '30d'],
  ['90d', '90d'],
  ['all', 'All'],
  ['custom', 'Custom'],
];

// Height of the dense app bar, so the filters stick just under it.
const APP_BAR_HEIGHT = 48;

interface Props {
  filters: Filters;
  projects: string[];
  models: string[];
}

export default function FiltersBar({ filters, projects, models }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState({ from: filters.from, to: filters.to });
  const [showCustom, setShowCustom] = useState(filters.preset === 'custom');

  const apply = (change: Partial<Filters>) =>
    startTransition(() => router.push(pathWithFilters(pathname, { ...filters, ...change }), { scroll: false }));

  const customError = !custom.from || !custom.to ? 'Pick both dates' : custom.from > custom.to ? 'From is after To' : null;
  const customChanged = filters.preset !== 'custom' || custom.from !== filters.from || custom.to !== filters.to;
  const filtered = filters.preset !== '7d' || filters.project !== null || filters.model !== null;

  return (
    <Box
      sx={{
        // On phones the wrapped filters are too tall to pin, so they scroll away.
        position: { xs: 'static', md: 'sticky' },
        top: APP_BAR_HEIGHT,
        zIndex: (theme) => theme.zIndex.appBar - 1,
        bgcolor: 'background.default',
        mx: { xs: -2, sm: -3 },
        px: { xs: 2, sm: 3 },
        pt: 1.5,
        pb: 1.5,
        mt: -3,
        mb: 2,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={showCustom ? 'custom' : filters.preset}
          onChange={(_, preset: Preset | null) => {
            if (!preset) return;
            if (preset === 'custom') {
              setShowCustom(true);
            } else {
              setShowCustom(false);
              apply({ preset });
            }
          }}
          aria-label="Time range"
        >
          {PRESET_LABELS.map(([value, label]) => (
            <ToggleButton key={value} value={value} sx={{ px: 1.5 }}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {showCustom && (
          <Stack
            component="form"
            direction="row"
            spacing={1}
            sx={{ alignItems: 'flex-start' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!customError) apply({ preset: 'custom', ...custom });
            }}
          >
            <TextField
              size="small"
              type="date"
              label="From"
              value={custom.from}
              error={customError !== null}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={custom.to}
              error={customError !== null}
              helperText={customError ?? undefined}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true }, formHelperText: { sx: { position: 'absolute', top: '100%', mt: 0.25 } } }}
            />
            <Button type="submit" variant="contained" size="medium" disableElevation disabled={customError !== null || !customChanged}>
              Apply
            </Button>
          </Stack>
        )}
        <FormControl size="small" sx={{ width: { xs: '100%', sm: 200 } }}>
          <InputLabel id="project-label">Project</InputLabel>
          <Select labelId="project-label" label="Project" value={filters.project ?? ''} onChange={(e) => apply({ project: e.target.value || null })}>
            <MenuItem value="">All projects</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project} value={project}>
                {project}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: { xs: '100%', sm: 200 } }}>
          <InputLabel id="model-label">Model</InputLabel>
          <Select labelId="model-label" label="Model" value={filters.model ?? ''} onChange={(e) => apply({ model: e.target.value || null })}>
            <MenuItem value="">All models</MenuItem>
            {models.map((model) => (
              <MenuItem key={model} value={model}>
                {model}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' }, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {formatShortDateTime(filters.fromMs)} to {formatShortDateTime(filters.toMs)}
          </Typography>
          {filtered && (
            <Button
              size="small"
              onClick={() => {
                setShowCustom(false);
                apply({ preset: '7d', project: null, model: null });
              }}
            >
              Reset
            </Button>
          )}
        </Stack>
      </Stack>
      {pending && <LinearProgress sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 }} />}
    </Box>
  );
}
