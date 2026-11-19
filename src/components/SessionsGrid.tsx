'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { TOKEN_TYPE_LABELS, TOKEN_TYPES } from '@/lib/cost';
import { formatAic, formatDateTime, formatDuration, formatInt, formatPct, formatTokens } from '@/lib/format';
import type { SessionRow } from '@/lib/types';
import TypeBar from './TypeBar';

const aicColumn = { type: 'number', valueFormatter: (value: number) => formatAic(value) } as const;

const columns: GridColDef<SessionRow>[] = [
  { field: 'title', headerName: 'Session', flex: 1, minWidth: 220 },
  { field: 'project', headerName: 'Project', width: 150 },
  { field: 'firstTs', headerName: 'Started', type: 'number', width: 180, valueFormatter: (value: number) => formatDateTime(value) },
  { field: 'lastTs', headerName: 'Last call', type: 'number', width: 180, valueFormatter: (value: number) => formatDateTime(value) },
  {
    field: 'duration',
    headerName: 'Span',
    type: 'number',
    width: 90,
    valueGetter: (_value, row) => row.lastTs - row.firstTs,
    valueFormatter: (value: number) => formatDuration(value),
  },
  { field: 'calls', headerName: 'Calls', type: 'number', width: 80, valueFormatter: (value: number) => formatInt(value) },
  { field: 'subagents', headerName: 'Sub-agents', type: 'number', width: 100 },
  { field: 'tokensTotal', headerName: 'Tokens', type: 'number', width: 90, valueFormatter: (value: number) => formatTokens(value) },
  { field: 'peakContext', headerName: 'Peak context', type: 'number', width: 110, valueFormatter: (value: number) => formatTokens(value) },
  { field: 'aicTotal', headerName: 'AIC', width: 90, ...aicColumn },
  {
    field: 'types',
    headerName: 'Token types',
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
  { field: 'rewriteAic', headerName: 'Rewrite AIC', width: 110, ...aicColumn },
  {
    field: 'rewriteShare',
    headerName: 'Rewrite %',
    type: 'number',
    width: 100,
    valueGetter: (_value, row) => (row.aicTotal ? row.rewriteAic / row.aicTotal : 0),
    valueFormatter: (value: number) => formatPct(value, 1),
  },
  { field: 'models', headerName: 'Models', width: 220 },
  { field: 'branch', headerName: 'Branch', width: 150 },
];

// Per-type columns are available but hidden by default to keep the grid readable.
const hidden = Object.fromEntries([...TOKEN_TYPES.map((type) => [`aic_${type}`, false]), ['branch', false], ['lastTs', false]]);

export default function SessionsGrid({ rows }: { rows: SessionRow[] }) {
  const router = useRouter();
  return (
    <Box sx={{ height: 'calc(100vh - 260px)', minHeight: 480 }}>
      <DataGrid
        rows={rows}
        columns={columns}
        density="compact"
        showToolbar
        disableRowSelectionOnClick
        onRowClick={({ id }) => router.push(`/sessions/${id}`)}
        initialState={{
          columns: { columnVisibilityModel: hidden },
          sorting: { sortModel: [{ field: 'aicTotal', sort: 'desc' }] },
          pagination: { paginationModel: { pageSize: 50 } },
        }}
        pageSizeOptions={[25, 50, 100]}
        sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
      />
    </Box>
  );
}
