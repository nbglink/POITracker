import { cn } from '../../utils/cn';

interface VolumeHeroProps {
  volume: number;
  volumeRaw: number;
  allowed: boolean;
  hasWarning: boolean;
}

export function VolumeHero({ volume, volumeRaw, allowed, hasWarning }: VolumeHeroProps) {
  const glowClass = !allowed
    ? 'hero-glow-loss'
    : hasWarning
    ? 'hero-glow-warning'
    : 'hero-glow';

  return (
    <div
      className={cn(
        'relative p-8 rounded-sm terminal-card overflow-hidden',
        'flex flex-col items-center justify-center',
        'transition-all duration-500',
        glowClass
      )}
    >
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--primary) / 0.3) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--primary) / 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
          }}
        />
      </div>

      {/* Label */}
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
        Position Size
      </span>

      {/* Main volume display */}
      <div className="relative" aria-live="polite" aria-atomic="true">
        <span
          className={cn(
            'font-mono tabular-nums text-6xl md:text-7xl font-bold tracking-tight',
            'text-[hsl(var(--text))]',
            !allowed && 'text-[hsl(var(--danger))]',
            hasWarning && allowed && 'text-[hsl(var(--warning))]'
          )}
        >
          {volume.toFixed(2)}
        </span>
        <span className="ml-2 text-xl text-muted-foreground font-medium">lots</span>
      </div>

      {/* Raw volume comparison */}
      {volume !== volumeRaw && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span>Calculated:</span>
          <span className="font-mono">{volumeRaw.toFixed(4)}</span>
          <span className="terminal-badge terminal-badge-warning px-2 py-0.5 rounded-sm">
            Rounded
          </span>
        </div>
      )}

      {/* Status indicator */}
      <div className="mt-4">
        {!allowed ? (
          <span className="terminal-badge terminal-badge-danger px-3 py-1 rounded-sm">
            BLOCKED — Stop exceeds limit
          </span>
        ) : hasWarning ? (
          <span className="terminal-badge terminal-badge-warning px-3 py-1 rounded-sm">
            CAUTION — Risk exceeds target
          </span>
        ) : (
          <span className="terminal-badge terminal-badge-success px-3 py-1 rounded-sm">
            READY
          </span>
        )}
      </div>
    </div>
  );
}