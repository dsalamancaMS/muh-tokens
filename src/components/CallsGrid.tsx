'use client';

import Box from '@mui/material/Box';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { TOKEN_TYPE_LABELS, TOKEN_TYPES } from '@/lib/cost';
import { formatAic, formatDateTime, formatInt, formatTokens } from '@/lib/format';
import type { CallRow } from '@/lib/types';

const columns: GridColDef<CallRow>[] = [
  { field: 'ts', headerName: 'Time', width: 170, valueFormatter: (value: number) => formatDateTime(value) },
  { field: 'agent', headerName: 'Agent', width: 200 },
  { field: 'model', headerName: 'Model', width: 170 },
  { field: 'initiator', headerName: 'Initiator', width: 100 },
  { field: 'context', headerName: 'Context', type: 'number', width: 100, valueFormatter: (value: number) => formatTokens(value) },
  ...TOKEN_TYPES.map(
    (type): GridColDef<CallRow> => ({
      field: `tokens_${type}`,
      headerName: TOKEN_TYPE_LABELS[type],
      type: 'number',
      width: 110,
      valueGetter: (_value, row) => row.tokens[type],
      valueFormatter: (value: number) => formatInt(value),
    }),
  ),
  { field: 'aicTotal', headerName: 'AIC', type: 'number', width: 90, valueFormatter: (value: number) => formatAic(value) },
  {
    field: 'gapS',
    headerName: 'Gap',
    type: 'number',
    width: 80,
    valueFormatter: (value: number | null) => (value === null ? '' : `${Math.round(value)}s`),
  },
  {
    field: 'idleRewrite',
    headerName: 'Rewrite',
    width: 90,
    valueFormatter: (value: boolean) => (value ? 'yes' : ''),
  },
  {
    field: 'durationMs',
    headerName: 'Duration',
    type: 'number',
    width: 90,
    valueFormatter: (value: number | null) => (value === null ? '' : `${(value / 1000).toFixed(1)}s`),
  },
];

// The page of calls is chosen on the server, so paging updates the URL.
interface Props {
  rows: CallRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function CallsGrid({ rows, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Box sx={{ height: 640 }}>
      <DataGrid
        rows={rows}
        columns={columns}
        density="compact"
        disableColumnSorting
        disableColumnFilter
        disableRowSelectionOnClick
        paginationMode="server"
        rowCount={total}
        pageSizeOptions={[pageSize]}
        paginationModel={{ page, pageSize }}
        onPaginationModelChange={(model) => {
          const params = new URLSearchParams(searchParams);
          if (model.page) params.set('page', String(model.page));
          else params.delete('page');
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        getRowClassName={({ row }) => (row.idleRewrite ? 'rewrite' : '')}
        sx={{ '& .rewrite': { bgcolor: 'rgba(211, 47, 47, 0.08)' } }}
      />
    </Box>
  );
}
