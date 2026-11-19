'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { formatAic, formatDateTime, formatDuration, formatInt, formatPct, formatTokens } from '@/lib/format';
import type { AgentSummary } from '@/lib/types';
import TypeBar from './TypeBar';

export default function AgentsTable({ agents, total }: { agents: AgentSummary[]; total: number }) {
  const columns: GridColDef<AgentSummary>[] = [
    { field: 'label', headerName: 'Agent', flex: 1, minWidth: 220 },
    { field: 'executionMode', headerName: 'Mode', width: 100 },
    { field: 'models', headerName: 'Models', width: 180 },
    { field: 'firstTs', headerName: 'Started', type: 'number', width: 160, valueFormatter: (value: number) => formatDateTime(value) },
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
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Agents ({agents.length})
        </Typography>
        <Box sx={{ height: agents.length > 10 ? 480 : 'auto' }}>
          <DataGrid
            rows={agents}
            columns={columns}
            getRowId={(row) => row.agentId || '__main'}
            density="compact"
            disableRowSelectionOnClick
            hideFooter={agents.length <= 100}
            initialState={{ columns: { columnVisibilityModel: { executionMode: false } } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
