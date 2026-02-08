export function formatPipValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : 3;
  return value.toFixed(decimals);
}
