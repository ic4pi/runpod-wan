import { RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useSession } from '@/lib/session';
import { LEVEL_DEFS, NEUTRAL_LEVELS } from '@/lib/templates';

/**
 * The Levels panel — four human-worded faders. Center detent is neutral;
 * labels describe what "less" and "more" mean instead of numbers.
 */
export function LevelsPanel({ onChange }: { onChange?: () => void }) {
  const { levels, setLevels } = useSession();
  const isNeutral =
    levels.warmth === 1 && levels.brightness === 1 && levels.punch === 1 && levels.space === 1;

  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Levels</span>
        <button
          onClick={() => {
            setLevels(NEUTRAL_LEVELS);
            onChange?.();
          }}
          disabled={isNeutral}
          className="flex min-h-11 items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
      <div className="grid grid-cols-4 divide-x divide-border">
        {LEVEL_DEFS.map((def) => {
          const value = levels[def.key];
          const offset = Math.round((value - 1) * 100);
          return (
            <div key={def.key} className="flex flex-col items-center gap-2 px-2 py-4">
              <div className="flex h-28 items-center">
                <Slider
                  orientation="vertical"
                  min={0}
                  max={2}
                  step={0.05}
                  value={[value]}
                  onValueChange={([v]) => {
                    setLevels({ ...levels, [def.key]: v });
                    onChange?.();
                  }}
                  aria-label={def.name}
                  data-testid={`fader-${def.key}`}
                  className="h-28 [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:h-5 [&_[data-slot=slider-thumb]]:w-5 [&_[data-slot=slider-thumb]]:rounded-none [&_[data-slot=slider-thumb]]:border-foreground [&_[data-slot=slider-thumb]]:bg-foreground [&_[data-slot=slider-track]]:w-0.5 [&_[data-slot=slider-track]]:bg-border"
                />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground">{def.name}</span>
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.1em] ${
                  offset === 0 ? 'text-muted-foreground/40' : 'text-primary'
                }`}
              >
                {offset === 0 ? '—' : offset < 0 ? def.less : def.more}
              </span>
            </div>
          );
        })}
      </div>
      <p className="border-t border-border px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
        Center is the engineer's call — push past it to taste
      </p>
    </div>
  );
}
