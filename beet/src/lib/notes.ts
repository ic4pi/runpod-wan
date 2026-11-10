import { STEPS_PER_BAR, type Note } from './session';

/** Longest a note can be before it hits the next note on the same pitch or the end of the song. */
export function maxLength(notes: Note[], note: { step: number; pitch: number }, ignoreIndex: number, cols: number): number {
  let next = cols;
  notes.forEach((n, i) => { if (i !== ignoreIndex && n.pitch === note.pitch && n.step > note.step && n.step < next) next = n.step; });
  return Math.max(1, next - note.step);
}

/** Copy one bar over another. The target bar's old notes are replaced. */
export function copyBar(notes: Note[], from: number, to: number): Note[] {
  if (from === to) return notes;
  const lo = to * STEPS_PER_BAR, hi = lo + STEPS_PER_BAR, shift = (to - from) * STEPS_PER_BAR;
  const kept = notes.filter((n) => n.step < lo || n.step >= hi);
  const moved = notes
    .filter((n) => n.step >= from * STEPS_PER_BAR && n.step < (from + 1) * STEPS_PER_BAR)
    .map((n) => ({ ...n, step: n.step + shift, len: Math.min(n.len, hi - (n.step + shift)) }));
  return [...kept, ...moved];
}
