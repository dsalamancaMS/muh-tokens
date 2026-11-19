import { connection } from 'next/server';
import Typography from '@mui/material/Typography';
import FiltersBar from '@/components/FiltersBar';
import SessionsGrid from '@/components/SessionsGrid';
import type { SearchParams } from '@/lib/filters';
import { getFilterOptions, getSessions } from '@/lib/queries';
import { getRequestFilters, getStore, getSyncStatus } from '@/lib/server';

export const metadata = { title: 'Sessions | muh-tokens' };

export default async function SessionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const params = await searchParams;
  const db = getStore();
  const filters = getRequestFilters(db, params);
  const { projects, models } = getFilterOptions(db);
  const sessions = getSessions(db, filters);

  return (
    <>
      <FiltersBar filters={filters} projects={projects} models={models} sync={getSyncStatus()} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {sessions.length} sessions with calls in this range. Totals cover each whole session. Click a row for its timeline.
      </Typography>
      <SessionsGrid rows={sessions} />
    </>
  );
}
