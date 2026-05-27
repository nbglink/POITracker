/**
 * Order request for MT5 execution.
 *
 * For market orders prefer `stop_pips` so the backend anchors SL to the
 * actual fill price. `sl_price` is for pending orders (where the fill price
 * is the configured price).
 */
export interface OrderRequest {
  symbol: string;
  direction: 'buy' | 'sell';
  volume: number;
  price: number | null;
  sl_price: number | null;
  stop_pips?: number;
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

export interface MoveToBERequest {
  position_ticket: number;
  buffer_pips: number;
  ui_armed: boolean;
}

export interface TP1WatcherSetResponse {
  running: boolean;
  locked: boolean;
  pid?: number;
  reason?: string;
  message?: string;
}

export interface TP1WatcherEvent {
  ticket: number;
  symbol: string;
  direction: string;
  timestamp: number;
  profit_money: number | null;
  /** TP1 only */
  entry?: number;
  tp1_price?: number;
  close_price?: number;
  close_volume?: number;
  pips_profit?: number;
  be_status?: string;
  /** SL only */
  sl_price?: number;
  volume?: number;
  pips_loss?: number;
}

export interface TP1WatcherStatus {
  running: boolean;
  lock_owner_pid: number | null;
  lock_age_seconds: number | null;
  watched_positions: number;
  tp1_done_count: number;
  last_error: string | null;
  last_tp1_event: TP1WatcherEvent | null;
  last_sl_event: TP1WatcherEvent | null;
  mt5_connected: boolean;
  consecutive_connect_failures: number;
  ui_armed: boolean;
}