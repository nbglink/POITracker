import { cn } from '../../utils/cn';

interface RiskVisualizerProps {
  targetRiskPercent: number;
  actualRiskPercent: number;
  targetRiskAmount: number;
  actualRiskAmount: number;
}

export function RiskVisualizer({
  targetRiskPercent,
  actualRiskPercent,
  targetRiskAmount,
  actualRiskAmount,
}: RiskVisualizerProps) {
  const exceeds = actualRiskPercent > targetRiskPercent;
  const maxPercent = Math.max(targetRiskPercent, actualRiskPercent, 5);
  const targetWidth = (targetRiskPercent / maxPercent) * 100;
  const actualWidth = (actualRiskPercent / maxPercent) * 100;

  return (
    <div className="terminal-card p-5">
      <h3 className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-4">
        Risk Analysis
      </h3>

      {/* Visual bar comparison */}
      <div className="space-y-3 mb-6">
        {/* Target Risk Bar */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Target</span>
            <span className="font-mono text-blue-400">{targetRiskPercent.toFixed(2)}%</span>
          </div>
          <div className="h-2 bg-[hsl(var(--input-bg))] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${targetWidth}%` }}
            />
          </div>
        </div>

        {/* Actual Risk Bar */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Actual</span>
            <span
              className={cn(
                'font-mono',
                exceeds ? 'text-amber-400' : 'text-emerald-400'
              )}
            >
              {actualRiskPercent.toFixed(2)}%
            </span>
          </div>
          <div className="h-2 bg-[hsl(var(--input-bg))] rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                exceeds ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${actualWidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* Amount details */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[hsl(var(--card-border))]">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Target Amount</div>
          <div className="font-mono text-lg text-blue-400">
            ${targetRiskAmount.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Actual Amount</div>
          <div
            className={cn(
              'font-mono text-lg',
              exceeds ? 'text-amber-400' : 'text-emerald-400'
            )}
          >
            ${actualRiskAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Excess warning */}
      {exceeds && (
        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="text-sm text-amber-200">
              <strong>Risk exceeded by {(actualRiskPercent - targetRiskPercent).toFixed(2)}%</strong>
              <p className="text-amber-200/70 mt-1">
                Minimum lot size constraint increased actual risk above target.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}