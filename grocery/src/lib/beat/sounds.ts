import type { P } from './engines';

/** A small, hand-picked set. `engine` names a sound engine in engines.ts. `trim` evens out loudness. */
export interface Sound { id: string; name: string; engine: string; params: Partial<P>; trim: number }

export const BASS: Sound[] = [
  { id: 'sub', name: 'Sub', engine: 'analog', params: { wave: 'sine', detune: 0, cutoff: 400, res: 1, fenv: 0, sub: 0.2, a: 0.01, d: 0.1, s: 0.9, r: 0.12 }, trim: 0.5 },
  { id: 'pluck', name: 'Pluck', engine: 'analog', params: { cutoff: 300, res: 6, fenv: 3000, fdecay: 0.12, sub: 0.6, d: 0.15, s: 0.2, r: 0.08 }, trim: 1.45 },
  { id: 'round', name: 'Round', engine: 'basic', params: { wave: 'sine', a: 0.01, d: 0.15, s: 0.8, r: 0.12 }, trim: 0.66 },
];

export const PADS: Sound[] = [
  { id: 'warm', name: 'Warm', engine: 'analog', params: { detune: 14, cutoff: 900, res: 1, fenv: 400, fdecay: 0.8, sub: 0, a: 0.4, d: 0.5, s: 0.8, r: 0.8 }, trim: 1.1 },
  { id: 'air', name: 'Airy', engine: 'basic', params: { wave: 'sine', a: 0.5, d: 0.4, s: 0.8, r: 1.0 }, trim: 0.73 },
  { id: 'strings', name: 'Strings', engine: 'analog', params: { detune: 20, cutoff: 1800, res: 1, fenv: 300, fdecay: 0.6, sub: 0, a: 0.6, d: 0.4, s: 0.85, r: 0.9 }, trim: 1.24 },
];

export const LEADS: Sound[] = [
  { id: 'soft', name: 'Soft', engine: 'basic', params: { wave: 'triangle', s: 0.6, r: 0.2 }, trim: 1 },
  { id: 'bell', name: 'Bell', engine: 'fm', params: {}, trim: 1.59 },
  { id: 'pluck', name: 'Pluck', engine: 'basic', params: { wave: 'sawtooth', d: 0.12, s: 0.05, r: 0.1 }, trim: 2.61 },
];

export const find = (list: Sound[], id: string): Sound | null => list.find((s) => s.id === id) ?? null;
