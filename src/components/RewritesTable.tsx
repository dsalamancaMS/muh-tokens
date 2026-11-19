import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { formatAic, formatDuration, formatShortDateTime, formatTokens } from '@/lib/format';
import { shortId } from '@/lib/queries';
import type { RewriteRow } from '@/lib/types';

const SHOWN = 50;

// Rewrites arrive sorted by cost, largest first.
export default function RewritesTable({ rewrites }: { rewrites: RewriteRow[] }) {
  const total = rewrites.reduce((sum, rewrite) => sum + rewrite.aicTotal, 0);
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Typography variant="h6" component="h2">
          Idle cache rewrites
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {rewrites.length === 0
            ? 'No calls in this session came after an idle gap.'
            : `${rewrites.length} calls cost ${formatAic(total)} AIC after an idle gap. Largest first${rewrites.length > SHOWN ? `, top ${SHOWN} shown` : ''}.`}
        </Typography>
        {rewrites.length > 0 && (
          <Box sx={{ maxHeight: 420, overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={{ minWidth: 480 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Idle for</TableCell>
                  <TableCell align="right">Context</TableCell>
                  <TableCell align="right">AIC</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rewrites.slice(0, SHOWN).map((rewrite) => (
                  <TableRow key={rewrite.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatShortDateTime(rewrite.ts)}</TableCell>
                    <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rewrite.agent}>
                      {rewrite.agent}
                      {rewrite.agentId && (
                        <Typography component="span" variant="caption" sx={{ ml: 0.75, color: 'text.secondary' }}>
                          {shortId(rewrite.agentId)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{formatDuration(rewrite.gapS * 1000)}</TableCell>
                    <TableCell align="right">{formatTokens(rewrite.context)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatAic(rewrite.aicTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
