import { apiClient } from './client';
import { RiskCalcInput, RiskCalcOutput } from '../types/trade';

/**
 * Calculate risk and volume based on input parameters
 */
export async function calculateRisk(input: RiskCalcInput): Promise<RiskCalcOutput> {
  const response = await apiClient.post<RiskCalcOutput>('/calc', input);
  return response.data;
}