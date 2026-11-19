import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import RouterLink from './RouterLink';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { formatAic, formatInt, formatPct, formatTokens } from '@/lib/format';
import type { BreakdownRow } from '@/lib/types';
import TypeBar from './TypeBar';

interface Props {
  title: string;
  rows: BreakdownRow[];
  total: number;
  sessionLinks?: boolean;
}

export default function BreakdownTable({ title, rows, total, sessionLinks = false }: Props) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell align="right">Calls</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell align="right">AIC</TableCell>
                <TableCell align="right">Share</TableCell>
                <TableCell>Token types</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key} hover>
                  <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.label}>
                    {sessionLinks ? (
                      <RouterLink href={`/sessions/${row.key}`} underline="hover">
                        {row.label}
                      </RouterLink>
                    ) : (
                      row.label
                    )}
                  </TableCell>
                  <TableCell align="right">{formatInt(row.calls)}</TableCell>
                  <TableCell align="right">{formatTokens(row.tokensTotal)}</TableCell>
                  <TableCell align="right">{formatAic(row.aicTotal)}</TableCell>
                  <TableCell align="right">{formatPct(row.aicTotal, total)}</TableCell>
                  <TableCell>
                    <TypeBar aic={row.aic} total={row.aicTotal} width={120} />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No calls in this range.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}
