import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { formatAic, formatDateTime, formatDuration, formatTokens } from '@/lib/format';
import type { CallRow } from '@/lib/types';

export default function RewritesTable({ calls }: { calls: CallRow[] }) {
  if (calls.length === 0) return null;
  const total = calls.reduce((sum, call) => sum + call.aicTotal, 0);
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6">Idle cache rewrites</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {calls.length} calls cost {formatAic(total)} AIC after an idle gap. Largest first.
        </Typography>
        <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Agent</TableCell>
                <TableCell align="right">Idle for</TableCell>
                <TableCell align="right">Context</TableCell>
                <TableCell align="right">Cache write tokens</TableCell>
                <TableCell align="right">Cache write AIC</TableCell>
                <TableCell align="right">Call AIC</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...calls]
                .sort((a, b) => b.aicTotal - a.aicTotal)
                .slice(0, 50)
                .map((call) => (
                  <TableRow key={call.id} hover>
                    <TableCell>{formatDateTime(call.ts)}</TableCell>
                    <TableCell>{call.agent}</TableCell>
                    <TableCell align="right">{formatDuration((call.gapS ?? 0) * 1000)}</TableCell>
                    <TableCell align="right">{formatTokens(call.context)}</TableCell>
                    <TableCell align="right">{formatTokens(call.tokens.cacheWrite)}</TableCell>
                    <TableCell align="right">{formatAic(call.aic.cacheWrite)}</TableCell>
                    <TableCell align="right">{formatAic(call.aicTotal)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Box>
        {calls.length > 50 && (
          <Typography variant="caption" color="text.secondary">
            Showing the 50 most expensive of {calls.length}.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
