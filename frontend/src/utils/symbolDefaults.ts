/**
 * Symbol-aware default values for SL/TP pips.
 *
 * Proportional scaling (10x factor):
 *   XAUUSD: pip=$0.10 → SL=50 ($5),   TP=30 ($3)   → RR ~1:1.67
 *   BTCUSD: pip=$1.00 → SL=500 ($500), TP=300 ($300) → RR ~1:1.67
 *   Forex:  pip=$0.0001 → SL=50, TP=30               → RR ~1:1.67
 */

export interface SymbolDefaults {
  stop_loss_pips: number;
  take_profit_pips: number;
  max_stop_pips: number;
  pip_value_per_1_lot: number;
}

const SYMBOL_DEFAULTS: Record<string, SymbolDefaults> = {
  XAUUSD: {
    stop_loss_pips: 50,
    take_profit_pips: 30,
    max_stop_pips: 50,
    pip_value_per_1_lot: 10,
  },
  BTCUSD: {
    stop_loss_pips: 500,
    take_profit_pips: 300,
    max_stop_pips: 1000,
    pip_value_per_1_lot: 1,
  },
};

const FOREX_DEFAULTS: SymbolDefaults = {
  stop_loss_pips: 50,
  take_profit_pips: 30,
  max_stop_pips: 50,
  pip_value_per_1_lot: 10,
};

/** All known default SL/TP values — used to detect "untouched" fields */
const KNOWN_DEFAULTS = new Set([30, 50, 300, 500]);

/**
 * Returns sensible default SL/TP/pip_value for a given symbol.
 * Falls back to standard forex defaults for unknown symbols.
 */
export function getSymbolDefaults(symbol: string): SymbolDefaults {
  const upper = symbol.toUpperCase();

  if (SYMBOL_DEFAULTS[upper]) {
    return SYMBOL_DEFAULTS[upper];
  }

  // Partial match for broker suffixes (e.g. "BTCUSD.m", "XAUUSD.i")
  for (const [key, defaults] of Object.entries(SYMBOL_DEFAULTS)) {
    if (upper.startsWith(key)) {
      return defaults;
    }
  }

  return FOREX_DEFAULTS;
}

/**
 * Returns true if the value matches any known default.
 * Used to detect whether the user has manually customized a field.
 */
export function isDefaultValue(value: number): boolean {
  return KNOWN_DEFAULTS.has(value);
}
