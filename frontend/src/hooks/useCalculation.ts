import { useState, useCallback } from 'react';
import { RiskCalcInput, RiskCalcOutput } from '../types/trade';
import { calculateRisk } from '../api/calc';

interface UseCalculationReturn {
  result: RiskCalcOutput | null;
  loading: boolean;
  error: string | null;
  calculate: (input: RiskCalcInput) => Promise<void>;
  reset: () => void;
}

export function useCalculation(): UseCalculationReturn {
  const [result, setResult] = useState<RiskCalcOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(async (input: RiskCalcInput) => {
    setLoading(true);
    setError(null);

    try {
      const apiResult = await calculateRisk(input);
      setResult(apiResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Calculation failed';
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, calculate, reset };
}