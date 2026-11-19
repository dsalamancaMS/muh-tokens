'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { TOKEN_TYPE_COLORS, TOKEN_TYPE_LABELS, TOKEN_TYPES } from '@/lib/cost';
import { formatAic, formatPct } from '@/lib/format';
import type { ByType } from '@/lib/types';

// A thin horizontal bar showing how a row's credits split across token types.
export default function TypeBar({ aic, total, width = 140 }: { aic: ByType; total: number; width?: number | string }) {
  const title = TOKEN_TYPES.filter((type) => aic[type] > 0)
    .map((type) => `${TOKEN_TYPE_LABELS[type]}: ${formatAic(aic[type])} (${formatPct(aic[type], total)})`)
    .join('\n');
  return (
    <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{title}</Box>}>
      <Box sx={{ display: 'flex', width, height: 10, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
        {TOKEN_TYPES.map((type) =>
          aic[type] > 0 ? (
            <Box key={type} sx={{ width: `${(100 * aic[type]) / total}%`, bgcolor: TOKEN_TYPE_COLORS[type] }} />
          ) : null,
        )}
      </Box>
    </Tooltip>
  );
}
