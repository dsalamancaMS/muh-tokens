'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import RouterLink from './RouterLink';
import TypeBar from './TypeBar';
import { pathWithFilters, sessionHref, type Filters } from '@/lib/filters';
import { formatAic, formatInt, formatPct, formatTokens } from '@/lib/format';
import type { BreakdownRow } from '@/lib/types';

export type SpenderDimension = 'session' | 'project' | 'model' | 'agent';

const TABS: [SpenderDimension, string][] = [
  ['session', 'Sessions'],
  ['project', 'Projects'],
  ['model', 'Models'],
  ['agent', 'Agents'],
];

const hideOnXs = { display: { xs: 'none', sm: 'table-cell' } } as const;

interface Props {
  rows: Record<SpenderDimension, BreakdownRow[]>;
  totalAic: number;
  filters: Filters;
}

export default function TopSpenders({ rows, totalAic, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<SpenderDimension>('session');
  const back = pathWithFilters(pathname, filters);

  const name = (row: BreakdownRow) => {
    if (tab === 'session') {
      return (
        <RouterLink href={sessionHref(row.key, back)} underline="hover" color="inherit">
          {row.label}
        </RouterLink>
      );
    }
    if (tab === 'project' || tab === 'model') {
      return (
        <Link
          component="button"
          underline="hover"
          color="inherit"
          title={`Show only ${row.key}`}
          onClick={() => router.push(pathWithFilters(pathname, { ...filters, [tab]: row.key }), { scroll: false })}
          sx={{ font: 'inherit', textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {row.label}
        </Link>
      );
    }
    return row.label;
  };

  const current = rows[tab];
  return (
    <Card>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, mb: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="h2">
              Top spenders
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Usage in the selected range, largest first.{' '}
              {tab === 'project' || tab === 'model' ? 'Click a name to filter by it.' : ''}
            </Typography>
          </Box>
          <Tabs value={tab} onChange={(_, value: SpenderDimension) => setTab(value)} variant="scrollable" scrollButtons={false}>
            {TABS.map(([value, label]) => (
              <Tab key={value} value={value} label={label} sx={{ minWidth: 0, px: 1.5 }} />
            ))}
          </Tabs>
        </Stack>
        <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col />
            <Box component="col" sx={{ width: 76 }} />
            <Box component="col" sx={{ width: 64 }} />
            <Box component="col" sx={{ width: { xs: 0, sm: 96 } }} />
            <Box component="col" sx={{ width: { xs: 0, md: 80 } }} />
            <Box component="col" sx={{ width: { xs: 0, md: 72 } }} />
            <Box component="col" sx={{ width: { xs: 0, sm: 140 } }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">AIC</TableCell>
              <TableCell align="right">Share</TableCell>
              <TableCell align="right" sx={hideOnXs}>
                Rewrite AIC
              </TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                Tokens
              </TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                Calls
              </TableCell>
              <TableCell sx={hideOnXs}>AIC mix</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {current.map((row) => (
              <TableRow key={row.key} hover>
                <TableCell sx={{ overflow: 'hidden' }}>
                  <Typography variant="body2" noWrap title={row.label}>
                    {name(row)}
                  </Typography>
                  {row.detail && (
                    <Typography variant="caption" component="div" noWrap sx={{ color: 'text.secondary' }}>
                      {row.detail}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {formatAic(row.aicTotal)}
                </TableCell>
                <TableCell align="right">{formatPct(row.aicTotal, totalAic)}</TableCell>
                <TableCell align="right" sx={hideOnXs}>
                  {row.rewriteAic ? formatAic(row.rewriteAic) : '-'}
                </TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {formatTokens(row.tokensTotal)}
                </TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {formatInt(row.calls)}
                </TableCell>
                <TableCell sx={hideOnXs}>
                  <TypeBar aic={row.aic} total={row.aicTotal} width="100%" />
                </TableCell>
              </TableRow>
            ))}
            {current.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>No calls in this range.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
