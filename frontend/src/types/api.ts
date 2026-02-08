/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * MT5 connection status
 */
export interface MT5Status {
  connected: boolean;
  account_info: {
    balance: number;
    equity: number;
    margin: number;
    login: number;
  } | null;
  terminal_info: Record<string, unknown> | null;
}

/**
 * Order request for MT5 execution
 */
export interface OrderRequest {
  symbol: string;
  direction: 'buy' | 'sell';
  volume: number;
  price: number | null;
  sl_price: number;
  tp_price: number | null;
  ui_armed: boolean;
}

/**
 * Partial close request
 */
export interface PartialCloseRequest {
  // Preferred
  position_ticket?: number;
  percent?: number;

  // Legacy
  ticket?: number;
  volume?: number;

  ui_armed: boolean;
}

/**
 * Modify SL request
 */
export interface ModifySLRequest {
  ticket: number;
  sl_price: number;
  ui_armed: boolean;
}

/**
 * Order response from MT5
 */
export interface OrderResponse {
  success: boolean;
  ticket: number | null;
  order_ticket?: number | null;
  position_ticket?: number | null;
  error: string | null;
}

export interface PartialCloseResponse extends OrderResponse {
  position_ticket?: number | null;
  symbol?: string | null;
  position_volume?: number | null;
  percent?: number | null;
  requested_volume?: number | null;
  close_volume?: number | null;
  remaining_volume?: number | null;
  blocked_reason?: string | null;
  volume_min?: number | null;
  volume_step?: number | null;
  mt5_retcode?: number | null;
  mt5_comment?: string | null;
}

/** Raw open positions from GET /mt5/positions (magic-filtered server-side). */
export interface OpenPositionInfo {
  ticket: number;
  symbol: string;
  type: number;
  volume: number;
  price_open: number;
  sl: number | null;
  tp: number | null;
  magic: number;
  comment: string | null;
  time: number | null;
}

/** Position snapshot returned by backend. */
export interface PositionInfo {
  position_ticket: number;
  symbol: string;
  direction: 'buy' | 'sell';
  volume: number;
  price_open: number;
  sl: number | null;
  tp: number | null;
  digits: number;
  pip_in_price: number;
  volume_min: number;
  volume_step: number;
}

export interface PositionResponse {
  success: boolean;
  position: PositionInfo | null;
  error: string | null;
}

export interface MoveSLToBERequest {
  ticket: number;
  be_buffer_pips: number;
  ui_armed: boolean;
}

export interface MoveToBERequest {
  position_ticket: number;
  buffer_pips: number;
  ui_armed: boolean;
}

export interface TP1ManageRequest {
  ticket: number;
  partial_percent: number;
  move_to_be_enabled: boolean;
  be_buffer_pips: number;
  ui_armed: boolean;
}

export interface TP1ManageResponse {
  success: boolean;
  position_ticket: number | null;
  closed_volume_requested: number | null;
  closed_volume_normalized: number | null;
  sl_price_set: number | null;
  error: string | null;
}