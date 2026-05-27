import { useEffect, useRef, useState } from 'react';
import { getOrders, cancelOrder } from '../api/mt5';
import { OpenOrderInfo } from '../types';
import { Button } from './ui/Button';
import { formatVolume as fmtVol } from '../utils/formatters';

interface WorkingOrdersPanelProps {
  armed: boolean;
  onAction: (message: string, type: 'success' | 'error') => void;
}

/**
 * Authoritative view of working (pending) orders, polled from /mt5/orders.
 * Unlike the in-session position cards, this reflects live broker state, so a
 * resting limit/stop order stays visible (and cancellable) until it fills or is
 * cancelled — even across reloads.
 */
export function WorkingOrdersPanel({ armed, onAction }: WorkingOrdersPanelProps) {
  const [orders, setOrders] = useState<OpenOrderInfo[]>([]);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const cancellingRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const next = await getOrders();
        if (alive) setOrders(next);
      } catch {
        // Swallow polling errors; keep last known list.
      }
    };

    timer = setInterval(tick, 2000);
    tick();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const handleCancel = async (ticket: number) => {
    if (!armed) return;
    setCancelling(ticket);
    cancellingRef.current = ticket;
    try {
      const res = await cancelOrder(ticket, armed);
      if (res.success) {
        setOrders((prev) => prev.filter((o) => o.ticket !== ticket));
        onAction(`Pending order #${ticket} cancelled`, 'success');
      } else {
        onAction(res.error || `Cancel failed for #${ticket}`, 'error');
      }
    } catch (e) {
      onAction(e instanceof Error ? e.message : 'Network error', 'error');
    } finally {
      setCancelling(null);
      cancellingRef.current = null;
    }
  };

  if (orders.length === 0) return null;

  return (
    <div className="terminal-card p-4">
      <h3 className="text-sm font-medium text-terminal-text mb-3">
        Working Orders <span className="text-terminal-text-secondary">({orders.length})</span>
      </h3>
      <div className="space-y-2">
        {orders.map((o) => {
          const isBuy = o.direction === 'buy';
          return (
            <div
              key={o.ticket}
              className={`flex items-center justify-between gap-3 rounded border p-2.5 text-xs border-l-2 ${
                isBuy ? 'border-green-500/30' : 'border-red-500/30'
              } border-terminal-border bg-terminal-bg/40`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>{o.type_label}</span>
                  <span className="text-terminal-text">{o.symbol}</span>
                  <span className="text-terminal-text-secondary">· {fmtVol(o.volume)} lots</span>
                </div>
                <div className="text-terminal-text-secondary tabular-nums">
                  Resting @ {o.price_open}
                  {o.sl ? ` · SL ${o.sl}` : ''}
                  {' · #'}{o.ticket}
                </div>
              </div>
              <Button
                onClick={() => handleCancel(o.ticket)}
                disabled={!armed || cancelling !== null}
                variant="secondary"
                size="sm"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 shrink-0"
              >
                {cancelling === o.ticket ? 'Cancelling…' : 'Cancel'}
              </Button>
            </div>
          );
        })}
      </div>
      {!armed && <div className="mt-2 text-xs text-red-400">Not armed: cancel disabled</div>}
    </div>
  );
}
