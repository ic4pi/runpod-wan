import type { Note } from './session';

/** Longest a note can be before it hits the next note on the same pitch or the end of the song. */
export function maxLength(notes: Note[], note: { step: number; pitch: number }, ignoreIndex: number, cols: number): number {
  let next = cols;
  notes.forEach((n, i) => { if (i !== ignoreIndex && n.pitch === note.pitch && n.step > note.step && n.step < next) next = n.step; });
  return Math.max(1, next - note.step);
}

/** Copy one bar over another. The target bar's old notes are replaced. */
export function copyBar(notes: Note[], from: number, to: number, stepsPerBar: number): Note[] {
  if (from === to) return notes;
  const lo = to * stepsPerBar, hi = lo + stepsPerBar, shift = (to - from) * stepsPerBar;
  const kept = notes.filter((n) => n.step < lo || n.step >= hi);
  const moved = notes
    .filter((n) => n.step >= from * stepsPerBar && n.step < (from + 1) * stepsPerBar)
    .map((n) => ({ ...n, step: n.step + shift, len: Math.min(n.len, hi - (n.step + shift)) }));
  return [...kept, ...moved];
}
