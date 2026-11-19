export const TOKEN_TYPES = ['input', 'cacheRead', 'cacheWrite', 'output', 'reasoning'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export const TOKEN_TYPE_LABELS: Record<TokenType, string> = {
  input: 'Uncached input',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
  output: 'Output',
  reasoning: 'Reasoning',
};

export const TOKEN_TYPE_COLORS: Record<TokenType, string> = {
  input: '#78909c',
  cacheRead: '#43a047',
  cacheWrite: '#fb8c00',
  output: '#1e88e5',
  reasoning: '#8e24aa',
};

// Idle cache-rewrite rule used in the token_analysis reports: the same agent was idle for at
// least five minutes, and the call wrote at least half of a large context back to the cache.
export const IDLE_REWRITE = {
  minGapSeconds: 300,
  minContextTokens: 20_000,
  minWriteShare: 0.5,
};

export interface SourceUsageRow {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  reasoning_tokens: number | null;
  total_nano_aiu: number | null;
  token_details_json: string | null;
}

// Token counts are disjoint: output excludes reasoning, so the five counts add up to the call's
// total. Costs are in nano-AIC (1 AIC = 1e9 nano).
export interface CallCost {
  tokens: Record<TokenType, number>;
  nano: Record<TokenType, number>;
  // Difference between the recorded total and the per-type prices, usually rounding.
  nanoOther: number;
  nanoTotal: number;
  contextTokens: number;
}

interface TokenDetail {
  batchSize?: number;
  costPerBatch?: number;
  tokenCount?: number;
  tokenType?: string;
}

const DETAIL_TYPES: Record<string, 'input' | 'cacheRead' | 'cacheWrite' | 'output'> = {
  input: 'input',
  cache_read: 'cacheRead',
  cache_write: 'cacheWrite',
  output: 'output',
};

function parseDetails(json: string | null): TokenDetail[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as TokenDetail[]) : [];
  } catch {
    return [];
  }
}

export function splitCost(row: SourceUsageRow): CallCost {
  const tokens: Record<TokenType, number> = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  const exact: Record<TokenType, number> = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  const nanoTotal = row.total_nano_aiu ?? 0;
  const contextTokens = row.input_tokens ?? 0;

  const details = parseDetails(row.token_details_json);
  if (details.length > 0) {
    for (const detail of details) {
      const type = DETAIL_TYPES[detail.tokenType ?? ''];
      if (!type) continue;
      const count = detail.tokenCount ?? 0;
      tokens[type] += count;
      if (detail.batchSize) exact[type] += (count * (detail.costPerBatch ?? 0)) / detail.batchSize;
    }
  } else {
    tokens.cacheRead = row.cache_read_tokens ?? 0;
    tokens.cacheWrite = row.cache_write_tokens ?? 0;
    tokens.input = Math.max(0, contextTokens - tokens.cacheRead - tokens.cacheWrite);
    tokens.output = row.output_tokens ?? 0;
  }

  // Reasoning tokens are billed as output. Split the output price by token share.
  const reasoning = Math.min(row.reasoning_tokens ?? 0, tokens.output);
  if (reasoning > 0) {
    exact.reasoning = (exact.output * reasoning) / tokens.output;
    exact.output -= exact.reasoning;
    tokens.reasoning = reasoning;
    tokens.output -= reasoning;
  }

  const nano = {} as Record<TokenType, number>;
  let attributed = 0;
  for (const type of TOKEN_TYPES) {
    nano[type] = Math.round(exact[type]);
    attributed += nano[type];
  }

  return { tokens, nano, nanoOther: nanoTotal - attributed, nanoTotal, contextTokens };
}

export function isIdleRewrite(gapSeconds: number | null, contextTokens: number, cacheWriteTokens: number): boolean {
  return (
    gapSeconds !== null &&
    gapSeconds >= IDLE_REWRITE.minGapSeconds &&
    contextTokens >= IDLE_REWRITE.minContextTokens &&
    cacheWriteTokens >= IDLE_REWRITE.minWriteShare * contextTokens
  );
}
