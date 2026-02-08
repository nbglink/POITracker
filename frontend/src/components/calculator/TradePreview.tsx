interface TradePreviewProps {
  tp1Pips: number | null;
  partialPercent: number;
  remainingVolume: number;
  beSlPrice: number | null;
  volume: number;
}

export function TradePreview({
  tp1Pips,
  partialPercent,
  remainingVolume,
  beSlPrice,
  volume,
}: TradePreviewProps) {
  const partialVolume = volume - remainingVolume;

  return (
    <div className="terminal-card p-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Trade Management Preview
      </h3>

      <div className="space-y-4">
        {/* TP1 Partial Close */}
        {tp1Pips !== null && tp1Pips > 0 && (
          <div className="flex items-center justify-between p-3 rounded bg-terminal-bg/50 border border-terminal-border">
            <div>
              <div className="text-sm font-medium">TP1 Partial Close</div>
              <div className="text-xs text-muted-foreground">
                At +{tp1Pips} pips from entry
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-terminal-success">
                Close {partialPercent}%
              </div>
              <div className="text-xs text-muted-foreground">
                {partialVolume.toFixed(2)} lots
              </div>
            </div>
          </div>
        )}

        {/* Break-even Move */}
        {beSlPrice !== null && (
          <div className="flex items-center justify-between p-3 rounded bg-terminal-bg/50 border border-terminal-border">
            <div>
              <div className="text-sm font-medium">Move to Break-even</div>
              <div className="text-xs text-muted-foreground">
                After TP1 is hit
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-blue-400">
                SL → {beSlPrice.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                Remaining: {remainingVolume.toFixed(2)} lots
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="pt-2 border-t border-terminal-border">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Initial Volume</span>
            <span className="font-mono">{volume.toFixed(2)} lots</span>
          </div>
          {tp1Pips !== null && tp1Pips > 0 && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>After TP1 Close</span>
                <span className="font-mono">{remainingVolume.toFixed(2)} lots</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
