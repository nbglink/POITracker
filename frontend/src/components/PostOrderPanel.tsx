import { useEffect, useMemo, useState } from 'react';
import { getPosition, moveToBE, partialClose, closePosition, setTP1Watcher, getTP1WatcherStatus } from '../api/mt5';
import { PartialCloseResponse, PositionInfo } from '../types';
import { Button } from './ui/Button';
import { formatVolume as fmtVol, formatMoney as fmtMoney } from '../utils/formatters';
import { useLiveData } from '../hooks/useLiveData';

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
  /** Account currency code (e.g. "EUR") for money formatting. */
  currency?: string;
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
  currency,
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
        if (res.success && res.position) {
          setPosition(res.position);
        } else {
          // Position not found — log warning instead of error toast.
          // This can happen briefly before the polling loop removes the card.
          console.warn(`[PostOrderPanel] Position ${positionTicket}: ${res.error}`);
          setPosition(null);
        }
      })
      .catch((e) => {
        if (!isMounted) return;
        console.warn(`[PostOrderPanel] Failed to resolve position ${positionTicket}:`, e);
        setPosition(null);
      });
    return () => { isMounted = false; };
  }, [positionTicket]);

  // Live price for this position's symbol → real-time pip P&L. Account stream
  // off; we only need the tick. Subscribes once the position is resolved.
  const { tick: liveTick } = useLiveData({
    symbol: position?.symbol,
    enablePrice: position != null,
    enableAccount: false,
  });

  // Running P&L in pips (and money when pip value is known), computed from the
  // live tick against the fill price. Exit side: a BUY closes at bid, SELL at ask.
  const livePnl = useMemo(() => {
    if (!position || !liveTick || liveTick.symbol !== position.symbol) return null;
    if (!(position.pip_in_price > 0)) return null;
    const exit = position.direction === 'buy' ? liveTick.bid : liveTick.ask;
    const pips =
      position.direction === 'buy'
        ? (exit - position.price_open) / position.pip_in_price
        : (position.price_open - exit) / position.pip_in_price;
    const money =
      position.pip_value_per_1_lot > 0
        ? pips * position.pip_value_per_1_lot * position.volume
        : null;
    return { pips, exit, money };
  }, [position, liveTick]);

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

  // Toggle backend watcher when Auto TP1 checkbox, armed state, or TP1
  // parameters change. Debounce by 300ms so editing the partial-percent
  // input doesn't restart the watcher on every keystroke.
  useEffect(() => {
    if (positionTicket == null) return;

    if (!armed) {
      setTP1Watcher(false, false)
        .then(() => setWatcherStatus('Disarmed — watcher paused'))
        .catch(() => setWatcherStatus('Watcher sync failed'));
      return;
    }

    const timer = setTimeout(() => {
      setTP1Watcher(autoTp1Enabled, armed, {
        tp1_pips: tp1Pips,
        tp1_percent: partialPercentLocal,
        be_buffer_pips: beBufferPips,
      })
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
    }, 300);

    return () => clearTimeout(timer);
  }, [autoTp1Enabled, armed, positionTicket, tp1Pips, partialPercentLocal, beBufferPips]);

  // Stop watcher on unmount
  useEffect(() => {
    return () => {
      setTP1Watcher(false, false).catch(() => {});
    };
  }, []);

  // Poll watcher status — detect TP1 and SL events for toast notifications.
  // Exponential backoff on consecutive failures (2s → 4s → 8s … capped at 30s).
  useEffect(() => {
    if (!autoTp1Enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;

    const tick = async () => {
      if (cancelled) return;
      try {
        const status = await getTP1WatcherStatus();
        consecutiveFailures = 0;

        if (status.running) {
          if (!status.mt5_connected) {
            setWatcherStatus(`Watcher active · MT5 disconnected (${status.consecutive_connect_failures} ticks)`);
          } else if (!status.ui_armed) {
            setWatcherStatus('Watcher active · ⚠ armed desync — toggle armed');
          } else {
            setWatcherStatus(
              status.tp1_done_count > 0
                ? `Watcher active · ${status.tp1_done_count} TP1(s) done`
                : `Watcher active · watching ${status.watched_positions} position(s)`
            );
          }
        } else {
          setWatcherStatus('Watcher stopped');
        }

        // TP1/SL toast notifications are fired by a single app-level poller in
        // Calculator, so they show even after this position's card unmounts
        // (an SL/TP close removes the card). This poll only drives the card's
        // own status text above.
      } catch {
        consecutiveFailures += 1;
      }

      if (cancelled) return;
      const baseMs = 2000;
      const delay = Math.min(baseMs * Math.pow(2, consecutiveFailures), 30_000);
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [autoTp1Enabled]);

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
            <div className="flex items-center gap-2 text-sm">
              <span className="text-terminal-text-secondary">Live P&amp;L:</span>
              {livePnl != null ? (
                <>
                  <span className={`font-semibold tabular-nums ${livePnl.pips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {livePnl.pips >= 0 ? '+' : ''}{livePnl.pips.toFixed(1)} pips
                  </span>
                  {livePnl.money != null && (
                    <span className={`font-semibold tabular-nums ${livePnl.money >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtMoney(livePnl.money, currency)}
                    </span>
                  )}
                  <span className="text-terminal-text-secondary">@ {livePnl.exit.toFixed(position.digits)}</span>
                </>
              ) : (
                <span className="text-terminal-text-secondary">waiting for price…</span>
              )}
            </div>
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