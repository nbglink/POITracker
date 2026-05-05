import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'mt5-trade-planner-settings';
const SETTINGS_VERSION = 1;

interface PersistedSettings {
  _version: number;
  data: AppSettings;
}

function migrate(payload: unknown): AppSettings {
  // Pre-version blob: just a serialized AppSettings (legacy shape).
  if (payload && typeof payload === 'object' && !('_version' in payload)) {
    return { ...DEFAULT_SETTINGS, ...(payload as Partial<AppSettings>) };
  }
  if (payload && typeof payload === 'object' && '_version' in payload) {
    const persisted = payload as PersistedSettings;
    // Future schema bumps: branch on persisted._version and transform.
    return { ...DEFAULT_SETTINGS, ...persisted.data };
  }
  return { ...DEFAULT_SETTINGS, symbol_presets: [], active_symbol: '' };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_SETTINGS, symbol_presets: [], active_symbol: '' };
    }
    try {
      return migrate(JSON.parse(stored));
    } catch {
      return { ...DEFAULT_SETTINGS, symbol_presets: [], active_symbol: '' };
    }
  });

  useEffect(() => {
    const persisted: PersistedSettings = { _version: SETTINGS_VERSION, data: settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [settings]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const resetSettings = () => {
    setSettings({ ...DEFAULT_SETTINGS, symbol_presets: [], active_symbol: '' });
  };

  // If presets change and active_symbol is no longer present, clear it.
  useEffect(() => {
    if (!settings.active_symbol) return;
    const stillValid = settings.symbol_presets.some((p) => p.symbol === settings.active_symbol);
    if (stillValid) return;
    setSettings((prev) => ({ ...prev, active_symbol: '' }));
  }, [settings.active_symbol, settings.symbol_presets]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}