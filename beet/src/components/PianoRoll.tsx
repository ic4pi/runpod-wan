import { useEffect, useMemo, useRef } from 'react';
import { DRUMS } from '@/lib/synth/engines';
import { STEPS_PER_BAR, type Note } from '@/lib/session';
import { maxLength } from '@/lib/notes';

const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const CELL = coarse ? 40 : 30;
const ROW = coarse ? 36 : 26;
const LABEL = 72;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);

export type Tool = 'draw' | 'edit';
export interface Picked { pitch: number; step: number }

interface Props {
  notes: Note[];
  bars: number;
  drum: boolean;
  base: number;
  noteLen: number;
  tool: Tool;
  picked: Picked | null;
  entry: number;
  getPosition: () => number | null;
  onChange: (notes: Note[]) => void;
  onPick: (p: Picked | null) => void;
  onPreview: (pitch: number) => void;
}

export function PianoRoll({ notes, bars, drum, base, noteLen, tool, picked, entry, getPosition, onChange, onPick, onPreview }: Props) {
  const cols = bars * STEPS_PER_BAR;
  const rows = useMemo(
    () => (drum ? DRUMS : Array.from({ length: 24 }, (_, i) => ({ pitch: base + 23 - i, name: noteName(base + 23 - i) }))),
    [drum, base],
  );

  // which cells a note covers: key "pitch:step" -> index in notes, and whether it is the note's first cell
  const cover = useMemo(() => {
    const m = new Map<string, { i: number; head: boolean }>();
    notes.forEach((n, i) => { for (let s = n.step; s < n.step + n.len; s++) m.set(`${n.pitch}:${s}`, { i, head: s === n.step }); });
    return m;
  }, [notes]);

  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);

  // playhead: moved straight in the DOM so playback does not re-render the grid
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const pos = getPosition();
      const el = head.current, sc = scroller.current;
      if (el && sc) {
        if (pos === null) el.style.display = 'none';
        else {
          const x = LABEL + pos * CELL;
          el.style.display = 'block'; el.style.transform = `translateX(${x}px)`;
          if (x < sc.scrollLeft + LABEL || x > sc.scrollLeft + sc.clientWidth - 24) sc.scrollLeft = Math.max(0, x - LABEL - 40);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getPosition]);

  const onDown = (e: React.PointerEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    if (!cell) return;
    const pitch = Number(cell.dataset.p), step = Number(cell.dataset.s);
    const hit = cover.get(`${pitch}:${step}`);
    if (tool === 'edit') {
      if (hit) { const n = notes[hit.i]; onPick({ pitch: n.pitch, step: n.step }); onPreview(n.pitch); } else onPick(null);
      return;
    }
    if (hit) { onChange(notes.filter((_, i) => i !== hit.i)); return; }
    const len = Math.min(noteLen, maxLength(notes, { step, pitch }, -1, cols), cols - step);
    onChange([...notes, { step, pitch, len: Math.max(1, len), vel: 100 }]);
    onPreview(pitch);
  };

  return (
    <div ref={scroller} className="relative max-h-[58vh] overflow-auto border border-border" onPointerDown={onDown} style={{ touchAction: 'pan-x pan-y' }}>
      <div className="relative" style={{ width: LABEL + cols * CELL }}>
        <div ref={head} className="pointer-events-none absolute top-0 z-20 hidden h-full w-0.5 bg-primary" style={{ left: 0 }} />
        <div className="sticky top-0 z-10 flex bg-background" style={{ height: 20 }}>
          <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: LABEL }} />
          {Array.from({ length: bars }, (_, b) => (
            <div key={b} className="shrink-0 border-l border-foreground/30 pl-1 font-mono text-[10px] text-muted-foreground" style={{ width: CELL * STEPS_PER_BAR }}>{b + 1}</div>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.pitch} className="flex" style={{ height: ROW }}>
            <div className={`sticky left-0 z-10 flex shrink-0 items-center border-b border-border px-2 font-mono text-[10px] ${!drum && isBlack(r.pitch) ? 'bg-secondary text-muted-foreground' : 'bg-card text-foreground'}`} style={{ width: LABEL }}>
              {r.name}
            </div>
            {Array.from({ length: cols }, (_, s) => {
              const c = cover.get(`${r.pitch}:${s}`);
              const sel = !!picked && c?.head && picked.pitch === r.pitch && picked.step === s;
              const bg = c ? (c.head ? 'bg-primary' : 'bg-primary/50') : !drum && isBlack(r.pitch) ? 'bg-secondary/60' : Math.floor(s / 4) % 2 ? 'bg-card' : 'bg-background';
              const edge = s % STEPS_PER_BAR === 0 ? 'border-l border-l-foreground/30' : s % 4 === 0 ? 'border-l border-l-border' : '';
              return (
                <div key={s} data-p={r.pitch} data-s={s}
                  className={`shrink-0 border-b border-border ${edge} ${bg} ${s < entry ? 'opacity-40' : ''} ${sel ? 'outline outline-2 -outline-offset-2 outline-foreground' : ''}`}
                  style={{ width: CELL, height: ROW }} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
