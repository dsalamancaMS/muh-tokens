import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import RouterLink from '@/components/RouterLink';
import Typography from '@mui/material/Typography';
import AgentsTable from '@/components/AgentsTable';
import ContextScatter, { type ContextSeries } from '@/components/ContextScatter';
import KpiCards from '@/components/KpiCards';
import RewritesTable from '@/components/RewritesTable';
import SessionTimeline from '@/components/SessionTimeline';
import TypeBreakdown from '@/components/TypeBreakdown';
import { formatDateTime, formatDuration } from '@/lib/format';
import { getSessionDetail, shortId } from '@/lib/queries';
import { getStore } from '@/lib/server';
import { bucketSlices } from '@/lib/sessionTimeline';
import type { UsageSlice } from '@/lib/types';

const MAX_SCATTER_SERIES = 8;

interface Props {
  params: Promise<{ id: string }>;
}

// Groups the 5-minute peaks by agent for the context chart. Small agents share one series so the legend stays short.
function contextSeries(slices: UsageSlice[]): ContextSeries[] {
  const byAgent = new Map<string, ContextSeries>();
  for (const slice of slices) {
    let series = byAgent.get(slice.agentId);
    if (!series) {
      const label = slice.agentId ? `${slice.agent} (${shortId(slice.agentId)})` : slice.agent;
      series = { id: slice.agentId || '__main', label, points: [] };
      byAgent.set(slice.agentId, series);
    }
    series.points.push([slice.ts, slice.maxContext]);
  }
  const sorted = [...byAgent.values()].sort((a, b) => b.points.length - a.points.length);
  if (sorted.length <= MAX_SCATTER_SERIES) return sorted;
  const kept = sorted.slice(0, MAX_SCATTER_SERIES - 1);
  const rest = sorted.slice(MAX_SCATTER_SERIES - 1);
  kept.push({ id: '__other', label: `${rest.length} other agents`, points: rest.flatMap((s) => s.points) });
  return kept;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `Session ${shortId(id)} | muh-tokens` };
}

export default async function SessionPage({ params }: Props) {
  await connection();
  const { id } = await params;
  const detail = getSessionDetail(getStore(), id);
  if (!detail) notFound();

  const { session, slices, rewrites, agents } = detail;

  return (
    <>
      <Breadcrumbs sx={{ mb: 1 }}>
        <RouterLink href="/sessions" underline="hover" color="inherit">
          Sessions
        </RouterLink>
        <Typography color="text.primary">{shortId(id)}</Typography>
      </Breadcrumbs>
      <Typography variant="h5" gutterBottom>
        {session.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" component="div" sx={{ mb: 2 }}>
        <div>
          {session.project}
          {session.branch ? ` on ${session.branch}` : ''}, {formatDateTime(session.firstTs)} to {formatDateTime(session.lastTs)}{' '}
          ({formatDuration(session.lastTs - session.firstTs)})
        </div>
        <div>Models: {session.models}</div>
        {session.cwd && <div>Directory: {session.cwd}</div>}
        <div>Session ID: {id}</div>
      </Typography>
      <KpiCards totals={session} subagents={session.subagents} />
      <SessionTimeline buckets={bucketSlices(slices)} />
      <ContextScatter series={contextSeries(slices)} rewrites={rewrites.map((rewrite) => [rewrite.ts, rewrite.context])} />
      <Box sx={{ mb: 3 }}>
        <TypeBreakdown totals={session} />
      </Box>
      <AgentsTable agents={agents} total={session.aicTotal} />
      <RewritesTable rewrites={rewrites} />
    </>
  );
}
