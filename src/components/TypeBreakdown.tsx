'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { PieChart } from '@mui/x-charts/PieChart';
import { TOKEN_TYPE_COLORS, TOKEN_TYPE_LABELS, TOKEN_TYPES } from '@/lib/cost';
import { formatAic, formatPct, formatTokens } from '@/lib/format';
import type { UsageTotals } from '@/lib/types';

function Donut({ title, values, format }: { title: string; values: UsageTotals['aic']; format: (v: number) => string }) {
  return (
    <Box>
      <Typography variant="subtitle2" align="center">
        {title}
      </Typography>
      <PieChart
        height={200}
        hideLegend
        skipAnimation
        series={[
          {
            innerRadius: 50,
            outerRadius: 90,
            paddingAngle: 1,
            data: TOKEN_TYPES.map((type) => ({
              id: type,
              value: values[type],
              label: TOKEN_TYPE_LABELS[type],
              color: TOKEN_TYPE_COLORS[type],
            })),
            valueFormatter: (item) => format(item.value),
          },
        ]}
      />
    </Box>
  );
}

// Splits a total by token type: how many tokens of each type, and what they cost.
export default function TypeBreakdown({ totals }: { totals: UsageTotals }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Token types
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Donut title="Share of AI credits" values={totals.aic} format={formatAic} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Donut title="Share of tokens" values={totals.tokens} format={formatTokens} />
          </Grid>
        </Grid>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell align="right">Tokens</TableCell>
              <TableCell align="right">AIC</TableCell>
              <TableCell align="right">Share of AIC</TableCell>
              <TableCell align="right">AIC / 1M tokens</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {TOKEN_TYPES.map((type) => (
              <TableRow key={type}>
                <TableCell>
                  <Box
                    component="span"
                    sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '2px', mr: 1, bgcolor: TOKEN_TYPE_COLORS[type] }}
                  />
                  {TOKEN_TYPE_LABELS[type]}
                </TableCell>
                <TableCell align="right">{formatTokens(totals.tokens[type])}</TableCell>
                <TableCell align="right">{formatAic(totals.aic[type])}</TableCell>
                <TableCell align="right">{formatPct(totals.aic[type], totals.aicTotal)}</TableCell>
                <TableCell align="right">
                  {totals.tokens[type] ? formatAic((totals.aic[type] * 1e6) / totals.tokens[type]) : '-'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {formatTokens(totals.tokensTotal)}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {formatAic(totals.aicTotal)}
              </TableCell>
              <TableCell align="right" />
              <TableCell align="right">
                {totals.tokensTotal ? formatAic((totals.aicTotal * 1e6) / totals.tokensTotal) : '-'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          Output excludes reasoning. Reasoning is billed at the output price, so its credits are the output price times
          its share of output tokens.
        </Typography>
      </CardContent>
    </Card>
  );
}
