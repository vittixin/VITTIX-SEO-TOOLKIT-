/** Small formatting helpers shared by the extension UIs. */

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Truncate long strings in the middle, keeping the informative ends. */
export function truncateMiddle(value: string, max = 64): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}

/** Score → color tone used consistently across UIs. */
export function scoreTone(total: number): 'emerald' | 'sky' | 'amber' | 'rose' {
  if (total >= 90) return 'emerald';
  if (total >= 75) return 'sky';
  if (total >= 50) return 'amber';
  return 'rose';
}
