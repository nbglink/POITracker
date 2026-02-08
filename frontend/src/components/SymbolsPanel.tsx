import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { Button } from './ui/Button';

interface SymbolRow {
  name: string;
  path?: string;
  trade_allowed?: boolean;
  digits?: number;
  point?: number;
  trade_contract_size?: number;
  description?: string;
  pip_size?: number;
  pip_value_per_lot?: number;
  pip_in_price?: number;
  tick_size?: number;
  tick_value?: number;
}

// Use server-calculated values, fallback to client calculation only if needed
function getPipValues(s: SymbolRow) {
  // If server provided pip values, use them
  if (s.pip_size !== undefined && s.pip_value_per_lot !== undefined) {
    return { pip_size: s.pip_size, pip_value_per_1_lot: s.pip_value_per_lot };
  }

  // Fallback calculation (shouldn't be needed with updated backend)
  const name = s.name || '';
  const contract = typeof s.trade_contract_size === 'number' ? s.trade_contract_size : 1;

  let pip_size = 0;

  if (/BTC|XBT|ETH|LTC|XRP/i.test(name)) {
    pip_size = 1.0; // Crypto: $1 pip
  } else if (/XAU|GOLD/i.test(name)) {
    pip_size = 0.1; // Gold: $0.10 pip
  } else if (/JPY/i.test(name)) {
    pip_size = 0.01; // JPY pairs
  } else {
    pip_size = 0.0001; // Standard forex
  }

  const pip_value_per_1_lot = contract * pip_size;

  return { pip_size, pip_value_per_1_lot };
}

interface SymbolsResponse {
  initialized: boolean;
  last_error?: string;
  error_message?: string;
  symbols: SymbolRow[];
  symbols_count?: number;
}

export function SymbolsPanel({ onApply }: { onApply?: (count: number) => void }) {
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    initialized: boolean;
    message?: string;
  } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:8000/mt5/symbols');
      const data: SymbolsResponse = await response.json();

      setConnectionStatus({
        initialized: data.initialized,
        message: data.error_message,
      });

      if (!data.initialized) {
        setError(data.error_message || 'MT5 not connected');
      } else if (data.symbols.length === 0) {
        setError('No symbols found. Enable symbols in MT5 Market Watch.');
      }

      // Show all symbols, sort tradeable first
      const allSymbols = (data.symbols || []).sort((a, b) => {
        if (a.trade_allowed && !b.trade_allowed) return -1;
        if (!a.trade_allowed && b.trade_allowed) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      console.log('MT5 Symbols loaded:', {
        total: allSymbols.length,
        tradeable: allSymbols.filter((s) => s.trade_allowed).length,
        sample: allSymbols
          .slice(0, 5)
          .map((s) => ({ name: s.name, trade_allowed: s.trade_allowed })),
      });

      setSymbols(allSymbols);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load symbols';
      setError(message);
      setConnectionStatus({
        initialized: false,
        message: 'Cannot reach backend server',
      });
    } finally {
      setLoading(false);
    }
  }

  function toggle(name: string) {
    setSelected((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function selectTopTradeAllowed(limit = 50) {
    const tradeable = symbols
      .filter((s) => s.trade_allowed && s.name)
      .slice(0, limit);
    const sel: Record<string, boolean> = {};
    tradeable.forEach((s) => {
      sel[s.name] = true;
    });
    setSelected(sel);
  }

  function clearSelection() {
    setSelected({});
  }

  function applySelected() {
    const chosen = symbols.filter((s) => selected[s.name]);
    if (chosen.length === 0) return alert('No symbols selected');

    const presets = chosen.map((s) => {
      const { pip_size, pip_value_per_1_lot } = getPipValues(s);
      return { symbol: s.name, pip_value_per_1_lot, pip_size };
    });

    const stillValid = presets.some((p) => p.symbol === settings.active_symbol);
    updateSettings({ symbol_presets: presets, active_symbol: stillValid ? settings.active_symbol : '' });
    if (onApply) onApply(presets.length);
    alert(`Applied ${presets.length} symbols to presets`);
  }

  // Filter symbols based on search query
  const filteredSymbols = symbols.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description &&
        s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="terminal-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">MT5 Symbols</h3>
          {connectionStatus && (
            <div
              className={`text-xs mt-1 ${connectionStatus.initialized ? 'text-green-400' : 'text-red-400'}`}
            >
              {connectionStatus.initialized
                ? `✓ Connected (${symbols.length} symbols)`
                : '✗ Not Connected'}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => load()}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => selectTopTradeAllowed(30)}
            disabled={symbols.length === 0}
          >
            Select Top 30
          </Button>
          <Button variant="ghost" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search symbols (e.g., XAUUSD, EUR, BTC)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-terminal-input border border-terminal-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-terminal-focus-ring"
        />
        {searchQuery && (
          <div className="text-xs text-muted-foreground mt-1">
            Showing {filteredSymbols.length} of {symbols.length} symbols
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded p-3 mb-4">
          <div className="text-red-400 text-sm font-semibold mb-2">
            ⚠ {error}
          </div>
          {!connectionStatus?.initialized && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Troubleshooting steps:</div>
              <div>1. Open MetaTrader 5 terminal</div>
              <div>2. Login to your trading account</div>
              <div>3. Keep MT5 running in background</div>
              <div>4. Click "Refresh" button above</div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground sticky top-0 bg-terminal-card">
            <tr>
              <th className="pr-4">Sel</th>
              <th>Symbol</th>
              <th>Trade</th>
              <th>Digits</th>
              <th>Point</th>
              <th>Contract</th>
              <th>Pip size</th>
              <th>Pip value / lot</th>
            </tr>
          </thead>
          <tbody>
            {filteredSymbols.map((s) => {
              const { pip_size, pip_value_per_1_lot } = getPipValues(s);
              const isTradeable = s.trade_allowed === true;
              return (
                <tr
                  key={s.name}
                  className={`border-t border-terminal-border hover:bg-terminal-border/30 ${!isTradeable ? 'opacity-50' : ''}`}
                >
                  <td className="pr-4">
                    <input
                      type="checkbox"
                      checked={!!selected[s.name]}
                      onChange={() => toggle(s.name)}
                    />
                  </td>
                  <td className="font-mono font-semibold">{s.name}</td>
                  <td>
                    {isTradeable ? (
                      <span className="text-green-400">✓</span>
                    ) : (
                      <span
                        className="text-red-400"
                        title="Enable in MT5 Market Watch"
                      >
                        ✗
                      </span>
                    )}
                  </td>
                  <td>{s.digits ?? '-'}</td>
                  <td>{s.point ?? '-'}</td>
                  <td>{s.trade_contract_size ?? '-'}</td>
                  <td>{Number(pip_size).toFixed(4)}</td>
                  <td className="font-semibold text-terminal-success">
                    {Number(pip_value_per_1_lot).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {filteredSymbols.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-4 text-muted-foreground">
                  {searchQuery
                    ? 'No symbols match your search'
                    : 'No symbols available'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={applySelected}
          disabled={Object.keys(selected).length === 0}
        >
          Apply Selected
        </Button>
      </div>
    </div>
  );
}
