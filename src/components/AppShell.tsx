'use client';

import { Suspense, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import { syncNow, syncStatus } from '@/app/actions';
import { safeBack } from '@/lib/filters';
import { formatAgo, formatDateTime } from '@/lib/format';
import type { SyncStatus } from '@/lib/types';

const POLL_MS = 60_000;

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18zm0 2v14a7 7 0 0 1 0-14" />
    </svg>
  );
}

// Tabs keep the current range and filters. On a session page they come from the page the session was opened from.
function NavTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const back = pathname.startsWith('/sessions/') ? safeBack(params.get('back') ?? undefined) : null;
  const query = back ? (back.split('?')[1] ?? '') : pathname.startsWith('/sessions/') ? '' : params.toString();
  const suffix = query ? `?${query}` : '';
  const tab = pathname.startsWith('/sessions') ? '/sessions' : '/';
  return (
    <Tabs
      value={tab}
      variant="scrollable"
      scrollButtons={false}
      sx={{ minWidth: 0, flexGrow: 1, '& .MuiTab-root': { minWidth: 0, px: { xs: 1, sm: 2 } } }}
    >
      <Tab label="Overview" value="/" component={Link} href={`/${suffix}`} />
      <Tab label="Sessions" value="/sessions" component={Link} href={`/sessions${suffix}`} />
    </Tabs>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [now, setNow] = useState(0);
  const seen = useRef(0);
  const { mode, systemMode, setMode } = useColorScheme();

  // Polls the server's sync state. When the background sync has brought in new data, the page re-renders.
  const poll = useCallback(() => {
    if (document.visibilityState !== 'visible') return Promise.resolve();
    return syncStatus().then((next) => {
      setStatus(next);
      setNow(Date.now());
      if (seen.current && next.lastSync > seen.current) router.refresh();
      seen.current = next.lastSync;
    });
  }, [router]);

  useEffect(() => {
    void poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [poll]);

  const sync = () =>
    startTransition(async () => {
      const result = await syncNow();
      setMessage('error' in result ? result.error : `Synced ${result.newCalls.toLocaleString('en-AU')} new calls`);
      router.refresh();
      await poll();
    });
  const effective = mode === 'system' ? systemMode : mode;
  const statusText = !status
    ? 'Sync'
    : status.syncing
      ? 'Syncing'
      : status.lastSync
        ? `Synced ${formatAgo(status.lastSync, now)}`
        : 'Not synced yet';
  const statusTitle = status?.error
    ? status.error
    : status?.lastSync
      ? `Last sync ${formatDateTime(status.lastSync)}. Click to sync now.`
      : 'Sync now from the Copilot session store';

  return (
    <>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Toolbar variant="dense" sx={{ gap: { xs: 1, sm: 2 } }}>
          <Typography
            variant="h6"
            component={Link}
            href="/"
            noWrap
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700, flexShrink: 0, fontSize: { xs: '1rem', sm: '1.25rem' } }}
          >
            muh-tokens
          </Typography>
          <Suspense fallback={<Box sx={{ flexGrow: 1 }} />}>
            <NavTabs />
          </Suspense>
          <Tooltip title={statusTitle}>
            <span>
              <Button
                size="small"
                color={status?.error ? 'warning' : 'inherit'}
                onClick={sync}
                disabled={pending}
                startIcon={<RefreshIcon />}
                aria-label="Sync now"
                sx={{
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  color: status?.error ? undefined : 'text.secondary',
                  '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  {status?.error ? 'Sync failed' : statusText}
                </Box>
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={`Switch to ${effective === 'dark' ? 'light' : 'dark'} mode`}>
            <IconButton aria-label="Toggle colour scheme" onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')}>
              <ThemeIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
        {pending && <LinearProgress sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />}
      </AppBar>
      <Snackbar
        open={message !== null}
        message={message}
        autoHideDuration={5000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box component="main">{children}</Box>
      </Container>
    </>
  );
}
