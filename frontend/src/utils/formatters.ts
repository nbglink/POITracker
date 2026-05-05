export function formatPipValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : 3;
  return value.toFixed(decimals);
}

/** Format a lot volume to 2 decimal places. */
export function formatVolume(v: number): string {
  return v.toFixed(2);
}

/** Format a monetary amount with sign and $ prefix; returns '' for null/undefined. */
export function formatMoney(v: number | null | undefined): string {
  if (v == null) return '';
  const sign = v >= 0 ? '+' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}
