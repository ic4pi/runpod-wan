import type { Note, Track } from './session';

/** Stable 0..1 hash, so live playback and export get the same "feel". */
function hash(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return ((x >>> 0) % 10000) / 10000;
}

/** Late-only timing nudge (up to 22 ms) and ±12% velocity, scaled by the track's Feel amount. */
export function feel(t: Track, n: Note): { delay: number; vel: number } {
  if (t.humanize <= 0) return { delay: 0, vel: n.vel };
  const k = `${t.id}:${n.step}:${n.pitch}`;
  return {
    delay: hash(`${k}t`) * 0.022 * t.humanize,
    vel: Math.max(1, Math.round(n.vel * (1 + (hash(`${k}v`) - 0.5) * 0.24 * t.humanize))),
  };
}
