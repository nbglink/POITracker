import { useState } from 'react';
import { placeOrder } from '../api/mt5';
import { OrderRequest } from '../types';
import { Button } from './ui/Button';

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

  const handleExecute = async () => {
    if (!armed) return;

    setLoading(true);
    try {
      // Always send only `stop_pips` and let the backend derive the SL price
      // from the MT5-accurate pip size — pending orders anchor SL to the
      // configured price, market orders to the broker's actual fill price.
      // (Computing SL here from a preset pip_size risked drift vs. the broker.)
      const request: OrderRequest = {
        symbol,
        direction,
        volume,
        price: pendingOrder ? entryPrice : null,
        sl_price: null,
        stop_pips: stopPips,
        tp_price: null,
        ui_armed: armed,
      };

      console.log('Executing order:', { symbol, direction, entry: entryPrice, stop_pips: stopPips, pending: pendingOrder });

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