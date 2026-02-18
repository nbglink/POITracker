import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CalculatorFormState, TradeDirection } from '../../types/trade';
import { useSettings } from '../../context/SettingsContext';
import { useLiveData } from '../../hooks/useLiveData';
import { formatPipValue } from '../../utils/formatters';
import { getSymbolDefaults, isDefaultValue } from '../../utils/symbolDefaults';

interface InputFormProps {
  onCalculate: (formData: CalculatorFormState) => void;
  loading: boolean;
}

export function InputForm({ onCalculate, loading }: InputFormProps) {
  const { settings, updateSettings } = useSettings();

  // Live data toggles
  const [useLivePrice, setUseLivePrice] = useState(true);
  const [useLiveBalance, setUseLiveBalance] = useState(true);

  const [formData, setFormData] = useState<CalculatorFormState>({
    account_balance: '10000',
    risk_percent: '1.0',
    symbol: settings.active_symbol || '',
    direction: 'buy',
    entry_price: '2000.00',
    pending_order: false,
    stop_pips: '50',
    tp1_pips: settings.tp1_pips.toString(),
    pip_value_per_1_lot: '10',
  });

  // Keep local form state in sync with active_symbol.
  useEffect(() => {
    if (settings.active_symbol === formData.symbol) return;
    const preset = settings.symbol_presets.find((p) => p.symbol === settings.active_symbol);
    setFormData((prev) => ({
      ...prev,
      symbol: settings.active_symbol || '',
      pip_value_per_1_lot: preset ? preset.pip_value_per_1_lot.toString() : prev.pip_value_per_1_lot,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.active_symbol, settings.symbol_presets]);

  // Auto-update SL/TP defaults when symbol changes (only if user hasn't customized them)
  useEffect(() => {
    if (!settings.active_symbol) return;
    const defaults = getSymbolDefaults(settings.active_symbol);
    setFormData((prev) => ({
      ...prev,
      stop_pips: isDefaultValue(parseFloat(prev.stop_pips))
        ? defaults.stop_loss_pips.toString()
        : prev.stop_pips,
      tp1_pips: isDefaultValue(parseFloat(prev.tp1_pips))
        ? defaults.take_profit_pips.toString()
        : prev.tp1_pips,
    }));
  }, [settings.active_symbol]);

  // Live data hook
  const { tick, account, connected } = useLiveData({
    symbol: useLivePrice ? settings.active_symbol || undefined : undefined,
    enablePrice: useLivePrice && Boolean(settings.active_symbol),
    enableAccount: useLiveBalance,
  });

  // Update entry price from live tick
  useEffect(() => {
    if (useLivePrice && tick && tick.symbol === formData.symbol) {
      const price = formData.direction === 'buy' ? tick.ask : tick.bid;
      const decimals = formData.symbol.includes('JPY') ? 3 : 
                       formData.symbol.includes('XAU') || formData.symbol.includes('GOLD') ? 2 : 5;
      setFormData(prev => ({ ...prev, entry_price: price.toFixed(decimals) }));
    }
  }, [tick, useLivePrice, formData.symbol, formData.direction]);

  // Update account balance from live data
  useEffect(() => {
    if (useLiveBalance && account) {
      setFormData(prev => ({ ...prev, account_balance: account.balance.toFixed(2) }));
    }
  }, [account, useLiveBalance]);

  const [errors, setErrors] = useState<Partial<CalculatorFormState>>({});

  const activePreset = useMemo(
    () => settings.symbol_presets.find((p) => p.symbol === settings.active_symbol),
    [settings.active_symbol, settings.symbol_presets]
  );

  const pipValueDisplay = useMemo(() => {
    if (!activePreset) return formData.pip_value_per_1_lot;
    return formatPipValue(activePreset.pip_value_per_1_lot);
  }, [activePreset, formData.pip_value_per_1_lot]);

  const validateForm = (): boolean => {
    const newErrors: Partial<CalculatorFormState> = {};
    if (!settings.active_symbol) {
      newErrors.symbol = 'Please choose a symbol';
    }

    // Required fields
    if (!formData.account_balance || parseFloat(formData.account_balance) <= 0) {
      newErrors.account_balance = 'Account balance must be greater than 0';
    }
    if (!formData.risk_percent || parseFloat(formData.risk_percent) <= 0 || parseFloat(formData.risk_percent) > 100) {
      newErrors.risk_percent = 'Risk percent must be between 0 and 100';
    }
    if (!formData.entry_price || parseFloat(formData.entry_price) <= 0) {
      newErrors.entry_price = 'Entry price must be greater than 0';
    }
    if (!formData.stop_pips || parseFloat(formData.stop_pips) <= 0) {
      newErrors.stop_pips = 'Stop pips must be greater than 0';
    }
    if (!formData.pip_value_per_1_lot || parseFloat(formData.pip_value_per_1_lot) <= 0) {
      newErrors.pip_value_per_1_lot = 'Pip value must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onCalculate(formData);
    }
  };

  const handleInputChange = useCallback((field: keyof CalculatorFormState, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const handleSymbolChange = useCallback((value: string) => {
    const preset = settings.symbol_presets.find(p => p.symbol === value);
    updateSettings({ active_symbol: value });
    setFormData(prev => ({
      ...prev,
      symbol: value,
      // Keep raw full precision for calculations.
      pip_value_per_1_lot: preset ? String(preset.pip_value_per_1_lot) : prev.pip_value_per_1_lot,
    }));
    if (errors.symbol) {
      setErrors(prev => ({ ...prev, symbol: undefined }));
    }
  }, [errors, settings.symbol_presets, updateSettings]);

  const symbolOptions = useMemo(() => (
    settings.symbol_presets.map(preset => ({
      value: preset.symbol,
      label: preset.symbol,
    }))
  ), [settings.symbol_presets]);

  const directionOptions = useMemo(() => ([
    { value: 'buy', label: 'Buy' },
    { value: 'sell', label: 'Sell' },
  ]), []);

  return (
    <div className="terminal-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Trade Parameters</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs text-muted-foreground">
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Account
            </h3>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useLiveBalance}
                onChange={(e) => setUseLiveBalance(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-terminal-bg border-terminal-border accent-green-500"
              />
              <span className={useLiveBalance ? 'text-green-400' : 'text-muted-foreground'}>
                Live Balance
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <Input
                label="Balance"
                type="number"
                step="0.01"
                value={formData.account_balance}
                onChange={(e) => handleInputChange('account_balance', e.target.value)}
                error={errors.account_balance}
                placeholder="10000.00"
                disabled={useLiveBalance}
                className={useLiveBalance ? 'opacity-60' : ''}
              />
              {useLiveBalance && account && (
                <span className="absolute right-2 top-7 text-xs text-muted-foreground">
                  {account.currency}
                </span>
              )}
            </div>
            <Input
              label="Risk %"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={formData.risk_percent}
              onChange={(e) => handleInputChange('risk_percent', e.target.value)}
              error={errors.risk_percent}
              placeholder="1.0"
            />
          </div>
        </div>

        {/* Trade Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Trade Setup
            </h3>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useLivePrice}
                onChange={(e) => setUseLivePrice(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-terminal-bg border-terminal-border accent-green-500"
              />
              <span className={useLivePrice ? 'text-green-400' : 'text-muted-foreground'}>
                Live Price
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Symbol"
              value={settings.active_symbol || ''}
              onChange={(e) => handleSymbolChange(e.target.value)}
              options={symbolOptions}
              placeholder={symbolOptions.length === 0 ? 'Choose symbols in Symbols panel…' : 'Choose a symbol…'}
              error={errors.symbol}
            />
            <Select
              label="Direction"
              value={formData.direction}
              onChange={(e) => handleInputChange('direction', e.target.value as TradeDirection)}
              options={directionOptions}
            />
          </div>
          <div className="relative">
            <Input
              label="Entry Price"
              type="number"
              step="0.01"
              value={formData.entry_price}
              onChange={(e) => handleInputChange('entry_price', e.target.value)}
              error={errors.entry_price}
              placeholder="2000.00"
              disabled={useLivePrice}
              className={useLivePrice ? 'opacity-60' : ''}
            />
            {useLivePrice && tick && tick.symbol === settings.active_symbol && (
              <div className="absolute right-2 top-7 text-xs text-muted-foreground">
                <span className="text-red-400">{tick.bid.toFixed(2)}</span>
                <span className="mx-1">/</span>
                <span className="text-green-400">{tick.ask.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Risk Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Risk Management
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Stop Loss (pips)"
              type="number"
              step="0.1"
              min="0"
              value={formData.stop_pips}
              onChange={(e) => handleInputChange('stop_pips', e.target.value)}
              error={errors.stop_pips}
              placeholder="50"
            />
            <Input
              label="Pip Value per Lot"
              type={activePreset ? 'text' : 'number'}
              step={activePreset ? undefined : 'any'}
              min="0"
              value={pipValueDisplay}
              readOnly={Boolean(activePreset)}
              onChange={(e) => handleInputChange('pip_value_per_1_lot', e.target.value)}
              error={errors.pip_value_per_1_lot}
              placeholder="10.00"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !settings.active_symbol}
          >
            {loading ? 'Calculating...' : 'Calculate Position Size'}
          </Button>
        </div>
      </form>
    </div>
  );
}