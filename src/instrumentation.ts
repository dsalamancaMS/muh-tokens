// Runs once when the Next.js server starts: syncs the store, then keeps syncing on a timer.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startSyncTimer } = await import('./lib/server');
  startSyncTimer();
}
