import { useCallback, useEffect, useMemo, useState } from 'react';
import { InputForm } from '../components/calculator/InputForm';
import { VolumeHero } from '../components/calculator/VolumeHero';
import { RiskVisualizer } from '../components/calculator/RiskVisualizer';
import { WarningBanner } from '../components/calculator/WarningBanner';
import { TradePreview } from '../components/calculator/TradePreview';
import { ArmedToggle } from '../components/ArmedToggle';
import { ExecuteTradeButton } from '../components/ExecuteTradeButton';
import { PostOrderPanel } from '../components/PostOrderPanel';
import { Toast } from '../components/Toast';
import { SymbolsPanel } from '../components/SymbolsPanel';
import { useCalculation } from '../hooks/useCalculation';
import { useSettings } from '../context/SettingsContext';
import { RiskCalcInput, CalculatorFormState } from '../types/trade';
import { getSymbolDefaults } from '../utils/symbolDefaults';
import { getPositions } from '../api/mt5';
import type { OpenPositionInfo } from '../types';

type ManagedTrade = {
  id: string;
  symbol: string;
  direction: 'buy' | 'sell';
  order_ticket: number;
  position_ticket: number | null;
  created_at: number;
};

const MAGIC = 123456;

export function Calculator() {
  const { settings } = useSettings();
  const { result, loading, error, calculate } = useCalculation();

  // Trading state
  const [armed, setArmed] = useState(false);
  const [trades, setTrades] = useState<ManagedTrade[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; key: number } | null>(null);
  const [lastFormData, setLastFormData] = useState<CalculatorFormState | null>(null);
  const [showSymbols, setShowSymbols] = useState(false);

  const directionToPositionType = useMemo(() => {
    return (dir: 'buy' | 'sell') => (dir === 'buy' ? 0 : 1);
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const positions: OpenPositionInfo[] = await getPositions();
        if (!alive) return;

        setTrades((prev) => {
          const now = Date.now();
          const byTicket = new Set(positions.map((p) => p.ticket));
          const next: ManagedTrade[] = [];

          // Collect tickets already claimed by resolved trades to avoid
          // matching the same position to multiple trade cards (hedging fix)
          const claimedTickets = new Set(
            prev.filter((x) => x.position_ticket != null).map((x) => x.position_ticket)
          );

          for (const t of prev) {
            // Auto-remove unresolved pending fills after 60s.
            if (t.position_ticket == null && now - t.created_at > 60_000) {
              continue;
            }

            // If resolved, remove when no longer open.
            if (t.position_ticket != null) {
              if (!byTicket.has(t.position_ticket)) continue;
              next.push(t);
              continue;
            }

            // Resolve pending fills by symbol+direction+magic, newest by time.
            const wantType = directionToPositionType(t.direction);
            const matches = positions
              .filter((p) => p.magic === MAGIC && p.symbol === t.symbol && p.type === wantType)
              .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

            // Pick first match not already claimed by another trade
            const match = matches.find((m) => !claimedTickets.has(m.ticket));
            if (match) {
              claimedTickets.add(match.ticket);
              next.push({ ...t, position_ticket: match.ticket });
            } else {
              next.push(t);
            }
          }

          return next;
        });
      } catch {
        // Swallow polling errors; trade panels will keep their last state.
      }
    }

    timer = setInterval(tick, 2000);
    tick();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [directionToPositionType]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, key: Date.now() });
  };

  const hideToast = () => setToast(null);

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
            <SymbolsPanel onApply={(n) => showToast(`Applied ${n} symbols`, 'success')} />
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
                      const id = `${order_ticket}-${Date.now()}`;
                      setTrades((prev) => [
                        ...prev,
                        {
                          id,
                          symbol: lastFormData.symbol,
                          direction: lastFormData.direction,
                          order_ticket,
                          position_ticket,
                          created_at: Date.now(),
                        },
                      ]);
                      showToast(
                        `Order placed! order=${order_ticket}${position_ticket ? `, position=${position_ticket}` : ''}`,
                        'success'
                      );
                    }}
                    onError={(error) => showToast(error, 'error')}
                  />
                )}

                {/* Post-order actions */}
                {trades.map((t) => (
                  <PostOrderPanel
                    key={t.id}
                    orderTicket={t.order_ticket}
                    positionTicket={t.position_ticket}
                    symbol={t.symbol}
                    direction={t.direction}
                    armed={armed}
                    tp1Pips={result.tp1_pips ?? undefined}
                    partialPercent={result.partial_percent}
                    moveToBEEnabled={settings.move_to_be_enabled}
                    beBufferPips={settings.be_buffer_pips}
                    onRemove={() => setTrades((prev) => prev.filter((x) => x.id !== t.id))}
                    onActionComplete={(_, success, message) => {
                      showToast(message, success ? 'success' : 'error');
                    }}
                  />
                ))}
              </>
            )}

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