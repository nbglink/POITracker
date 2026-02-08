/**
 * User-configurable settings stored in localStorage
 */
export interface AppSettings {
  // Risk constraints
  max_stop_pips: number;

  // Trade management defaults
  tp1_pips: number;
  partial_percent: number;
  move_to_be_enabled: boolean;
  be_buffer_pips: number;

  // Broker constraints
  min_volume: number;
  volume_step: number;

  // Symbol presets
  symbol_presets: SymbolPreset[];

  // Selected symbol (exact MT5 symbol name). Empty means not selected.
  active_symbol: string;

  // UI preferences
  theme: 'dark' | 'light';
}

export interface SymbolPreset {
  symbol: string;
  pip_value_per_1_lot: number;
  pip_size: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  max_stop_pips: 50,
  tp1_pips: 30,
  partial_percent: 50,
  move_to_be_enabled: true,
  be_buffer_pips: 0,
  min_volume: 0.01,
  volume_step: 0.01,
  symbol_presets: [
    { symbol: 'XAUUSD', pip_value_per_1_lot: 10, pip_size: 0.1 },
    { symbol: 'BTCUSD', pip_value_per_1_lot: 1, pip_size: 1.0 },
    { symbol: 'EURUSD', pip_value_per_1_lot: 10, pip_size: 0.0001 },
  ],
  active_symbol: '',
  theme: 'dark',
};
