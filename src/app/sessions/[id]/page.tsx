import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import RouterLink from '@/components/RouterLink';
import Typography from '@mui/material/Typography';
import AgentsTable from '@/components/AgentsTable';
import CallsGrid from '@/components/CallsGrid';
import ContextScatter, { type ContextSeries } from '@/components/ContextScatter';
import KpiCards from '@/components/KpiCards';
import RewritesTable from '@/components/RewritesTable';
import SessionTimeline from '@/components/SessionTimeline';
import TypeBreakdown from '@/components/TypeBreakdown';
import { formatDateTime, formatDuration } from '@/lib/format';
import { getSessionDetail, shortId } from '@/lib/queries';
import { getStore } from '@/lib/server';
import { bucketCalls } from '@/lib/sessionTimeline';
import type { CallRow } from '@/lib/types';

const PAGE_SIZE = 100;
const MAX_SCATTER_SERIES = 8;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

// Groups calls by agent for the context chart. Small agents share one series so the legend stays short.
function contextSeries(calls: CallRow[]): ContextSeries[] {
  const byAgent = new Map<string, ContextSeries>();
  for (const call of calls) {
    let series = byAgent.get(call.agentId);
    if (!series) {
      const label = call.agentId ? `${call.agent} (${shortId(call.agentId)})` : call.agent;
      series = { id: call.agentId || '__main', label, points: [] };
      byAgent.set(call.agentId, series);
    }
    series.points.push([call.ts, call.context]);
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

export default async function SessionPage({ params, searchParams }: Props) {
  await connection();
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const detail = getSessionDetail(getStore(), id);
  if (!detail) notFound();

  const { session, calls, agents } = detail;
  const pages = Math.max(1, Math.ceil(calls.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, Number.parseInt(pageParam ?? '0', 10) || 0), pages - 1);
  const rewrites = calls.filter((call) => call.idleRewrite);

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
      <SessionTimeline buckets={bucketCalls(calls)} />
      <ContextScatter series={contextSeries(calls)} rewrites={rewrites.map((call) => [call.ts, call.context])} />
      <Box sx={{ mb: 3 }}>
        <TypeBreakdown totals={session} />
      </Box>
      <AgentsTable agents={agents} total={session.aicTotal} />
      <RewritesTable calls={rewrites} />
      <Typography variant="h6" gutterBottom>
        Calls
      </Typography>
      <CallsGrid rows={calls.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)} total={calls.length} page={page} pageSize={PAGE_SIZE} />
    </>
  );
}
