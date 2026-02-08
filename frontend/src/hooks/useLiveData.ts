import { useEffect, useRef, useState, useCallback } from 'react';

interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  time: number;
}

interface AccountData {
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  currency: string;
}

interface UseLiveDataOptions {
  symbol?: string;
  enablePrice?: boolean;
  enableAccount?: boolean;
}

interface UseLiveDataReturn {
  tick: TickData | null;
  account: AccountData | null;
  connected: boolean;
  error: string | null;
  subscribe: (symbol: string) => void;
  unsubscribe: () => void;
}

const WS_URL = 'ws://localhost:8000/ws/live';

export function useLiveData(options: UseLiveDataOptions = {}): UseLiveDataReturn {
  const { symbol, enablePrice = true, enableAccount = true } = options;
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSymbolRef = useRef<string | undefined>(symbol);
  const enablePriceRef = useRef(enablePrice);
  const enableAccountRef = useRef(enableAccount);
  const isConnectingRef = useRef(false);
  
  const [tick, setTick] = useState<TickData | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep refs up to date
  useEffect(() => {
    currentSymbolRef.current = symbol;
  }, [symbol]);
  
  useEffect(() => {
    enablePriceRef.current = enablePrice;
  }, [enablePrice]);
  
  useEffect(() => {
    enableAccountRef.current = enableAccount;
  }, [enableAccount]);

  const subscribe = useCallback((newSymbol: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbol: newSymbol }));
    }
  }, []);

  const unsubscribe = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe' }));
    }
    setTick(null);
  }, []);

  const connect = useCallback(() => {
    // Check if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('[WS] Already connecting');
      return;
    }
    if (isConnectingRef.current) {
      console.log('[WS] Connection in progress');
      return;
    }
    
    isConnectingRef.current = true;
    console.log('[WS] Attempting to connect to', WS_URL);

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        setConnected(true);
        setError(null);
        console.log('[WS] Connected to live data stream');

        // Subscribe to symbol if provided and price enabled
        if (currentSymbolRef.current && enablePriceRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', symbol: currentSymbolRef.current }));
        }

        // Toggle account updates
        ws.send(JSON.stringify({ type: 'toggle_account', enabled: enableAccountRef.current }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'tick':
              if (!data.error) {
                setTick(data);
              }
              break;
            case 'account':
              if (!data.error) {
                setAccount(data);
              }
              break;
            case 'error':
              console.warn('[WS] Error:', data.message);
              break;
            case 'subscribed':
              console.log('[WS] Subscribed to', data.symbol);
              break;
            case 'unsubscribed':
              console.log('[WS] Unsubscribed from price updates');
              setTick(null);
              break;
          }
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('[WS] Connection error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        isConnectingRef.current = false;
        wsRef.current = null;
        setConnected(false);
        console.log(`[WS] Disconnected (code: ${event.code}, reason: ${event.reason || 'none'}), reconnecting in 3s...`);
        
        // Auto-reconnect after 3 seconds (only if not a clean close)
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    } catch (e) {
      isConnectingRef.current = false;
      setError(`Failed to connect: ${e}`);
    }
  }, []); // No dependencies - connect function is stable

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Update subscription when symbol changes
  useEffect(() => {
    // Clear stale ticks immediately on symbol changes.
    setTick(null);

    if (symbol && enablePrice && wsRef.current?.readyState === WebSocket.OPEN) {
      subscribe(symbol);
    } else if (!enablePrice) {
      unsubscribe();
    }
  }, [symbol, enablePrice, subscribe, unsubscribe]);

  // Toggle account updates
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'toggle_account', enabled: enableAccount }));
    }
  }, [enableAccount]);

  return {
    tick,
    account,
    connected,
    error,
    subscribe,
    unsubscribe,
  };
}
