'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { TOKEN_TYPE_COLORS, TOKEN_TYPE_LABELS, TOKEN_TYPES } from '@/lib/cost';
import { formatAic, formatPct, formatTokens } from '@/lib/format';
import type { ByType, UsageTotals } from '@/lib/types';

// Segments narrower than this share get no inline label.
const MIN_LABEL_SHARE = 0.07;

function ShareBar({ label, values, total, format }: { label: string; values: ByType; total: number; format: (v: number) => string }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Typography variant="body2" sx={{ width: 52, flexShrink: 0, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexGrow: 1, height: 28, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
        {TOKEN_TYPES.map((type) => {
          const share = total ? values[type] / total : 0;
          if (share <= 0) return null;
          return (
            <Tooltip key={type} title={`${TOKEN_TYPE_LABELS[type]}: ${format(values[type])}, ${formatPct(share, 1)}`}>
              <Box
                sx={{
                  width: `${share * 100}%`,
                  bgcolor: TOKEN_TYPE_COLORS[type],
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  borderRight: '1px solid',
                  borderColor: 'background.paper',
                }}
              >
                {share >= MIN_LABEL_SHARE && (
                  // Phones need a wider segment to fit the label.
                  <Box component="span" sx={{ display: { xs: share >= 0.12 ? 'inline' : 'none', sm: 'inline' } }}>
                    {formatPct(share, 1)}
                  </Box>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Stack>
  );
}

// Compares the token mix with the credit mix, then lists what each type costs per million tokens.
export default function CreditMix({ totals, title = 'Where the credits go' }: { totals: UsageTotals; title?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Share of tokens compared with share of credits, by token type.
        </Typography>
        <Stack spacing={1}>
          <ShareBar label="Tokens" values={totals.tokens} total={totals.tokensTotal} format={(v) => `${formatTokens(v)} tokens`} />
          <ShareBar label="AIC" values={totals.aic} total={totals.aicTotal} format={(v) => `${formatAic(v)} AIC`} />
        </Stack>
        <Box sx={{ overflowX: 'auto', mt: 2 }}>
          <Table size="small" sx={{ minWidth: 420 }}>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell align="right">AIC</TableCell>
                <TableCell align="right">Share</TableCell>
                <TableCell align="right">AIC / 1M</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {TOKEN_TYPES.map((type) => (
                <TableRow key={type}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box
                      component="span"
                      sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '2px', mr: 1, bgcolor: TOKEN_TYPE_COLORS[type] }}
                    />
                    {TOKEN_TYPE_LABELS[type]}
                  </TableCell>
                  <TableCell align="right">{formatTokens(totals.tokens[type])}</TableCell>
                  <TableCell align="right">{formatAic(totals.aic[type])}</TableCell>
                  <TableCell align="right">{formatPct(totals.aic[type], totals.aicTotal)}</TableCell>
                  <TableCell align="right">{totals.tokens[type] ? formatAic((totals.aic[type] * 1e6) / totals.tokens[type]) : '-'}</TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ '& td': { fontWeight: 600, borderBottom: 0 } }}>
                <TableCell>Total</TableCell>
                <TableCell align="right">{formatTokens(totals.tokensTotal)}</TableCell>
                <TableCell align="right">{formatAic(totals.aicTotal)}</TableCell>
                <TableCell align="right" />
                <TableCell align="right">{totals.tokensTotal ? formatAic((totals.aicTotal * 1e6) / totals.tokensTotal) : '-'}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" component="p" sx={{ mt: 1, color: 'text.secondary' }}>
          Output excludes reasoning. Reasoning is billed at the output price.
        </Typography>
      </CardContent>
    </Card>
  );
}
