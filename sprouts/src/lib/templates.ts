/**
 * Levels — genre templates.
 * Each template is a complete, analysis-aware vocal + mix chain.
 * Values are real DSP parameters applied through the Web Audio API:
 * live (light) while recording, full chain on the offline mix render.
 */

export interface EQBand {
  type: BiquadFilterType;
  freq: number;
  gainDb: number;
  q: number;
}

export interface VoiceChain {
  hpf: number;            // high-pass freq — kills rumble / handling noise
  eq: EQBand[];           // tonal shaping
  deessDb: number;        // static sibilance cut (scaled by measured sibilance)
  deessFreq: number;
  comp: {
    thresholdDb: number;
    ratio: number;
    attack: number;       // seconds
    release: number;      // seconds
  };
  makeupDb: number;
  saturation: number;     // 0..1 tanh drive amount
  reverb: {
    mix: number;          // 0..1 wet
    decay: number;        // seconds
    predelay: number;     // seconds
  };
  presenceDb: number;     // final air band
}

/**
 * Human-worded overrides — the "Levels" panel. Each 0..2, neutral at 1.
 * They bend the template without ever exposing a dB or a ratio.
 */
export interface Levels {
  warmth: number;
  brightness: number;
  punch: number;
  space: number;
}

export const NEUTRAL_LEVELS: Levels = { warmth: 1, brightness: 1, punch: 1, space: 1 };

export const LEVEL_DEFS: { key: keyof Levels; name: string; less: string; more: string }[] = [
  { key: 'warmth', name: 'Warmth', less: 'thinner', more: 'rounder' },
  { key: 'brightness', name: 'Brightness', less: 'darker', more: 'airier' },
  { key: 'punch', name: 'Punch', less: 'squeezed', more: 'open' },
  { key: 'space', name: 'Space', less: 'dry', more: 'wider' },
];

/** Bend a template chain by the levels. Returns a fresh copy. */
export function applyLevels(v: VoiceChain, l: Levels): VoiceChain {
  const delta = (x: number) => (x - 1); // -1..+1
  return {
    ...v,
    eq: v.eq.map((b) => ({ ...b, gainDb: b.gainDb * (0.5 + 0.5 * l.brightness) })),
    saturation: Math.min(1, v.saturation * (0.4 + 0.6 * l.warmth)),
    comp: {
      ...v.comp,
      thresholdDb: v.comp.thresholdDb + delta(l.punch) * 4, // more punch → higher threshold → less squashed
      ratio: Math.max(1, v.comp.ratio * (1 - delta(l.punch) * 0.25)),
    },
    reverb: { ...v.reverb, mix: Math.min(0.5, v.reverb.mix * (0.2 + 0.8 * l.space)) },
    presenceDb: v.presenceDb * l.brightness,
  };
}

export interface BusChain {
  trimDb: number;         // relative level in the mix
  hpf: number;
  lpf: number;
  compRatio: number;
  compThresholdDb: number;
}

export interface GenreTemplate {
  id: string;
  name: string;
  short: string;          // 2-3 char console label
  blurb: string;
  voice: VoiceChain;
  beat: BusChain;         // instrumental / beat stems
  bass: BusChain;         // bass stems
  master: {
    glueThresholdDb: number;
    glueRatio: number;
    limiterThresholdDb: number;
    ceilingDb: number;    // true-peak style normalize target
  };
}

const voice = (v: Partial<VoiceChain> & { eq: EQBand[] }): VoiceChain => ({
  hpf: 80,
  deessDb: -3,
  deessFreq: 6800,
  comp: { thresholdDb: -18, ratio: 3, attack: 0.008, release: 0.18 },
  makeupDb: 4,
  saturation: 0.15,
  reverb: { mix: 0.12, decay: 1.4, predelay: 0.02 },
  presenceDb: 0,
  ...v,
});

const bus = (b: Partial<BusChain> = {}): BusChain => ({
  trimDb: 0,
  hpf: 30,
  lpf: 18000,
  compRatio: 2,
  compThresholdDb: -20,
  ...b,
});

export const TEMPLATES: GenreTemplate[] = [
  {
    id: 'melodic-rap',
    name: 'Melodic Rap',
    short: 'MLR',
    blurb: 'Forward, glossy vocal. Tight lows, airy top, short plate.',
    voice: voice({
      hpf: 90,
      eq: [
        { type: 'lowshelf', freq: 200, gainDb: -2, q: 0.7 },
        { type: 'peaking', freq: 900, gainDb: -1.5, q: 1.1 },   // cut boxiness
        { type: 'peaking', freq: 3200, gainDb: 2.5, q: 0.9 },   // presence
        { type: 'highshelf', freq: 9500, gainDb: 4, q: 0.7 },   // air
      ],
      deessDb: -4,
      comp: { thresholdDb: -20, ratio: 4, attack: 0.006, release: 0.14 },
      makeupDb: 5.5,
      saturation: 0.22,
      reverb: { mix: 0.14, decay: 1.1, predelay: 0.03 },
      presenceDb: 1.5,
    }),
    beat: bus({ trimDb: -3, hpf: 28, compRatio: 2.5, compThresholdDb: -18 }),
    bass: bus({ trimDb: -2, hpf: 25, lpf: 250, compRatio: 3, compThresholdDb: -16 }),
    master: { glueThresholdDb: -14, glueRatio: 2, limiterThresholdDb: -4, ceilingDb: -1 },
  },
  {
    id: 'rnb-smooth',
    name: 'R&B Smooth',
    short: 'RNB',
    blurb: 'Warm, silky, intimate. Soft knee compression, long tail.',
    voice: voice({
      hpf: 75,
      eq: [
        { type: 'lowshelf', freq: 180, gainDb: 1.5, q: 0.7 },   // warmth
        { type: 'peaking', freq: 500, gainDb: -1, q: 1.4 },
        { type: 'peaking', freq: 2800, gainDb: 1.5, q: 1.0 },
        { type: 'highshelf', freq: 11000, gainDb: 3, q: 0.7 },
      ],
      deessDb: -3.5,
      deessFreq: 7200,
      comp: { thresholdDb: -19, ratio: 2.5, attack: 0.015, release: 0.25 },
      makeupDb: 4.5,
      saturation: 0.12,
      reverb: { mix: 0.2, decay: 2.2, predelay: 0.045 },
      presenceDb: 1,
    }),
    beat: bus({ trimDb: -4, hpf: 30, compRatio: 2 }),
    bass: bus({ trimDb: -2.5, hpf: 25, lpf: 220, compRatio: 2.5 }),
    master: { glueThresholdDb: -15, glueRatio: 1.8, limiterThresholdDb: -4.5, ceilingDb: -1 },
  },
  {
    id: 'raw-acoustic',
    name: 'Raw Acoustic',
    short: 'ACU',
    blurb: 'Barely touched. Gentle control, natural room, honest tone.',
    voice: voice({
      hpf: 65,
      eq: [
        { type: 'peaking', freq: 350, gainDb: -1.5, q: 1.2 },   // mud control
        { type: 'peaking', freq: 5000, gainDb: 1, q: 0.8 },
        { type: 'highshelf', freq: 12000, gainDb: 1.5, q: 0.7 },
      ],
      deessDb: -2,
      comp: { thresholdDb: -16, ratio: 2, attack: 0.02, release: 0.3 },
      makeupDb: 3,
      saturation: 0.05,
      reverb: { mix: 0.1, decay: 1.8, predelay: 0.02 },
    }),
    beat: bus({ trimDb: -2, hpf: 40, compRatio: 1.5, compThresholdDb: -22 }),
    bass: bus({ trimDb: -3, hpf: 30, lpf: 300, compRatio: 2 }),
    master: { glueThresholdDb: -16, glueRatio: 1.5, limiterThresholdDb: -5, ceilingDb: -1.5 },
  },
  {
    id: 'lofi',
    name: 'Lo-Fi Bedroom',
    short: 'LOF',
    blurb: 'Rolled-off top, saturated mids, tape-style glue.',
    voice: voice({
      hpf: 110,
      eq: [
        { type: 'lowshelf', freq: 250, gainDb: 2, q: 0.7 },
        { type: 'peaking', freq: 1200, gainDb: 2, q: 0.8 },     // mid-forward
        { type: 'highshelf', freq: 6500, gainDb: -6, q: 0.7 },  // dark top
      ],
      deessDb: -5,
      deessFreq: 6000,
      comp: { thresholdDb: -22, ratio: 5, attack: 0.004, release: 0.2 },
      makeupDb: 7,
      saturation: 0.45,
      reverb: { mix: 0.16, decay: 1.5, predelay: 0.015 },
    }),
    beat: bus({ trimDb: -2, hpf: 60, lpf: 8000, compRatio: 3, compThresholdDb: -20 }),
    bass: bus({ trimDb: -2, hpf: 30, lpf: 200, compRatio: 3 }),
    master: { glueThresholdDb: -13, glueRatio: 2.5, limiterThresholdDb: -4, ceilingDb: -1.2 },
  },
  {
    id: 'drill',
    name: 'Drill',
    short: 'DRL',
    blurb: 'Aggressive, dry and in-your-face. Hard knee, fast attack.',
    voice: voice({
      hpf: 100,
      eq: [
        { type: 'lowshelf', freq: 160, gainDb: -3, q: 0.7 },
        { type: 'peaking', freq: 2400, gainDb: 3, q: 1.0 },     // bite
        { type: 'highshelf', freq: 8000, gainDb: 3.5, q: 0.7 },
      ],
      deessDb: -4.5,
      comp: { thresholdDb: -22, ratio: 6, attack: 0.003, release: 0.09 },
      makeupDb: 7,
      saturation: 0.3,
      reverb: { mix: 0.06, decay: 0.8, predelay: 0.01 },
      presenceDb: 2,
    }),
    beat: bus({ trimDb: -2.5, hpf: 28, compRatio: 3, compThresholdDb: -16 }),
    bass: bus({ trimDb: -1.5, hpf: 25, lpf: 180, compRatio: 4, compThresholdDb: -14 }),
    master: { glueThresholdDb: -12, glueRatio: 2.5, limiterThresholdDb: -3.5, ceilingDb: -0.8 },
  },
  {
    id: 'pop-shine',
    name: 'Pop Shine',
    short: 'POP',
    blurb: 'Polished, bright, radio-ready. Wide air band, smooth lift.',
    voice: voice({
      hpf: 85,
      eq: [
        { type: 'lowshelf', freq: 220, gainDb: -1, q: 0.7 },
        { type: 'peaking', freq: 1000, gainDb: -1, q: 1.0 },
        { type: 'peaking', freq: 4000, gainDb: 2, q: 0.8 },
        { type: 'highshelf', freq: 10500, gainDb: 5, q: 0.7 },
      ],
      deessDb: -5,
      deessFreq: 7500,
      comp: { thresholdDb: -19, ratio: 3.5, attack: 0.01, release: 0.16 },
      makeupDb: 5,
      saturation: 0.1,
      reverb: { mix: 0.13, decay: 1.6, predelay: 0.04 },
      presenceDb: 2,
    }),
    beat: bus({ trimDb: -3, hpf: 30, compRatio: 2.5, compThresholdDb: -18 }),
    bass: bus({ trimDb: -2.5, hpf: 25, lpf: 240, compRatio: 3 }),
    master: { glueThresholdDb: -14, glueRatio: 2, limiterThresholdDb: -3.5, ceilingDb: -0.8 },
  },
];

export const DEFAULT_TEMPLATE_ID = 'melodic-rap';

export function getTemplate(id: string): GenreTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** Guess a stem's mix role from its filename. */
export function guessRole(filename: string): 'voice' | 'beat' | 'bass' {
  const f = filename.toLowerCase();
  if (/vox|vocal|voice|lead|adlib|ad-lib|hook|verse|singer/.test(f)) return 'voice';
  if (/bass|808|sub|low/.test(f)) return 'bass';
  return 'beat';
}
