import { useState } from 'react';
import { placeOrder } from '../api/mt5';
import { OrderRequest } from '../types';
import { Button } from './ui/Button';
import { useSettings } from '../context/SettingsContext';

interface ExecuteTradeButtonProps {
  symbol: string;
  direction: 'buy' | 'sell';
  volume: number;
  entryPrice: number;
  stopPips: number;
  tp1Pips?: number;
  pendingOrder: boolean;
  armed: boolean;
  onOrderPlaced: (result: { order_ticket: number; position_ticket: number | null }) => void;
  onError: (error: string) => void;
}

export function ExecuteTradeButton({
  symbol,
  direction,
  volume,
  entryPrice,
  stopPips,
  pendingOrder,
  armed,
  onOrderPlaced,
  onError
}: ExecuteTradeButtonProps) {
  const [loading, setLoading] = useState(false);
  const { settings } = useSettings();

  const handleExecute = async () => {
    if (!armed) return;

    setLoading(true);
    try {
      // Get pip_size from settings for this symbol
      const symbolPreset = settings.symbol_presets.find(p => p.symbol === symbol);
      const pipSize = symbolPreset?.pip_size || 0.0001; // Default to forex pip size
      
      // Calculate SL and TP prices using actual pip size
      const slPrice = direction === 'buy'
        ? entryPrice - (stopPips * pipSize)
        : entryPrice + (stopPips * pipSize);

      const request: OrderRequest = {
        symbol,
        direction,
        volume,
        // IMPORTANT: `price=null` => market order (backend uses TRADE_ACTION_DEAL)
        // `price=entryPrice` => pending order (backend uses TRADE_ACTION_PENDING)
        price: pendingOrder ? entryPrice : null,
        sl_price: slPrice,
        tp_price: null,  // TP1 is internal — never set broker-side TP
        ui_armed: armed
      };

      console.log('Executing order:', {
        symbol,
        direction,
        entry: entryPrice,
        sl: slPrice,
        tp: null,
        pipSize,
        stopPips
      });

      const response = await placeOrder(request);

      const order_ticket = response.order_ticket ?? response.ticket;
      const position_ticket = response.position_ticket ?? null;

      if (response.success && order_ticket) {
        onOrderPlaced({ order_ticket, position_ticket });
      } else {
        onError(response.error || 'Order failed');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  if (volume <= 0) return null;

  return (
    <Button
      onClick={handleExecute}
      disabled={!armed || loading}
      variant="primary"
      className="w-full"
    >
      {loading ? 'Executing…' : (pendingOrder ? 'Place Pending Order' : 'Execute Market Order')}
    </Button>
  );
}