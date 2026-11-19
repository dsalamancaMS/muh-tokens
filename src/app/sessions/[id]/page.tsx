import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AgentsTable from '@/components/AgentsTable';
import ContextScatter, { type ContextSeries } from '@/components/ContextScatter';
import CopyButton from '@/components/CopyButton';
import CreditMix from '@/components/CreditMix';
import KpiCards from '@/components/KpiCards';
import RewritesTable from '@/components/RewritesTable';
import RouterLink from '@/components/RouterLink';
import SessionTimeline from '@/components/SessionTimeline';
import { safeBack, type SearchParams } from '@/lib/filters';
import { formatDuration, formatShortDateTime } from '@/lib/format';
import { OTHER_COLOR, getSessionDetail, shortId } from '@/lib/queries';
import { getStore } from '@/lib/server';
import { bucketSlices } from '@/lib/sessionTimeline';
import type { UsageSlice } from '@/lib/types';

// Agents with their own colour in the context chart. The rest share one grey series.
// Fixed colours, kept well away from the red used for idle rewrites.
const AGENT_COLORS = ['#3949ab', '#00897b', '#f9a825', '#00acc1', '#7cb342'];
// Sessions with fewer time steps than this get a compact page without the time charts.
const MIN_CHART_STEPS = 6;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

function contextSeries(slices: UsageSlice[]): ContextSeries[] {
  const byAgent = new Map<string, { label: string; points: [number, number][]; aic: number }>();
  for (const slice of slices) {
    let agent = byAgent.get(slice.agentId);
    if (!agent) {
      agent = { label: slice.agentId ? `${slice.agent} (${shortId(slice.agentId)})` : slice.agent, points: [], aic: 0 };
      byAgent.set(slice.agentId, agent);
    }
    agent.points.push([slice.ts, slice.maxContext]);
    agent.aic += slice.aicTotal;
  }
  const sorted = [...byAgent.entries()].sort((a, b) => b[1].aic - a[1].aic);
  const top = sorted.slice(0, AGENT_COLORS.length);
  const rest = sorted.slice(AGENT_COLORS.length);
  const series: ContextSeries[] = top.map(([id, agent], index) => ({
    id: id || '__main',
    label: agent.label,
    color: AGENT_COLORS[index],
    points: agent.points,
  }));
  if (rest.length > 0) {
    series.push({ id: '__other', label: `${rest.length} other agents`, color: OTHER_COLOR, points: rest.flatMap(([, a]) => a.points) });
  }
  return series;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `Session ${shortId(id)} | muh-tokens` };
}

export default async function SessionPage({ params, searchParams }: Props) {
  await connection();
  const { id } = await params;
  const back = safeBack((await searchParams).back) ?? '/sessions';
  const detail = getSessionDetail(getStore(), id);
  if (!detail) notFound();

  const { session, slices, rewrites, agents } = detail;
  const buckets = bucketSlices(slices);
  const compact = buckets.starts.length < MIN_CHART_STEPS;
  const models = session.models.split(', ').filter(Boolean);

  return (
    <>
      <RouterLink href={back} underline="hover" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
        {back.startsWith('/sessions') ? 'Back to sessions' : 'Back to overview'}
      </RouterLink>
      <Typography variant="h1" sx={{ mb: 1, overflowWrap: 'anywhere' }}>
        {session.title}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
        <Chip size="small" label={session.project} color="primary" variant="outlined" />
        {session.branch && <Chip size="small" label={session.branch} variant="outlined" />}
        {models.map((model) => (
          <Chip key={model} size="small" label={model} variant="outlined" />
        ))}
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 3, color: 'text.secondary', flexWrap: 'wrap' }}>
        <Typography variant="body2">
          {formatShortDateTime(session.firstTs)} to {formatShortDateTime(session.lastTs)} ({formatDuration(session.lastTs - session.firstTs)})
          {session.cwd ? `, ${session.cwd}` : ''}
        </Typography>
        <Typography variant="body2" sx={{ ml: 1, fontFamily: 'monospace' }}>
          {id}
        </Typography>
        <CopyButton value={id} label="Copy session ID" />
      </Stack>
      <KpiCards totals={session} session={{ subagents: session.subagents, peakContext: session.peakContext }} />
      {compact ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          This session is short, so the time charts are left out.
        </Typography>
      ) : (
        <SessionTimeline buckets={buckets} />
      )}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <CreditMix totals={session} />
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <RewritesTable rewrites={rewrites} />
        </Grid>
      </Grid>
      {!compact && <ContextScatter series={contextSeries(slices)} rewrites={rewrites.map((rewrite) => [rewrite.ts, rewrite.context])} />}
      <Box>
        <AgentsTable agents={agents} total={session.aicTotal} />
      </Box>
    </>
  );
}
