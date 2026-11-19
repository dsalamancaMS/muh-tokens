import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { formatAic, formatInt, formatPct, formatTokens } from '@/lib/format';
import type { UsageTotals } from '@/lib/types';

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {value}
        </Typography>
        {detail && (
          <Typography variant="body2" color="text.secondary">
            {detail}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function KpiCards({ totals, subagents }: { totals: UsageTotals; subagents?: number }) {
  const cacheHit = totals.tokens.cacheRead / Math.max(1, totals.tokens.input + totals.tokens.cacheRead + totals.tokens.cacheWrite);
  const items = [
    { label: 'AI credits', value: formatAic(totals.aicTotal), detail: `${formatAic(totals.aicTotal / Math.max(1, totals.calls))} per call` },
    { label: 'Tokens', value: formatTokens(totals.tokensTotal), detail: `${formatPct(cacheHit, 1)} of input read from cache` },
    {
      label: 'Model calls',
      value: formatInt(totals.calls),
      detail: subagents === undefined ? `${formatInt(totals.sessions)} sessions` : `${formatInt(subagents)} sub-agents`,
    },
    {
      label: 'Idle cache rewrites',
      value: formatInt(totals.rewrites),
      detail: `${formatAic(totals.rewriteAic)} AIC, ${formatPct(totals.rewriteAic, totals.aicTotal)} of credits`,
    },
  ];
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {items.map((item) => (
        <Grid key={item.label} size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi {...item} />
        </Grid>
      ))}
    </Grid>
  );
}
