import { AlertTriangle } from 'lucide-react';

interface WarningBannerProps {
  warnings: string[];
}

export function WarningBanner({ warnings }: WarningBannerProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="terminal-card p-4 border-amber-500/50 bg-amber-500/10">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-amber-200">Risk Warnings</h4>
          <ul className="space-y-1">
            {warnings.map((warning, index) => (
              <li key={index} className="text-sm text-amber-200/80">
                • {warning}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}