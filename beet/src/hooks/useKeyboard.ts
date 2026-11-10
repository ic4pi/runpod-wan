import { useEffect, useRef } from 'react';

/** Computer-keyboard piano layout: semitone offsets from the visible base note. */
export const PIANO_KEYS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15,
};
/** Drum layout: index into [Kick, Snare, Clap, Closed Hat, Open Hat, Tom, Rim, Crash]. */
export const DRUM_KEYS: Record<string, number> = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6, k: 7 };

interface Handlers { onKey: (key: string) => void; onOctave: (d: number) => void; onToggle: () => void }

export function useKeyboard(h: Handlers) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); ref.current.onToggle(); }
      else if (k === 'z') ref.current.onOctave(-1);
      else if (k === 'x') ref.current.onOctave(1);
      else ref.current.onKey(k);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
}
