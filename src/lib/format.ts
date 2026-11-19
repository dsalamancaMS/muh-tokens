// Server and browser rendering must format dates the same way, so the locale is fixed.
export const LOCALE = 'en-AU';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

export function formatAic(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 100) return integer.format(value);
  if (abs >= 1) return value.toFixed(1);
  if (abs >= 0.01) return value.toFixed(2);
  return value.toFixed(4);
}

export function formatTokens(value: number): string {
  return Math.abs(value) < 1000 ? integer.format(value) : compact.format(value);
}

export function formatInt(value: number): string {
  return integer.format(value);
}

export function formatPct(part: number, total: number): string {
  if (!total) return '0%';
  const pct = (100 * part) / total;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct >= 10 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return hours % 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${Math.floor(hours / 24)}d`;
}

export function formatBucket(ms: number, stepMinutes: number): string {
  const d = new Date(ms);
  if (stepMinutes >= 1440) return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
  if (stepMinutes >= 60) {
    return d.toLocaleString(LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function formatShortDateTime(ms: number): string {
  return new Date(ms).toLocaleString(LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatAgo(ms: number, now: number): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return 'just now';
  return `${formatDuration(minutes * 60_000)} ago`;
}
