import { apiClient } from './client';
import {
  MT5Status,
  OrderRequest,
  PartialCloseRequest,
  ModifySLRequest,
  OrderResponse,
  PartialCloseResponse,
  OpenPositionInfo,
  PositionResponse,
  MoveSLToBERequest,
  MoveToBERequest,
  TP1ManageRequest,
  TP1ManageResponse
} from '../types';

export async function getMT5Status(): Promise<MT5Status> {
  const response = await apiClient.get('/mt5/status');
  return response.data;
}

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

export async function getSymbols(): Promise<any[]> {
  const response = await apiClient.get<{
    initialized: boolean;
    last_error?: string;
    symbols: any[];
  }>('/mt5/symbols');
  return response.data.symbols || [];
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

export async function modifySL(request: ModifySLRequest): Promise<OrderResponse> {
  const response = await apiClient.post('/mt5/modify-sl', request);
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

export async function moveSLToBE(request: MoveSLToBERequest): Promise<OrderResponse> {
  const response = await apiClient.post('/mt5/move-sl-to-be', request);
  return response.data;
}

export async function moveToBE(request: MoveToBERequest): Promise<OrderResponse> {
  const response = await apiClient.post('/mt5/move-to-be', request);
  return response.data;
}

export async function manageTP1(request: TP1ManageRequest): Promise<TP1ManageResponse> {
  const response = await apiClient.post('/mt5/tp1', request);
  return response.data;
}

// --- TP1 Watcher ---

export async function setTP1Watcher(enabled: boolean, ui_armed: boolean): Promise<{ running: boolean; locked: boolean; pid?: number; reason?: string; message?: string }> {
  const response = await apiClient.post('/mt5/tp1/watcher', { enabled, ui_armed });
  return response.data;
}

export async function getTP1WatcherStatus(): Promise<{
  running: boolean;
  lock_owner_pid: number | null;
  lock_age_seconds: number | null;
  watched_positions: number;
  tp1_done_count: number;
  last_error: string | null;
}> {
  const response = await apiClient.get('/mt5/tp1/watcher/status');
  return response.data;
}