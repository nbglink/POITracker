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

const CURRENCY_PREFIX: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CHF: 'CHF ',
  AUD: 'A$',
  CAD: 'C$',
};

/**
 * Format a monetary amount with sign and currency prefix; '' for null/undefined.
 * `currency` is an account currency code (e.g. "EUR"); unknown codes fall back
 * to "<CODE> ", and an unset currency defaults to USD ($).
 */
export function formatMoney(v: number | null | undefined, currency?: string): string {
  if (v == null) return '';
  const sign = v >= 0 ? '+' : '-';
  const code = (currency || 'USD').toUpperCase();
  const prefix = CURRENCY_PREFIX[code] ?? `${code} `;
  return `${sign}${prefix}${Math.abs(v).toFixed(2)}`;
}
