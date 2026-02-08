import { useEffect, useMemo, useRef, useState } from 'react';
import { getPosition, moveToBE, partialClose, closePosition, setTP1Watcher, getTP1WatcherStatus } from '../api/mt5';
import { PartialCloseResponse, PositionInfo } from '../types';
import { Button } from './ui/Button';

/** Format volume to 2 decimal places */
function fmtVol(v: number): string {
  return v.toFixed(2);
}

/** Format monetary amount with sign and $ */
function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '';
  const sign = v >= 0 ? '+' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

interface PostOrderPanelProps {
  orderTicket: number;
  positionTicket: number | null;
  symbol: string;
  direction: 'buy' | 'sell';
  armed: boolean;
  tp1Pips?: number;
  partialPercent: number;
  moveToBEEnabled: boolean;
  beBufferPips: number;
  onRemove: () => void;
  onActionComplete: (action: string, success: boolean, message: string) => void;
}

export function PostOrderPanel({
  orderTicket,
  positionTicket,
  symbol,
  direction,
  armed,
  tp1Pips,
  partialPercent,
  moveToBEEnabled,
  beBufferPips,
  onRemove,
  onActionComplete
}: PostOrderPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [autoTp1Enabled, setAutoTp1Enabled] = useState(true);
  const [tp1Done, setTp1Done] = useState(false);
  const [partialPercentLocal, setPartialPercentLocal] = useState(partialPercent);
  const [watcherStatus, setWatcherStatus] = useState<string>('');
  const [tp1Hint, setTp1Hint] = useState<{
    requested: number;
    close: number;
    remaining: number;
    min: number;
    step: number;
    blockedReason: string | null;
  } | null>(null);

  const lastSeenTp1TsRef = useRef<number>(0);
  const lastSeenSlTsRef = useRef<number>(0);

  useEffect(() => {
    setPartialPercentLocal(partialPercent);
    setTp1Done(false);
    setTp1Hint(null);
  }, [orderTicket, positionTicket, partialPercent]);

  // Resolve position from ticket
  useEffect(() => {
    let isMounted = true;
    if (positionTicket == null) {
      setPosition(null);
      return () => { isMounted = false; };
    }

    getPosition(positionTicket)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.position) setPosition(res.position);
        else onActionComplete('position', false, res.error || 'Failed to resolve position');
      })
      .catch((e) => {
        if (!isMounted) return;
        onActionComplete('position', false, e instanceof Error ? e.message : 'Network error');
      });
    return () => { isMounted = false; };
  }, [positionTicket, onActionComplete]);

  const tp1Price = useMemo(() => {
    if (!position || tp1Pips == null) return null;
    const delta = tp1Pips * position.pip_in_price;
    const raw = position.direction === 'buy' ? position.price_open + delta : position.price_open - delta;
    const factor = Math.pow(10, position.digits);
    return Math.round(raw * factor) / factor;
  }, [position, tp1Pips]);

  const tp1Precheck = useMemo(() => {
    if (!position) return null;
    const requested = position.volume * (partialPercentLocal / 100);
    const step = position.volume_step;
    const min = position.volume_min;
    const eps = 1e-12;
    const steps = step > 0 ? Math.floor((requested + eps) / step) : 0;
    const normalized = step > 0 ? steps * step : 0;
    const remaining = position.volume - normalized;
    const wouldCloseFull = partialPercentLocal < 100 && normalized >= position.volume;
    const remainingBelowMin = remaining > 0 && remaining < min;
    const blocked = normalized <= 0 || normalized < min || remainingBelowMin || wouldCloseFull;
    return { requested, normalized, remaining, min, step, blocked };
  }, [partialPercentLocal, position]);

  const applyTp1HintFromPartialClose = (res: PartialCloseResponse) => {
    if (!position) return;
    const requested = res.requested_volume ?? 0;
    const close = res.close_volume ?? 0;
    const remaining = res.remaining_volume ?? Math.max(0, position.volume - close);
    setTp1Hint({
      requested,
      close,
      remaining,
      min: res.volume_min ?? position.volume_min,
      step: res.volume_step ?? position.volume_step,
      blockedReason: res.blocked_reason ?? null,
    });
  };

  // Toggle backend watcher when Auto TP1 checkbox changes
  useEffect(() => {
    if (!armed || positionTicket == null) return;

    setTP1Watcher(autoTp1Enabled, armed)
      .then((res) => {
        if (autoTp1Enabled) {
          if (res.running) {
            setWatcherStatus('Watcher active');
          } else {
            setWatcherStatus(res.reason || 'Watcher failed to start');
            setAutoTp1Enabled(false);
          }
        } else {
          setWatcherStatus('');
        }
      })
      .catch(() => {
        setWatcherStatus('Watcher call failed');
        if (autoTp1Enabled) setAutoTp1Enabled(false);
      });
  }, [autoTp1Enabled, armed, positionTicket]);

  // Stop watcher on unmount
  useEffect(() => {
    return () => {
      setTP1Watcher(false, false).catch(() => {});
    };
  }, []);

  // Poll watcher status — detect TP1 and SL events for toast notifications
  useEffect(() => {
    if (!autoTp1Enabled) return;

    const interval = setInterval(async () => {
      try {
        const status = await getTP1WatcherStatus();

        if (status.running) {
          setWatcherStatus(
            status.tp1_done_count > 0
              ? `Watcher active · ${status.tp1_done_count} TP1(s) done`
              : `Watcher active · watching ${status.watched_positions} position(s)`
          );
        } else {
          setWatcherStatus('Watcher stopped');
        }

        // Check for new TP1 event
        const tp1Evt = (status as any).last_tp1_event;
        if (tp1Evt && typeof tp1Evt.timestamp === 'number' && tp1Evt.timestamp > lastSeenTp1TsRef.current) {
          lastSeenTp1TsRef.current = tp1Evt.timestamp;
          setTp1Done(true);

          const profitSign = tp1Evt.pips_profit >= 0 ? '+' : '';
          const beNote = tp1Evt.be_status === 'ok' ? ' · SL → BE ✓' : ` · BE: ${tp1Evt.be_status}`;
          const moneyStr = tp1Evt.profit_money != null ? ` · ${fmtMoney(tp1Evt.profit_money)}` : '';
          const message =
            `🎯 TP1 Hit!\n` +
            `${tp1Evt.symbol} ${tp1Evt.direction} #${tp1Evt.ticket}\n` +
            `Closed ${fmtVol(tp1Evt.close_volume)} lots @ ${tp1Evt.close_price}\n` +
            `${profitSign}${tp1Evt.pips_profit} pips${moneyStr}${beNote}`;

          onActionComplete('tp1_watcher', true, message);
        }

        // Check for new SL event
        const slEvt = (status as any).last_sl_event;
        if (slEvt && typeof slEvt.timestamp === 'number' && slEvt.timestamp > lastSeenSlTsRef.current) {
          lastSeenSlTsRef.current = slEvt.timestamp;

          const moneyStr = slEvt.profit_money != null ? ` · ${fmtMoney(slEvt.profit_money)}` : '';
          const message =
            `🛑 SL Hit\n` +
            `${slEvt.symbol} ${slEvt.direction} #${slEvt.ticket}\n` +
            `Closed ${fmtVol(slEvt.volume)} lots @ ${slEvt.sl_price}\n` +
            `-${slEvt.pips_loss} pips${moneyStr}`;

          onActionComplete('sl_hit', false, message);
        }
      } catch {
        // Ignore poll errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [autoTp1Enabled, onActionComplete]);

  const handleTP1Now = async () => {
    if (positionTicket == null) return;
    setLoading('tp1');
    try {
      const res = await partialClose({ position_ticket: positionTicket, percent: partialPercentLocal, ui_armed: armed });
      if (!res.success) {
        applyTp1HintFromPartialClose(res);
        onActionComplete('tp1', false, res.error || 'TP1 execution failed');
        return;
      }

      setTp1Done(true);
      setTp1Hint(null);

      const closed = res.close_volume ?? res.requested_volume;
      let msg = `TP1 executed. Closed ${closed != null ? fmtVol(closed) : 'N/A'} lots`;

      if (moveToBEEnabled) {
        const beRes = await moveToBE({ position_ticket: positionTicket, buffer_pips: beBufferPips, ui_armed: armed });
        if (beRes.success) msg += ' · SL moved to BE';
        else msg += ` · BE move failed: ${beRes.error || 'unknown error'}`;
      }

      onActionComplete('tp1', true, msg);
    } catch (error) {
      onActionComplete('tp1', false, error instanceof Error ? error.message : 'Network error');
    } finally {
      setLoading(null);
    }
  };

  const handleMoveToBE = async () => {
    if (positionTicket == null) return;
    setLoading('be');
    try {
      const res = await moveToBE({ position_ticket: positionTicket, buffer_pips: beBufferPips, ui_armed: armed });
      if (res.success) onActionComplete('move_be', true, 'SL moved to BE');
      else onActionComplete('move_be', false, res.error || 'Move to BE failed');
    } catch (error) {
      onActionComplete('move_be', false, error instanceof Error ? error.message : 'Network error');
    } finally {
      setLoading(null);
    }
  };

  const handleClosePosition = async () => {
    if (positionTicket == null) return;
    setLoading('close');
    try {
      const res = await closePosition(positionTicket, armed);
      if (res.success) {
        const closed = res.close_volume ?? res.position_volume;
        onActionComplete('close', true, `Position #${positionTicket} closed · ${closed != null ? fmtVol(closed) : '?'} lots`);
      } else {
        onActionComplete('close', false, res.error || 'Close position failed');
      }
    } catch (error) {
      onActionComplete('close', false, error instanceof Error ? error.message : 'Network error');
    } finally {
      setLoading(null);
    }
  };

  const isBuy = position ? position.direction === 'buy' : direction === 'buy';
  const dirLabel = isBuy ? 'BUY' : 'SELL';
  const dirBorderColor = isBuy ? 'border-green-500/30' : 'border-red-500/30';

  return (
    <div className={`terminal-card p-4 border-l-2 ${dirBorderColor}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-terminal-text">Position Management</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${isBuy ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {dirLabel}
        </span>
      </div>
      <div className="mb-3 text-xs text-terminal-text-secondary space-y-1">
        <div>Order: {orderTicket} · Position: {positionTicket ?? '—'}</div>
        {positionTicket == null && (
          <div className="text-amber-300">
            Pending fill… {symbol} {direction.toUpperCase()} (auto-hide in ~60s)
            <button type="button" className="ml-2 underline opacity-90 hover:opacity-100" onClick={onRemove}>
              Dismiss
            </button>
          </div>
        )}
        {position ? (
          <>
            <div>Symbol: {position.symbol} · Side: {position.direction.toUpperCase()} · Vol: {fmtVol(position.volume)}</div>
            {tp1Price != null && (
              <div>
                TP1 Price: {tp1Price} · Trigger: {position.direction === 'buy' ? 'Bid ≥ TP1' : 'Ask ≤ TP1'}
              </div>
            )}
          </>
        ) : (
          <div>{positionTicket == null ? 'Pending fill…' : 'Resolving position…'}</div>
        )}
        {!armed && <div className="text-red-400">Not armed: execution disabled</div>}
        {positionTicket == null && <div className="text-red-400">Actions disabled until position is resolved</div>}
      </div>

      {tp1Hint && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
          <div className="font-medium text-red-100">TP1 not executed (volume constraints)</div>
          <div>
            Requested: {fmtVol(tp1Hint.requested)} lots · Close: {fmtVol(tp1Hint.close)} lots · Remaining: {fmtVol(tp1Hint.remaining)} lots
          </div>
          <div>
            Broker: min={tp1Hint.min} · step={tp1Hint.step}
          </div>
          {tp1Hint.blockedReason && (
            <div className="mt-1">Reason: {tp1Hint.blockedReason}</div>
          )}
        </div>
      )}

      {tp1Precheck && (
        <div className={`mb-4 rounded border p-3 text-xs ${tp1Precheck.blocked ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-terminal-border bg-terminal-bg/40 text-terminal-text-secondary'}`}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="font-semibold text-sm text-terminal-text">TP1 Close %</div>
            <div className={`text-xs font-medium ${tp1Precheck.blocked ? 'text-amber-400' : 'text-green-400'}`}>
              {tp1Precheck.blocked ? '⚠ Will be blocked' : '✓ Looks OK'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={partialPercentLocal}
              onChange={(e) => {
                setTp1Hint(null);
                const v = Number(e.target.value);
                setPartialPercentLocal(Number.isFinite(v) ? Math.max(1, Math.min(100, v)) : partialPercentLocal);
              }}
              disabled={loading !== null}
              className={
                `w-20 rounded border px-2 py-1.5 text-sm font-semibold tabular-nums ` +
                `bg-terminal-bg text-terminal-text ` +
                `focus:outline-none focus:ring-2 ` +
                (tp1Precheck.blocked
                  ? 'border-amber-500/60 focus:ring-amber-500/40 focus:border-amber-500'
                  : 'border-terminal-border focus:ring-accent/30 focus:border-accent/60')
              }
              aria-label="TP1 partial close percent"
            />
            <span className="text-terminal-text-secondary">%</span>
            {[25, 50, 75].map((pct) => (
              <button
                key={pct}
                type="button"
                className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors
                  ${partialPercentLocal === pct
                    ? 'border-accent/60 bg-accent/20 text-accent'
                    : 'border-terminal-border bg-terminal-bg text-terminal-text-secondary hover:border-terminal-text-secondary hover:text-terminal-text'
                  }`}
                onClick={() => { setTp1Hint(null); setPartialPercentLocal(pct); }}
                disabled={loading !== null}
              >
                {pct}
              </button>
            ))}
          </div>

          <div className="mt-2 text-terminal-text-secondary">
            Requested: {fmtVol(tp1Precheck.requested)} lots · Normalized: {fmtVol(tp1Precheck.normalized)} lots
          </div>
          <div className="text-terminal-text-secondary">
            Broker: min={tp1Precheck.min} · step={tp1Precheck.step}
          </div>
          {tp1Precheck.blocked && (
            <div className="mt-1.5 text-xs text-amber-300 font-medium">
              ⚠ Partial close will be blocked by broker min/step rules. Adjust TP1 Close %.
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-terminal-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoTp1Enabled}
            onChange={(e) => setAutoTp1Enabled(e.target.checked)}
            disabled={loading !== null || tp1Pips == null || !armed || positionTicket == null}
            className="accent-accent"
          />
          Auto TP1
        </label>
        <div className={`text-xs font-medium ${tp1Done ? 'text-green-400' : autoTp1Enabled ? 'text-accent' : 'text-terminal-text-secondary'}`}>
          {tp1Done ? '✓ TP1 done' : watcherStatus}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handleTP1Now}
          disabled={loading !== null || !armed || positionTicket == null}
          variant="secondary"
          size="sm"
          className="flex-1"
        >
          {loading === 'tp1' ? 'EXECUTING...' : `TP1 (${partialPercentLocal}%)`}
        </Button>
        <Button
          onClick={handleMoveToBE}
          disabled={loading !== null || !armed || positionTicket == null}
          variant="secondary"
          size="sm"
          className="flex-1"
        >
          {loading === 'be' ? 'MOVING...' : 'BE SL'}
        </Button>
      </div>

      <div className="mt-3">
        <Button
          onClick={handleClosePosition}
          disabled={loading !== null || !armed || positionTicket == null}
          variant="secondary"
          size="sm"
          className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10"
        >
          {loading === 'close' ? 'CLOSING...' : 'Close Position'}
        </Button>
      </div>
    </div>
  );
}