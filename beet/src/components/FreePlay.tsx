import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { noteName } from '@/components/PianoRoll';

/**
 * Free play strip — tap (or key-in) the selected track's sound without touching
 * the grid. Uses the same hit() path as the computer keyboard and MIDI input,
 * so with Rec on, what you play lands in the loop. Melodic tracks get a
 * 2-octave keyboard; drum tracks get the 8 kit pads.
 */

const WHITE = [0, 2, 4, 5, 7, 9, 11];
/** Black key semitone, and the white-key index it sits after (within an octave). */
const BLACK: { semi: number; after: number }[] = [
  { semi: 1, after: 0 }, { semi: 3, after: 1 }, { semi: 6, after: 3 }, { semi: 8, after: 4 }, { semi: 10, after: 5 },
];

interface Props {
  drum: boolean;
  base: number;
  drums: { pitch: number; name: string }[];
  onOctave: (d: number) => void;
  onPlay: (pitch: number, vel?: number) => void;
}

export function FreePlay({ drum, base, drums, onOctave, onPlay }: Props) {
  const [pressed, setPressed] = useState<number | null>(null);
  const tap = (pitch: number) => {
    onPlay(pitch);
    setPressed(pitch);
    window.setTimeout(() => setPressed((p) => (p === pitch ? null : p)), 140);
  };

  if (drum) {
    return (
      <section aria-label="Free play drums" className="border border-border bg-card p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Free play — tap the kit</p>
        <div className="grid grid-cols-4 gap-2">
          {drums.map((d) => (
            <button
              key={d.pitch}
              onPointerDown={() => tap(d.pitch)}
              aria-label={`Play ${d.name}`}
              className={`flex min-h-14 items-center justify-center border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-primary ${
                pressed === d.pitch ? 'border-primary bg-primary/30 text-primary' : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const whites: number[] = [];
  const blacks: { pitch: number; left: number }[] = [];
  for (let oct = 0; oct < 2; oct++) {
    for (const w of WHITE) whites.push(base + oct * 12 + w);
    for (const b of BLACK) blacks.push({ pitch: base + oct * 12 + b.semi, left: ((oct * 7 + b.after + 1) / 14) * 100 });
  }

  return (
    <section aria-label="Free play keyboard" className="border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Free play</p>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          <Button variant="secondary" size="icon" className="min-h-9 min-w-9" aria-label="Octave down" onClick={() => onOctave(-1)}>−</Button>
          {noteName(base)}–{noteName(base + 23)}
          <Button variant="secondary" size="icon" className="min-h-9 min-w-9" aria-label="Octave up" onClick={() => onOctave(1)}>+</Button>
        </div>
      </div>
      <div className="relative select-none" style={{ touchAction: 'none' }}>
        <div className="flex gap-0.5">
          {whites.map((p) => (
            <button
              key={p}
              onPointerDown={() => tap(p)}
              aria-label={`Play ${noteName(p)}`}
              className={`h-28 flex-1 border-b-2 border-border bg-background transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-primary ${
                pressed === p ? 'bg-primary/25' : 'hover:bg-foreground/5 active:bg-primary/15'
              }`}
            >
              <span className="sr-only">{noteName(p)}</span>
            </button>
          ))}
        </div>
        {blacks.map((b) => (
          <button
            key={b.pitch}
            onPointerDown={() => tap(b.pitch)}
            aria-label={`Play ${noteName(b.pitch)}`}
            className={`absolute top-0 h-16 border border-border bg-foreground/90 transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-primary ${
              pressed === b.pitch ? 'bg-primary' : 'hover:bg-foreground active:bg-primary/80'
            }`}
            style={{ left: `calc(${b.left}% - 1.75%)`, width: '3.5%' }}
          >
            <span className="sr-only">{noteName(b.pitch)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
