import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { formatAic, formatInt, formatPct, formatTokens } from '@/lib/format';
import type { UsageTotals } from '@/lib/types';

// Above this share of credits, idle rewrites are shown in the warning colour.
const REWRITE_WARNING_SHARE = 0.15;

interface KpiProps {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  warning?: boolean;
}

function Kpi({ label, value, unit, detail, warning = false }: KpiProps) {
  return (
    <Card sx={{ height: '100%', borderColor: warning ? 'warning.main' : undefined }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
        <Typography variant="overline" component="div" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
          {label}
        </Typography>
        <Typography
          component="div"
          sx={{ fontSize: { xs: '1.35rem', sm: '1.75rem' }, fontWeight: 600, lineHeight: 1.2, color: warning ? 'warning.main' : undefined }}
        >
          {value}
          {unit && (
            <Typography component="span" sx={{ ml: 0.5, fontSize: '0.9rem', fontWeight: 500, color: 'text.secondary' }}>
              {unit}
            </Typography>
          )}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
          {detail}
        </Typography>
      </CardContent>
    </Card>
  );
}

interface Props {
  totals: UsageTotals;
  // Session pages show whole-session totals and the sub-agent count instead of sessions.
  session?: { subagents: number; peakContext: number };
}

export default function KpiCards({ totals, session }: Props) {
  const inputTokens = totals.tokens.input + totals.tokens.cacheRead + totals.tokens.cacheWrite;
  const rewriteShare = totals.aicTotal ? totals.rewriteAic / totals.aicTotal : 0;
  const scope = session ? ', whole session' : '';
  const items: KpiProps[] = [
    {
      label: `AI credits${scope}`,
      value: formatAic(totals.aicTotal),
      unit: 'AIC',
      detail: `${formatAic(totals.aicTotal / Math.max(1, totals.calls))} AIC per call`,
    },
    {
      label: 'Idle rewrite cost',
      value: formatAic(totals.rewriteAic),
      unit: 'AIC',
      detail: `${formatPct(rewriteShare, 1)} of credits, ${formatInt(totals.rewrites)} calls`,
      warning: rewriteShare > REWRITE_WARNING_SHARE,
    },
    {
      label: `Tokens${scope}`,
      value: formatTokens(totals.tokensTotal),
      detail: `${formatPct(totals.tokens.cacheRead, inputTokens)} of input read from cache`,
    },
    {
      label: 'Model calls',
      value: formatInt(totals.calls),
      detail: session
        ? `${formatInt(session.subagents)} sub-agents, peak context ${formatTokens(session.peakContext)}`
        : `${formatInt(totals.sessions)} sessions`,
    },
  ];
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {items.map((item) => (
        <Grid key={item.label} size={{ xs: 6, lg: 3 }}>
          <Kpi {...item} />
        </Grid>
      ))}
    </Grid>
  );
}
