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
import type { RewriteRow } from '@/lib/types';

// Rewrites arrive sorted by cost, largest first.
export default function RewritesTable({ rewrites }: { rewrites: RewriteRow[] }) {
  if (rewrites.length === 0) return null;
  const total = rewrites.reduce((sum, rewrite) => sum + rewrite.aicTotal, 0);
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6">Idle cache rewrites</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {rewrites.length} calls cost {formatAic(total)} AIC after an idle gap. Largest first.
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
              {rewrites.slice(0, 50).map((rewrite) => (
                <TableRow key={rewrite.id} hover>
                  <TableCell>{formatDateTime(rewrite.ts)}</TableCell>
                  <TableCell>{rewrite.agent}</TableCell>
                  <TableCell align="right">{formatDuration(rewrite.gapS * 1000)}</TableCell>
                  <TableCell align="right">{formatTokens(rewrite.context)}</TableCell>
                  <TableCell align="right">{formatTokens(rewrite.cacheWriteTokens)}</TableCell>
                  <TableCell align="right">{formatAic(rewrite.cacheWriteAic)}</TableCell>
                  <TableCell align="right">{formatAic(rewrite.aicTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {rewrites.length > 50 && (
          <Typography variant="caption" color="text.secondary">
            Showing the 50 most expensive of {rewrites.length}.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
