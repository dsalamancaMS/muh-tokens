import type { TokenType } from './cost.ts';

export type ByType = Record<TokenType, number>;

export interface UsageTotals {
  calls: number;
  sessions: number;
  aic: ByType;
  tokens: ByType;
  aicTotal: number;
  tokensTotal: number;
  rewrites: number;
  rewriteAic: number;
}

export interface BreakdownRow extends UsageTotals {
  key: string;
  label: string;
  // Second line for sessions: project and short id, so sessions with the same title can be told apart.
  detail?: string;
}

export interface RewriteSummary {
  sessions: { key: string; label: string; detail: string; aic: number; rewrites: number }[];
  gaps: { label: string; count: number; aic: number }[];
}

export interface TimelineSeries {
  id: string;
  label: string;
  color?: string;
  values: number[];
}

export interface Timeline {
  buckets: number[];
  bucketMinutes: number;
  series: TimelineSeries[];
}

export interface SessionRow extends UsageTotals {
  id: string;
  title: string;
  project: string;
  cwd: string | null;
  branch: string | null;
  firstTs: number;
  lastTs: number;
  subagents: number;
  models: string;
  peakContext: number;
}

// One 5-minute rollup of a session's calls for one agent and model.
export interface UsageSlice {
  ts: number;
  agentId: string;
  agent: string;
  model: string;
  calls: number;
  maxContext: number;
  tokens: ByType;
  aic: ByType;
  aicTotal: number;
  rewriteAic: number;
}

export interface RewriteRow {
  id: number;
  ts: number;
  agentId: string;
  agent: string;
  model: string;
  gapS: number;
  context: number;
  cacheWriteTokens: number;
  cacheWriteAic: number;
  aicTotal: number;
}

export interface AgentSummary extends UsageTotals {
  agentId: string;
  label: string;
  name: string;
  models: string;
  executionMode: string | null;
  firstTs: number;
  lastTs: number;
  peakContext: number;
}

export interface SessionDetail {
  session: SessionRow;
  slices: UsageSlice[];
  rewrites: RewriteRow[];
  agents: AgentSummary[];
}

export interface SyncStatus {
  lastSync: number;
  syncing: boolean;
  error: string | null;
}
