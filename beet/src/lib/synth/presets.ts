import { getEngine, type Engine, type P } from './engines';

export type Category = 'drums' | 'bass' | 'lead' | 'pad' | 'keys';
/** trim levels presets against each other (1 = as the engine plays it) */
export interface Preset { id: string; name: string; category: Category; engine: string; params: Partial<P>; trim?: number }

export const PRESETS: Preset[] = [
  // drums
  { id: 'kit-punchy', name: 'Punchy Kit', category: 'drums', engine: 'drums', params: {} },
  { id: 'kit-tight', name: 'Tight Kit', category: 'drums', engine: 'drums', params: { decay: 0.6, tune: 1.1 } },
  { id: 'kit-808', name: '808 Kit', category: 'drums', engine: 'drums', params: { decay: 1.8, tune: 0.8 } },
  { id: 'kit-lofi', name: 'Lo-Fi Kit', category: 'drums', engine: 'drums', params: { decay: 0.8, tune: 0.9, level: 0.85 } },
  { id: 'kit-trap', name: 'Trap Kit', category: 'drums', engine: 'drums', params: { decay: 1.3, tune: 0.75 } },
  { id: 'kit-boom', name: 'Boom Kit', category: 'drums', engine: 'drums', params: { decay: 2.2, tune: 0.7 } },
  { id: 'kit-crisp', name: 'Crisp Kit', category: 'drums', engine: 'drums', params: { decay: 0.5, tune: 1.25 } },
  { id: 'kit-soft', name: 'Soft Kit', category: 'drums', engine: 'drums', params: { decay: 1.2, level: 0.7 } },
  // bass
  { id: 'bass-sub', name: 'Sub Bass', category: 'bass', engine: 'analog', params: { wave: 'sine', detune: 0, cutoff: 400, res: 1, fenv: 0, sub: 0.2, a: 0.01, d: 0.1, s: 0.9, r: 0.12 }, trim: 0.5 },
  { id: 'bass-reese', name: 'Reese Bass', category: 'bass', engine: 'analog', params: { detune: 18, cutoff: 700, res: 3, fenv: 800, sub: 0.5, s: 0.8 }, trim: 0.87 },
  { id: 'bass-pluck', name: 'Pluck Bass', category: 'bass', engine: 'analog', params: { cutoff: 300, res: 6, fenv: 3000, fdecay: 0.12, sub: 0.6, d: 0.15, s: 0.2, r: 0.08 }, trim: 1.45 },
  { id: 'bass-chip', name: 'Chip Bass', category: 'bass', engine: 'chip', params: { wave: 'square', s: 0.8, r: 0.05 } },
  { id: 'bass-deep', name: 'Deep Bass', category: 'bass', engine: 'analog', params: { wave: 'sine', detune: 0, cutoff: 250, res: 0.7, fenv: 0, sub: 0.1, s: 0.95 }, trim: 0.5 },
  { id: 'bass-fm', name: 'FM Bass', category: 'bass', engine: 'fm', params: { ratio: 0.5, index: 4, d: 0.3, s: 0.6, r: 0.1 }, trim: 0.93 },
  { id: 'bass-saw', name: 'Saw Bass', category: 'bass', engine: 'analog', params: { detune: 4, cutoff: 900, res: 2, fenv: 1500, sub: 0.4, s: 0.7 }, trim: 0.85 },
  { id: 'bass-growl', name: 'Growl Bass', category: 'bass', engine: 'analog', params: { wave: 'square', detune: 12, cutoff: 600, res: 8, fenv: 1800, fdecay: 0.3, sub: 0.4, s: 0.7 }, trim: 0.62 },
  { id: 'bass-round', name: 'Round Bass', category: 'bass', engine: 'basic', params: { wave: 'sine', a: 0.01, d: 0.15, s: 0.8, r: 0.12 }, trim: 0.66 },
  { id: 'bass-tri', name: 'Triangle Bass', category: 'bass', engine: 'basic', params: { wave: 'triangle', a: 0.01, d: 0.1, s: 0.8, r: 0.1 }, trim: 0.82 },
  // lead
  { id: 'lead-saw', name: 'Saw Lead', category: 'lead', engine: 'analog', params: { cutoff: 2500, res: 2, fenv: 3000, sub: 0, s: 0.7 }, trim: 1.14 },
  { id: 'lead-chip', name: 'Chip Lead', category: 'lead', engine: 'chip', params: {}, trim: 1.4 },
  { id: 'lead-tri', name: 'Soft Lead', category: 'lead', engine: 'basic', params: { wave: 'triangle', s: 0.6, r: 0.2 } },
  { id: 'lead-fm', name: 'FM Lead', category: 'lead', engine: 'fm', params: { ratio: 2, index: 3, s: 0.5, d: 0.3 } },
  { id: 'lead-pulse', name: 'Pulse Arp', category: 'lead', engine: 'chip', params: { wave: 'sawtooth', d: 0.04, s: 0.2, r: 0.03 }, trim: 3.0 },
  { id: 'lead-bright', name: 'Bright Lead', category: 'lead', engine: 'analog', params: { cutoff: 4200, res: 1, fenv: 2500, sub: 0, s: 0.7 }, trim: 1.16 },
  { id: 'lead-pluck', name: 'Pluck Lead', category: 'lead', engine: 'analog', params: { cutoff: 1800, res: 3, fenv: 3500, fdecay: 0.1, sub: 0, d: 0.12, s: 0.1, r: 0.08 }, trim: 2.03 },
  { id: 'lead-square', name: 'Square Lead', category: 'lead', engine: 'chip', params: { wave: 'square', s: 0.7, r: 0.08 }, trim: 1.12 },
  { id: 'lead-sine', name: 'Sine Lead', category: 'lead', engine: 'basic', params: { wave: 'sine', s: 0.7, r: 0.15 }, trim: 0.75 },
  { id: 'lead-hollow', name: 'Hollow Lead', category: 'lead', engine: 'fm', params: { ratio: 2, index: 1, s: 0.6, d: 0.3 }, trim: 0.92 },
  { id: 'lead-whistle', name: 'Whistle', category: 'lead', engine: 'basic', params: { wave: 'sine', a: 0.05, s: 0.8, r: 0.2 }, trim: 0.67 },
  { id: 'lead-edge', name: 'Edge Lead', category: 'lead', engine: 'analog', params: { cutoff: 3500, res: 8, fenv: 2000, sub: 0, s: 0.7 }, trim: 1.1 },
  { id: 'lead-tri-chip', name: '8-Bit Tri', category: 'lead', engine: 'chip', params: { wave: 'triangle', s: 0.8 }, trim: 1.46 },
  // pad
  { id: 'pad-warm', name: 'Warm Pad', category: 'pad', engine: 'analog', params: { detune: 14, cutoff: 900, res: 1, fenv: 400, fdecay: 0.8, sub: 0, a: 0.4, d: 0.5, s: 0.8, r: 0.8 }, trim: 1.1 },
  { id: 'pad-air', name: 'Airy Pad', category: 'pad', engine: 'basic', params: { wave: 'sine', a: 0.5, d: 0.4, s: 0.8, r: 1.0 }, trim: 0.73 },
  { id: 'pad-glass', name: 'Glass Pad', category: 'pad', engine: 'fm', params: { ratio: 4, index: 1.2, a: 0.3, d: 0.5, s: 0.7, r: 1.0 }, trim: 0.78 },
  { id: 'pad-strings', name: 'Strings', category: 'pad', engine: 'analog', params: { detune: 20, cutoff: 1800, res: 1, fenv: 300, fdecay: 0.6, sub: 0, a: 0.6, d: 0.4, s: 0.85, r: 0.9 }, trim: 1.24 },
  { id: 'pad-choir', name: 'Choir', category: 'pad', engine: 'fm', params: { ratio: 1, index: 1.5, a: 0.5, d: 0.4, s: 0.75, r: 1.0 }, trim: 0.71 },
  { id: 'pad-dark', name: 'Dark Pad', category: 'pad', engine: 'analog', params: { detune: 10, cutoff: 500, res: 1, fenv: 200, fdecay: 1, sub: 0.2, a: 0.8, d: 0.6, s: 0.8, r: 1.1 }, trim: 1.47 },
  { id: 'pad-bright', name: 'Bright Pad', category: 'pad', engine: 'analog', params: { detune: 12, cutoff: 3000, res: 1, fenv: 500, fdecay: 0.7, sub: 0, a: 0.3, d: 0.5, s: 0.8, r: 0.8 } },
  { id: 'pad-soft', name: 'Soft Pad', category: 'pad', engine: 'basic', params: { wave: 'triangle', a: 0.6, d: 0.4, s: 0.8, r: 1.0 } },
  { id: 'pad-sweep', name: 'Sweep Pad', category: 'pad', engine: 'analog', params: { detune: 15, cutoff: 600, res: 2, fenv: 2500, fdecay: 1.5, sub: 0, a: 0.8, d: 0.6, s: 0.75, r: 1.0 }, trim: 1.53 },
  // keys
  { id: 'keys-warm', name: 'Warm Keys', category: 'keys', engine: 'basic', params: {}, trim: 1.71 },
  { id: 'keys-ep', name: 'E-Piano', category: 'keys', engine: 'fm', params: { ratio: 1, index: 2.5, d: 0.5, s: 0.15, r: 0.3 } },
  { id: 'keys-bell', name: 'Bells', category: 'keys', engine: 'fm', params: {}, trim: 1.59 },
  { id: 'keys-pluck', name: 'Pluck', category: 'keys', engine: 'basic', params: { wave: 'sawtooth', d: 0.12, s: 0.05, r: 0.1 }, trim: 2.61 },
  { id: 'keys-organ', name: 'Organ', category: 'keys', engine: 'basic', params: { wave: 'square', a: 0.01, d: 0.05, s: 0.9, r: 0.08 }, trim: 0.51 },
  { id: 'keys-clav', name: 'Clav', category: 'keys', engine: 'analog', params: { wave: 'square', detune: 0, cutoff: 2200, res: 2, fenv: 2000, fdecay: 0.08, sub: 0, d: 0.1, s: 0.05, r: 0.05 }, trim: 1.41 },
  { id: 'keys-marimba', name: 'Marimba', category: 'keys', engine: 'fm', params: { ratio: 4, index: 1, d: 0.35, s: 0, r: 0.2 }, trim: 1.45 },
  { id: 'keys-vibes', name: 'Vibes', category: 'keys', engine: 'fm', params: { ratio: 4, index: 1.8, d: 0.8, s: 0.2, r: 0.6 }, trim: 0.88 },
  { id: 'keys-box', name: 'Music Box', category: 'keys', engine: 'fm', params: { ratio: 5, index: 0.8, d: 0.5, s: 0, r: 0.5 }, trim: 1.22 },
  { id: 'keys-harp', name: 'Harp', category: 'keys', engine: 'basic', params: { wave: 'triangle', d: 0.5, s: 0, r: 0.4 }, trim: 1.28 },
  { id: 'keys-tine', name: 'Tine Keys', category: 'keys', engine: 'fm', params: { ratio: 7, index: 1, d: 0.6, s: 0.05, r: 0.5 }, trim: 1.08 },
];

export const CATEGORIES: Category[] = ['drums', 'bass', 'lead', 'pad', 'keys'];
export const getPreset = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export function voiceOf(presetId: string): { engine: Engine; params: P; preset: Preset; trim: number } {
  const preset = getPreset(presetId);
  const engine = getEngine(preset.engine);
  return { engine, preset, trim: preset.trim ?? 1, params: { ...engine.defaults, ...preset.params } as P };
}
