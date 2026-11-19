import { connection } from 'next/server';
import Grid from '@mui/material/Grid';
import BreakdownTable from '@/components/BreakdownTable';
import FiltersBar from '@/components/FiltersBar';
import KpiCards from '@/components/KpiCards';
import TimeChart from '@/components/TimeChart';
import TimelineChart from '@/components/TimelineChart';
import TypeBreakdown from '@/components/TypeBreakdown';
import type { SearchParams } from '@/lib/filters';
import { getBreakdown, getFilterOptions, getTimelines, getTotals } from '@/lib/queries';
import { getRequestFilters, getStore, getSyncStatus } from '@/lib/server';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const params = await searchParams;
  const db = getStore();
  const filters = getRequestFilters(db, params);
  const totals = getTotals(db, filters);
  const { projects, models } = getFilterOptions(db);
  const timelines = getTimelines(db, filters);

  return (
    <>
      <FiltersBar filters={filters} projects={projects} models={models} sync={getSyncStatus()} showBucket />
      <KpiCards totals={totals} />
      <TimelineChart timeline={timelines.bars} filters={filters} />
      <TimeChart timeline={timelines.time} filters={filters} />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, xl: 5 }}>
          <TypeBreakdown totals={totals} />
        </Grid>
        <Grid size={{ xs: 12, xl: 7 }}>
          <BreakdownTable title="Top sessions in range" rows={getBreakdown(db, filters, 'session', 10)} total={totals.aicTotal} sessionLinks />
        </Grid>
        <Grid size={{ xs: 12, lg: 6, xl: 4 }}>
          <BreakdownTable title="By model" rows={getBreakdown(db, filters, 'model')} total={totals.aicTotal} />
        </Grid>
        <Grid size={{ xs: 12, lg: 6, xl: 4 }}>
          <BreakdownTable title="By project" rows={getBreakdown(db, filters, 'project')} total={totals.aicTotal} />
        </Grid>
        <Grid size={{ xs: 12, xl: 4 }}>
          <BreakdownTable title="By agent" rows={getBreakdown(db, filters, 'agent')} total={totals.aicTotal} />
        </Grid>
      </Grid>
    </>
  );
}
