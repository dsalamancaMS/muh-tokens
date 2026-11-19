'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { mode, systemMode, setMode } = useColorScheme();
  const tab = pathname.startsWith('/sessions') ? '/sessions' : '/';
  const effective = mode === 'system' ? systemMode : mode;

  return (
    <>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 2 }}>
          <Typography variant="h6" component={Link} href="/" sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>
            muh-tokens
          </Typography>
          <Tabs value={tab} sx={{ flexGrow: 1 }}>
            <Tab label="Timeline" value="/" component={Link} href="/" />
            <Tab label="Sessions" value="/sessions" component={Link} href="/sessions" />
          </Tabs>
          <Tooltip title="Pull new calls from the Copilot session store">
            <IconButton aria-label="Refresh data" onClick={() => startTransition(() => router.refresh())}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={`Switch to ${effective === 'dark' ? 'light' : 'dark'} mode`}>
            <IconButton aria-label="Toggle colour scheme" onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')}>
              <ThemeIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
        {pending && <LinearProgress sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />}
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box component="main">{children}</Box>
      </Container>
    </>
  );
}
