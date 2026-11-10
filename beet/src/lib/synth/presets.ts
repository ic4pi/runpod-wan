import { getEngine, type Engine, type P } from './engines';

export type Category = 'drums' | 'bass' | 'lead' | 'pad' | 'keys';
export interface Preset { id: string; name: string; category: Category; engine: string; params: Partial<P> }

export const PRESETS: Preset[] = [
  // drums
  { id: 'kit-punchy', name: 'Punchy Kit', category: 'drums', engine: 'drums', params: {} },
  { id: 'kit-tight', name: 'Tight Kit', category: 'drums', engine: 'drums', params: { decay: 0.6, tune: 1.1 } },
  { id: 'kit-808', name: '808 Kit', category: 'drums', engine: 'drums', params: { decay: 1.8, tune: 0.8 } },
  { id: 'kit-lofi', name: 'Lo-Fi Kit', category: 'drums', engine: 'drums', params: { decay: 0.8, tune: 0.9, level: 0.85 } },
  // bass
  { id: 'bass-sub', name: 'Sub Bass', category: 'bass', engine: 'analog', params: { wave: 'sine', detune: 0, cutoff: 400, res: 1, fenv: 0, sub: 0.2, a: 0.01, d: 0.1, s: 0.9, r: 0.12 } },
  { id: 'bass-reese', name: 'Reese Bass', category: 'bass', engine: 'analog', params: { detune: 18, cutoff: 700, res: 3, fenv: 800, sub: 0.5, s: 0.8 } },
  { id: 'bass-pluck', name: 'Pluck Bass', category: 'bass', engine: 'analog', params: { cutoff: 300, res: 6, fenv: 3000, fdecay: 0.12, sub: 0.6, d: 0.15, s: 0.2, r: 0.08 } },
  { id: 'bass-chip', name: 'Chip Bass', category: 'bass', engine: 'chip', params: { wave: 'square', s: 0.8, r: 0.05 } },
  // lead
  { id: 'lead-saw', name: 'Saw Lead', category: 'lead', engine: 'analog', params: { cutoff: 2500, res: 2, fenv: 3000, sub: 0, s: 0.7 } },
  { id: 'lead-chip', name: 'Chip Lead', category: 'lead', engine: 'chip', params: {} },
  { id: 'lead-tri', name: 'Soft Lead', category: 'lead', engine: 'basic', params: { wave: 'triangle', s: 0.6, r: 0.2 } },
  { id: 'lead-fm', name: 'FM Lead', category: 'lead', engine: 'fm', params: { ratio: 2, index: 3, s: 0.5, d: 0.3 } },
  { id: 'lead-pulse', name: 'Pulse Arp', category: 'lead', engine: 'chip', params: { wave: 'sawtooth', d: 0.04, s: 0.2, r: 0.03 } },
  // pad
  { id: 'pad-warm', name: 'Warm Pad', category: 'pad', engine: 'analog', params: { detune: 14, cutoff: 900, res: 1, fenv: 400, fdecay: 0.8, sub: 0, a: 0.4, d: 0.5, s: 0.8, r: 0.8 } },
  { id: 'pad-air', name: 'Airy Pad', category: 'pad', engine: 'basic', params: { wave: 'sine', a: 0.5, d: 0.4, s: 0.8, r: 1.0 } },
  { id: 'pad-glass', name: 'Glass Pad', category: 'pad', engine: 'fm', params: { ratio: 4, index: 1.2, a: 0.3, d: 0.5, s: 0.7, r: 1.0 } },
  // keys
  { id: 'keys-warm', name: 'Warm Keys', category: 'keys', engine: 'basic', params: {} },
  { id: 'keys-ep', name: 'E-Piano', category: 'keys', engine: 'fm', params: { ratio: 1, index: 2.5, d: 0.5, s: 0.15, r: 0.3 } },
  { id: 'keys-bell', name: 'Bells', category: 'keys', engine: 'fm', params: {} },
  { id: 'keys-pluck', name: 'Pluck', category: 'keys', engine: 'basic', params: { wave: 'sawtooth', d: 0.12, s: 0.05, r: 0.1 } },
];

export const CATEGORIES: Category[] = ['drums', 'bass', 'lead', 'pad', 'keys'];
export const getPreset = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export function voiceOf(presetId: string): { engine: Engine; params: P; preset: Preset } {
  const preset = getPreset(presetId);
  const engine = getEngine(preset.engine);
  return { engine, preset, params: { ...engine.defaults, ...preset.params } as P };
}
