import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import RouterLink from './RouterLink';
import { sessionHref } from '@/lib/filters';
import { formatAic, formatInt, formatPct } from '@/lib/format';
import type { RewriteSummary, UsageTotals } from '@/lib/types';

const REWRITE_COLOR = '#e53935';

// What idle cache rewrites cost in the range, which sessions paid most, and how long the agents were idle first.
export default function RewritesPanel({ summary, totals, back }: { summary: RewriteSummary; totals: UsageTotals; back: string }) {
  const maxGapAic = Math.max(...summary.gaps.map((gap) => gap.aic), 0);
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Typography variant="h6" component="h2">
          Idle cache rewrites
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Calls made 5 minutes or more after the same agent&apos;s previous call. The prompt cache had expired, so the whole context was
          written again.
        </Typography>
        <Stack direction="row" spacing={3} sx={{ mb: 2.5 }}>
          <Box>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.2, color: REWRITE_COLOR }}>
              {formatAic(totals.rewriteAic)}
              <Typography component="span" sx={{ ml: 0.5, fontSize: '0.85rem', color: 'text.secondary' }}>
                AIC
              </Typography>
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatPct(totals.rewriteAic, totals.aicTotal)} of credits
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.2 }}>{formatInt(totals.rewrites)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              calls
            </Typography>
          </Box>
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Costliest sessions
        </Typography>
        <Stack spacing={1} sx={{ mb: 2.5 }}>
          {summary.sessions.map((session) => (
            <Stack key={session.key} direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap title={session.label}>
                  <RouterLink href={sessionHref(session.key, back)} underline="hover" color="inherit">
                    {session.label}
                  </RouterLink>
                </Typography>
                <Typography variant="caption" component="div" noWrap sx={{ color: 'text.secondary' }}>
                  {session.detail}, {formatInt(session.rewrites)} rewrites
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                {formatAic(session.aic)}
              </Typography>
            </Stack>
          ))}
          {summary.sessions.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No idle rewrites in this range.
            </Typography>
          )}
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Idle time before the rewrite
        </Typography>
        <Stack spacing={0.75}>
          {summary.gaps.map((gap) => (
            <Stack key={gap.label} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ width: 96, flexShrink: 0, color: 'text.secondary' }}>
                {gap.label}
              </Typography>
              <Box sx={{ flexGrow: 1, height: 8, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
                <Box sx={{ width: `${maxGapAic ? (100 * gap.aic) / maxGapAic : 0}%`, height: '100%', bgcolor: REWRITE_COLOR, opacity: 0.8 }} />
              </Box>
              <Typography variant="body2" sx={{ width: 120, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {formatAic(gap.aic)} AIC
                <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                  ({formatInt(gap.count)})
                </Typography>
              </Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
