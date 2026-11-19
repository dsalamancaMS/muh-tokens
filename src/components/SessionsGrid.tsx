'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import RouterLink from './RouterLink';
import TypeBar from './TypeBar';
import { TOKEN_TYPE_LABELS, TOKEN_TYPES } from '@/lib/cost';
import { sessionHref } from '@/lib/filters';
import { formatAic, formatDuration, formatInt, formatPct, formatShortDateTime, formatTokens } from '@/lib/format';
import type { SessionRow } from '@/lib/types';

const aicColumn = { type: 'number', valueFormatter: (value: number) => formatAic(value) } as const;

function columns(back: string): GridColDef<SessionRow>[] {
  return [
    {
      field: 'title',
      headerName: 'Session',
      flex: 2,
      minWidth: 280,
      renderCell: ({ row }) => (
        <RouterLink href={sessionHref(row.id, back)} underline="hover" color="inherit" onClick={(e) => e.stopPropagation()}>
          {row.title}
        </RouterLink>
      ),
    },
    { field: 'project', headerName: 'Project', flex: 1, minWidth: 130 },
    { field: 'firstTs', headerName: 'Started', type: 'number', width: 150, valueFormatter: (value: number) => formatShortDateTime(value) },
    { field: 'lastTs', headerName: 'Last call', type: 'number', width: 150, valueFormatter: (value: number) => formatShortDateTime(value) },
    {
      field: 'duration',
      headerName: 'Span',
      type: 'number',
      width: 80,
      valueGetter: (_value, row) => row.lastTs - row.firstTs,
      valueFormatter: (value: number) => formatDuration(value),
    },
    { field: 'calls', headerName: 'Calls', type: 'number', width: 80, valueFormatter: (value: number) => formatInt(value) },
    { field: 'subagents', headerName: 'Sub-agents', type: 'number', width: 100 },
    { field: 'tokensTotal', headerName: 'Tokens', type: 'number', width: 90, valueFormatter: (value: number) => formatTokens(value) },
    { field: 'peakContext', headerName: 'Peak context', type: 'number', width: 110, valueFormatter: (value: number) => formatTokens(value) },
    { field: 'aicTotal', headerName: 'AIC', width: 90, ...aicColumn },
    { field: 'rewriteAic', headerName: 'Rewrite AIC', width: 110, ...aicColumn },
    {
      field: 'rewriteShare',
      headerName: 'Rewrite %',
      type: 'number',
      width: 95,
      valueGetter: (_value, row) => (row.aicTotal ? row.rewriteAic / row.aicTotal : 0),
      valueFormatter: (value: number) => formatPct(value, 1),
    },
    {
      field: 'types',
      headerName: 'AIC mix',
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <TypeBar aic={row.aic} total={row.aicTotal} width={130} />
        </Box>
      ),
    },
    ...TOKEN_TYPES.map(
      (type): GridColDef<SessionRow> => ({
        field: `aic_${type}`,
        headerName: `${TOKEN_TYPE_LABELS[type]} AIC`,
        width: 120,
        valueGetter: (_value, row) => row.aic[type],
        ...aicColumn,
      }),
    ),
    { field: 'rewrites', headerName: 'Idle rewrites', type: 'number', width: 110 },
    { field: 'models', headerName: 'Models', width: 220 },
    { field: 'branch', headerName: 'Branch', width: 150 },
  ];
}

// Extra columns are available from the column menu but hidden by default to keep the grid readable.
const HIDDEN = ['lastTs', 'subagents', 'peakContext', 'rewrites', 'models', 'branch', ...TOKEN_TYPES.map((type) => `aic_${type}`)];
const HIDDEN_ON_PHONES = ['project', 'firstTs', 'duration', 'calls', 'tokensTotal', 'rewriteAic', 'rewriteShare', 'types'];

export default function SessionsGrid({ rows, back }: { rows: SessionRow[]; back: string }) {
  const router = useRouter();
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const hidden = Object.fromEntries([...HIDDEN, ...(phone ? HIDDEN_ON_PHONES : [])].map((field) => [field, false]));
  return (
    <Box sx={{ height: 'calc(100vh - 280px)', minHeight: 480 }}>
      <DataGrid
        key={phone ? 'phone' : 'wide'}
        rows={rows}
        columns={columns(back)}
        density="compact"
        showToolbar
        disableRowSelectionOnClick
        onRowClick={({ id }) => router.push(sessionHref(String(id), back))}
        initialState={{
          columns: { columnVisibilityModel: hidden },
          sorting: { sortModel: [{ field: 'aicTotal', sort: 'desc' }] },
          pagination: { paginationModel: { pageSize: 50 } },
        }}
        pageSizeOptions={[25, 50, 100]}
        sx={{ bgcolor: 'background.paper', '& .MuiDataGrid-row': { cursor: 'pointer' } }}
      />
    </Box>
  );
}
