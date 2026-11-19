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
}

export interface TimelineSeries {
  id: string;
  label: string;
  color?: string;
  values: number[];
}

export interface Timeline {
  buckets: number[];
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

export interface CallRow {
  id: number;
  ts: number;
  agentId: string;
  agent: string;
  model: string;
  initiator: string | null;
  effort: string | null;
  durationMs: number | null;
  context: number;
  tokens: ByType;
  aic: ByType;
  aicTotal: number;
  gapS: number | null;
  idleRewrite: boolean;
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
  calls: CallRow[];
  agents: AgentSummary[];
}

export interface SyncStatus {
  lastSync: number;
  scanning: boolean;
  scanError: string | null;
}
