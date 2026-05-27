import { apiClient } from './client';
import {
  OrderRequest,
  PartialCloseRequest,
  OrderResponse,
  PartialCloseResponse,
  OpenPositionInfo,
  PositionResponse,
  MoveToBERequest,
  TP1WatcherSetResponse,
  TP1WatcherStatus,
} from '../types';

export async function getArmedStatus(): Promise<boolean> {
  const response = await apiClient.get('/mt5/armed');
  return response.data.armed;
}

export async function setArmedStatus(armed: boolean): Promise<boolean> {
  const response = await apiClient.post('/mt5/armed', { armed });
  return response.data.armed;
}

export async function setBackendExecution(enabled: boolean): Promise<boolean> {
  const response = await apiClient.post<{ backend_enabled: boolean }>('/mt5/execution-enable', { armed: enabled });
  return response.data.backend_enabled;
}

export interface MT5SymbolInfo {
  name: string;
  path: string | null;
  trade_allowed: boolean;
  digits: number;
  point: number;
  trade_contract_size: number;
  description: string | null;
  pip_in_price: number;
  tick_size: number;
  tick_value: number;
  pip_size: number;
  pip_value_per_lot: number;
}

export interface SymbolsResponse {
  initialized: boolean;
  last_error?: string;
  error_message?: string;
  symbols: MT5SymbolInfo[];
}

export async function getSymbolsRaw(): Promise<SymbolsResponse> {
  const response = await apiClient.get<SymbolsResponse>('/mt5/symbols');
  return response.data;
}

export async function placeOrder(request: OrderRequest): Promise<OrderResponse> { 
  const response = await apiClient.post('/mt5/order', request);
  return response.data;
}

export async function partialClose(request: PartialCloseRequest): Promise<PartialCloseResponse> {
  const response = await apiClient.post('/mt5/partial-close', request);
  return response.data;
}

/** Close a position entirely (partial close with 100%). */
export async function closePosition(positionTicket: number, ui_armed: boolean): Promise<PartialCloseResponse> {
  const response = await apiClient.post('/mt5/partial-close', {
    position_ticket: positionTicket,
    percent: 100,
    ui_armed,
  });
  return response.data;
}

export async function getPosition(ticket: number): Promise<PositionResponse> {
  const response = await apiClient.get(`/mt5/position/${ticket}`);
  return response.data;
}

export async function getPositions(): Promise<OpenPositionInfo[]> {
  const response = await apiClient.get('/mt5/positions');
  return response.data;
}

export async function moveToBE(request: MoveToBERequest): Promise<OrderResponse> {
  const response = await apiClient.post('/mt5/move-to-be', request);
  return response.data;
}

// --- TP1 Watcher ---

export interface TP1WatcherOverrides {
  tp1_pips?: number;
  tp1_percent?: number;
  be_buffer_pips?: number;
}

export async function setTP1Watcher(
  enabled: boolean,
  ui_armed: boolean,
  overrides: TP1WatcherOverrides = {},
): Promise<TP1WatcherSetResponse> {
  const payload: Record<string, unknown> = { enabled, ui_armed };
  if (overrides.tp1_pips != null) payload.tp1_pips = overrides.tp1_pips;
  if (overrides.tp1_percent != null) payload.tp1_percent = overrides.tp1_percent;
  if (overrides.be_buffer_pips != null) payload.be_buffer_pips = overrides.be_buffer_pips;
  const response = await apiClient.post<TP1WatcherSetResponse>('/mt5/tp1/watcher', payload);
  return response.data;
}

export async function getTP1WatcherStatus(): Promise<TP1WatcherStatus> {
  const response = await apiClient.get<TP1WatcherStatus>('/mt5/tp1/watcher/status');
  return response.data;
}