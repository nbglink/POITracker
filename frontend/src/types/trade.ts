/**
 * Trade direction enum matching backend TradeDirection
 */
export type TradeDirection = 'buy' | 'sell';

/**
 * Input parameters for risk calculation
 * Maps to backend RiskCalcInput
 */
export interface RiskCalcInput {
  account_balance: number;
  risk_percent: number;
  symbol: string;
  direction: TradeDirection;
  entry_price: number;
  stop_pips: number;
  max_stop_pips: number;
  tp1_pips: number | null;
  partial_percent: number;
  move_to_be_enabled: boolean;
  be_buffer_pips: number;
  pip_value_per_1_lot: number;
  min_volume: number;
  volume_step: number;
}

/**
 * Output from risk calculation
 * Maps to backend RiskCalcOutput
 */
export interface RiskCalcOutput {
  allowed: boolean;
  volume_raw: number;
  volume: number;
  target_risk_amount: number;
  actual_risk_amount: number;
  target_risk_percent: number;
  actual_risk_percent: number;
  tp1_pips: number | null;
  partial_percent: number;
  remaining_volume: number;
  be_sl_price: number | null;
  warnings: string[];
}

/**
 * Form state for the calculator input
 * Uses strings for controlled inputs, converted on submit
 */
export interface CalculatorFormState {
  account_balance: string;
  risk_percent: string;
  symbol: string;
  direction: TradeDirection;
  entry_price: string;
  /** When true, place a pending (limit/stop) order at entry_price. */
  pending_order: boolean;
  stop_pips: string;
  tp1_pips: string;
  pip_value_per_1_lot: string;
}
