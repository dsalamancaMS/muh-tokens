'use client';

import NextLink from 'next/link';
import MuiLink, { type LinkProps } from '@mui/material/Link';

// MUI link that navigates with the Next router. Server components cannot pass `component={NextLink}`
// across the client boundary, so they use this instead.
export default function RouterLink(props: LinkProps & { href: string }) {
  return <MuiLink component={NextLink} {...props} />;
}
