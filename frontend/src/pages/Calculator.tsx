import { useCallback, useEffect, useRef, useState } from 'react';
import { InputForm } from '../components/calculator/InputForm';
import { VolumeHero } from '../components/calculator/VolumeHero';
import { RiskVisualizer } from '../components/calculator/RiskVisualizer';
import { WarningBanner } from '../components/calculator/WarningBanner';
import { TradePreview } from '../components/calculator/TradePreview';
import { ArmedToggle } from '../components/ArmedToggle';
import { ExecuteTradeButton } from '../components/ExecuteTradeButton';
import { PostOrderPanel } from '../components/PostOrderPanel';
import { WorkingOrdersPanel } from '../components/WorkingOrdersPanel';
import { Toast } from '../components/Toast';
import { SymbolsPanel } from '../components/SymbolsPanel';
import { useCalculation } from '../hooks/useCalculation';
import { useLiveData } from '../hooks/useLiveData';
import { useSettings } from '../context/SettingsContext';
import { RiskCalcInput, CalculatorFormState } from '../types/trade';
import { getSymbolDefaults } from '../utils/symbolDefaults';
import { getPositions, getTP1WatcherStatus } from '../api/mt5';
import { formatMoney, formatVolume } from '../utils/formatters';

type ManagedTrade = {
  id: string;
  symbol: string;
  direction: 'buy' | 'sell';
  order_ticket: number;
  position_ticket: number | null;
  created_at: number;
};

export function Calculator() {
  const { settings, updateSettings } = useSettings();
  const { result, loading, error, calculate } = useCalculation();
  // Subscribe to account-only updates so we can label risk amounts in the
  // correct account currency (EUR/USD/etc) instead of hardcoded "$".
  const { account } = useLiveData({ enablePrice: false, enableAccount: true });

  // After each successful /calc, sync the active symbol's preset pip value to
  // whatever the backend actually used. This keeps the form display ("Pip
  // Value per Lot") consistent with the value used in the math (the backend
  // overrides the input when MT5 has authoritative tick specs).
  useEffect(() => {
    if (!result || !settings.active_symbol) return;
    const computed = result.pip_value_per_1_lot;
    if (typeof computed !== 'number' || computed <= 0) return;
    const preset = settings.symbol_presets.find((p) => p.symbol === settings.active_symbol);
    if (!preset) return;
    if (Math.abs(preset.pip_value_per_1_lot - computed) < 1e-6) return;
    const updated = settings.symbol_presets.map((p) =>
      p.symbol === settings.active_symbol ? { ...p, pip_value_per_1_lot: computed } : p,
    );
    updateSettings({ symbol_presets: updated });
  }, [result, settings.active_symbol, settings.symbol_presets, updateSettings]);

  // Trading state
  const [armed, setArmed] = useState(false);
  const [trades, setTrades] = useState<ManagedTrade[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; key: number } | null>(null);
  const [lastFormData, setLastFormData] = useState<CalculatorFormState | null>(null);
  const [showSymbols, setShowSymbols] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    // Reconcile position cards with live broker state every 2s. Cards are keyed
    // by position ticket: an existing card persists while its position is open,
    // and a card is (re)created for any app-owned position that lacks one. This
    // covers reloads, filled pending orders, and positions opened elsewhere in
    // the app — replacing the old 60s "auto-hide" heuristic. Pending (working)
    // orders are shown separately by WorkingOrdersPanel, not here.
    async function tick() {
      try {
        const positions = await getPositions();
        if (!alive) return;

        setTrades((prev) => {
          const open = new Map(positions.map((p) => [p.ticket, p]));
          const seen = new Set<number>();
          const next: ManagedTrade[] = [];

          // Keep existing cards whose position is still open (dedup by ticket).
          for (const t of prev) {
            const tk = t.position_ticket;
            if (tk != null && open.has(tk) && !seen.has(tk)) {
              next.push(t);
              seen.add(tk);
            }
            // Otherwise drop: position closed, or a stale null placeholder.
          }

          // Reconstruct a card for any open position without one.
          for (const p of positions) {
            if (seen.has(p.ticket)) continue;
            next.push({
              id: `pos-${p.ticket}`,
              symbol: p.symbol,
              direction: p.type === 0 ? 'buy' : 'sell',
              order_ticket: p.ticket,
              position_ticket: p.ticket,
              created_at: Date.now(),
            });
            seen.add(p.ticket);
          }

          return next;
        });
      } catch {
        // Swallow polling errors; cards keep their last state.
      }
    }

    timer = setInterval(tick, 2000);
    tick();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const hideToast = () => setToast(null);

  // Keep the latest account currency available to the (long-lived) notifier
  // poller without restarting it whenever the currency value arrives.
  const currencyRef = useRef<string | undefined>(account?.currency);
  useEffect(() => {
    currencyRef.current = account?.currency;
  }, [account?.currency]);

  // Single app-level poller for TP1/SL watcher events. Lives here (not in the
  // per-position card) so notifications fire even after the position's card has
  // unmounted — e.g. an SL close removes the card before its own poll could
  // report it. Seeds "last seen" from the first poll so it never replays an
  // event that happened before the app loaded.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let lastTp1Ts: number | null = null;
    let lastSlTs: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const status = await getTP1WatcherStatus();
        failures = 0;
        const cur = currencyRef.current;

        const tp1 = status.last_tp1_event;
        if (lastTp1Ts === null) {
          lastTp1Ts = tp1?.timestamp ?? 0;
        } else if (tp1 && tp1.timestamp > lastTp1Ts) {
          lastTp1Ts = tp1.timestamp;
          const pips = tp1.pips_profit ?? 0;
          const sign = pips >= 0 ? '+' : '';
          const be = tp1.be_status === 'ok' ? ' · SL → BE ✓' : ` · BE: ${tp1.be_status ?? 'unknown'}`;
          const money = tp1.profit_money != null ? ` · ${formatMoney(tp1.profit_money, cur)}` : '';
          showToast(
            `🎯 TP1 Hit!\n${tp1.symbol} ${tp1.direction} #${tp1.ticket}\n` +
              `Closed ${formatVolume(tp1.close_volume ?? 0)} lots @ ${tp1.close_price ?? '?'}\n` +
              `${sign}${pips} pips${money}${be}`,
            'success',
          );
        }

        const sl = status.last_sl_event;
        if (lastSlTs === null) {
          lastSlTs = sl?.timestamp ?? 0;
        } else if (sl && sl.timestamp > lastSlTs) {
          lastSlTs = sl.timestamp;
          const money = sl.profit_money != null ? ` · ${formatMoney(sl.profit_money, cur)}` : '';
          showToast(
            `🛑 SL Hit\n${sl.symbol} ${sl.direction} #${sl.ticket}\n` +
              `Closed ${formatVolume(sl.volume ?? 0)} lots @ ${sl.sl_price ?? '?'}\n` +
              `-${sl.pips_loss ?? 0} pips${money}`,
            'error',
          );
        }
      } catch {
        failures += 1;
      }
      if (cancelled) return;
      const delay = Math.min(2000 * Math.pow(2, failures), 30_000);
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showToast]);

  const handleCalculate = useCallback(
    async (formData: CalculatorFormState) => {
      setLastFormData(formData);
      const symDefaults = getSymbolDefaults(formData.symbol);
      const input: RiskCalcInput = {
        account_balance: parseFloat(formData.account_balance),
        risk_percent: parseFloat(formData.risk_percent),
        symbol: formData.symbol,
        direction: formData.direction,
        entry_price: parseFloat(formData.entry_price),
        stop_pips: parseFloat(formData.stop_pips),
        max_stop_pips: symDefaults.max_stop_pips,
        tp1_pips: parseFloat(formData.tp1_pips),
        partial_percent: settings.partial_percent,
        move_to_be_enabled: settings.move_to_be_enabled,
        be_buffer_pips: settings.be_buffer_pips,
        pip_value_per_1_lot: parseFloat(formData.pip_value_per_1_lot),
        min_volume: settings.min_volume,
        volume_step: settings.volume_step,
      };

      await calculate(input);
    },
    [calculate, settings]
  );

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Risk Calculator</h1>
            <p className="text-muted-foreground mt-1">
              Calculate position size based on risk parameters
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              className="px-3 py-1 rounded bg-terminal-border text-sm hover:opacity-90"
              onClick={() => setShowSymbols(prev => !prev)}
            >
              Symbols
            </button>
            <ArmedToggle armed={armed} onArmedChange={setArmed} />
          </div>
        </header>

        {showSymbols && (
          <div className="mb-6">
            <SymbolsPanel
              onApply={(n) => showToast(`Applied ${n} symbols`, 'success')}
              onError={(msg) => showToast(msg, 'error')}
            />
          </div>
        )}

        {/* Main grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column - Input form */}
          <div className="lg:col-span-5">
            <InputForm onCalculate={handleCalculate} loading={loading} />
          </div>

          {/* Right column - Results */}
          <div className="lg:col-span-7 space-y-6">
            {/* Volume Hero - Always visible with placeholder */}
            <VolumeHero
              volume={result?.volume ?? 0}
              volumeRaw={result?.volume_raw ?? 0}
              allowed={result?.allowed ?? true}
              hasWarning={(result?.warnings?.length ?? 0) > 0}
            />

            {/* Results section - Only when we have results */}
            {result && (
              <>
                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <WarningBanner warnings={result.warnings} />
                )}

                {/* Risk visualization */}
                <RiskVisualizer
                  targetRiskPercent={result.target_risk_percent}
                  actualRiskPercent={result.actual_risk_percent}
                  targetRiskAmount={result.target_risk_amount}
                  actualRiskAmount={result.actual_risk_amount}
                  currency={account?.currency}
                />

                {/* Trade management preview */}
                <TradePreview
                  tp1Pips={result.tp1_pips}
                  partialPercent={result.partial_percent}
                  remainingVolume={result.remaining_volume}
                  beSlPrice={result.be_sl_price}
                  volume={result.volume}
                />

                {/* Execute trade button */}
                {lastFormData && (
                  <ExecuteTradeButton
                    symbol={lastFormData.symbol}
                    direction={lastFormData.direction}
                    volume={result.volume}
                    entryPrice={parseFloat(lastFormData.entry_price)}
                    stopPips={parseFloat(lastFormData.stop_pips)}
                    tp1Pips={result.tp1_pips ?? undefined}
                    pendingOrder={lastFormData.pending_order}
                    armed={armed}
                    onOrderPlaced={({ order_ticket, position_ticket }) => {
                      // Market order → a position exists now: add a management
                      // card immediately (the poller also reconstructs it, but
                      // this avoids the ~2s delay). Pending order → no position
                      // yet; it shows in Working Orders until it fills.
                      if (position_ticket != null) {
                        setTrades((prev) =>
                          prev.some((x) => x.position_ticket === position_ticket)
                            ? prev
                            : [
                                ...prev,
                                {
                                  id: `pos-${position_ticket}`,
                                  symbol: lastFormData.symbol,
                                  direction: lastFormData.direction,
                                  order_ticket,
                                  position_ticket,
                                  created_at: Date.now(),
                                },
                              ],
                        );
                        showToast(`Order filled! position=${position_ticket}`, 'success');
                      } else {
                        showToast(`Pending order placed (#${order_ticket}) — see Working Orders`, 'success');
                      }
                    }}
                    onError={(error) => showToast(error, 'error')}
                  />
                )}
              </>
            )}

            {/* Working (pending) orders — always shown when any exist. */}
            <WorkingOrdersPanel armed={armed} onAction={showToast} />

            {/* Open position management cards — reconstructed from live state,
                so they persist across reloads and after pending fills. */}
            {trades.map((t) => (
              <PostOrderPanel
                key={t.id}
                orderTicket={t.order_ticket}
                positionTicket={t.position_ticket}
                symbol={t.symbol}
                direction={t.direction}
                armed={armed}
                tp1Pips={result?.tp1_pips ?? undefined}
                partialPercent={result?.partial_percent ?? settings.partial_percent}
                moveToBEEnabled={settings.move_to_be_enabled}
                beBufferPips={settings.be_buffer_pips}
                currency={account?.currency}
                onRemove={() => setTrades((prev) => prev.filter((x) => x.id !== t.id))}
                onActionComplete={(_, success, message) => {
                  showToast(message, success ? 'success' : 'error');
                }}
              />
            ))}

            {/* Error display */}
            {error && (
              <div className="terminal-card p-4 border-red-500/50 bg-red-500/10">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}
    </div>
  );
}