'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { formatAic, formatShortDateTime, formatDuration, formatInt, formatPct, formatTokens } from '@/lib/format';
import type { AgentSummary } from '@/lib/types';
import TypeBar from './TypeBar';

export default function AgentsTable({ agents, total }: { agents: AgentSummary[]; total: number }) {
  const columns: GridColDef<AgentSummary>[] = [
    { field: 'name', headerName: 'Agent', flex: 1, minWidth: 200 },
    { field: 'agentId', headerName: 'ID', width: 90, valueFormatter: (value: string) => (value ? value.slice(0, 8) : 'main') },
    { field: 'executionMode', headerName: 'Mode', width: 100 },
    { field: 'models', headerName: 'Models', width: 180 },
    { field: 'firstTs', headerName: 'Started', type: 'number', width: 150, valueFormatter: (value: number) => formatShortDateTime(value) },
    {
      field: 'span',
      headerName: 'Span',
      type: 'number',
      width: 90,
      valueGetter: (_value, row) => row.lastTs - row.firstTs,
      valueFormatter: (value: number) => formatDuration(value),
    },
    { field: 'calls', headerName: 'Calls', type: 'number', width: 80, valueFormatter: (value: number) => formatInt(value) },
    { field: 'peakContext', headerName: 'Peak context', type: 'number', width: 110, valueFormatter: (value: number) => formatTokens(value) },
    { field: 'tokensTotal', headerName: 'Tokens', type: 'number', width: 90, valueFormatter: (value: number) => formatTokens(value) },
    { field: 'aicTotal', headerName: 'AIC', type: 'number', width: 90, valueFormatter: (value: number) => formatAic(value) },
    {
      field: 'share',
      headerName: 'Share',
      type: 'number',
      width: 80,
      valueGetter: (_value, row) => row.aicTotal,
      valueFormatter: (value: number) => formatPct(value, total),
    },
    { field: 'rewrites', headerName: 'Idle rewrites', type: 'number', width: 110 },
    { field: 'rewriteAic', headerName: 'Rewrite AIC', type: 'number', width: 110, valueFormatter: (value: number) => formatAic(value) },
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
  ];

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Typography variant="h6" component="h2">
          Agents ({agents.length})
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          The main agent and each sub-agent, by credits.
        </Typography>
        <Box>
          <DataGrid
            rows={agents}
            columns={columns}
            getRowId={(row) => row.agentId || '__main'}
            density="compact"
            disableRowSelectionOnClick
            hideFooter={agents.length <= 10}
            pageSizeOptions={[10, 25, 100]}
            initialState={{
              columns: { columnVisibilityModel: { executionMode: false, models: false, peakContext: false } },
              pagination: { paginationModel: { pageSize: 10 } },
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
