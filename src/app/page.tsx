import { connection } from 'next/server';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import CreditMix from '@/components/CreditMix';
import FiltersBar from '@/components/FiltersBar';
import KpiCards from '@/components/KpiCards';
import RewritesPanel from '@/components/RewritesPanel';
import TopSpenders from '@/components/TopSpenders';
import UsageChart from '@/components/UsageChart';
import { pathWithFilters, type SearchParams } from '@/lib/filters';
import { getBreakdown, getFilterOptions, getRewriteSummary, getTotals, getUsageTimeline } from '@/lib/queries';
import { getRequestFilters, getStore } from '@/lib/server';

const CONTRIBUTORS = 6;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const params = await searchParams;
  const db = getStore();
  const filters = getRequestFilters(db, params);
  const totals = getTotals(db, filters);
  const { projects, models } = getFilterOptions(db);
  const spenders = {
    session: getBreakdown(db, filters, 'session', 10),
    project: getBreakdown(db, filters, 'project', 10),
    model: getBreakdown(db, filters, 'model', 10),
    agent: getBreakdown(db, filters, 'agent', 10),
  };
  const contributorDim = filters.stack === 'type' ? 'session' : filters.stack;

  return (
    <>
      <FiltersBar filters={filters} projects={projects} models={models} />
      <Typography variant="h1" sx={{ mb: 2 }}>
        Overview
      </Typography>
      <KpiCards totals={totals} />
      <UsageChart
        timeline={getUsageTimeline(db, filters)}
        filters={filters}
        contributors={spenders[contributorDim].slice(0, CONTRIBUTORS)}
        totalAic={totals.aicTotal}
      />
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <CreditMix totals={totals} />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <RewritesPanel summary={getRewriteSummary(db, filters)} totals={totals} back={pathWithFilters('/', filters)} />
        </Grid>
      </Grid>
      <TopSpenders rows={spenders} totalAic={totals.aicTotal} filters={filters} />
    </>
  );
}
