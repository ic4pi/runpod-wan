/**
 * Beat templates and the generator that fills them in.
 * Pure functions only: the same inputs always give the same beat.
 */
export interface Note { step: number; pitch: number; len: number; vel: number; /** fractional steps, used for swing */ shift?: number }

export const STEPS_PER_BAR = 16;
export const KICK = 36, SNARE = 38, CLAP = 39, HAT_C = 42, HAT_O = 46;

export interface KitTemplate {
  id: string; name: string; blurb: string; bpm: number;
  mode: 'minor' | 'major';
  /** fraction of a step to delay the off-beat 8ths (hats, lead) */
  swing: number;
  /** drum kit sound settings for the drum engine */
  kit: Record<string, number>;
  kick: number[]; snare: number[]; clap: number[]; hatC: number[]; hatO: number[];
  /** extra hits on the last bar of every 4 */
  fill: { pitch: number; steps: number[] }[];
  /** bass hits per bar: step and length in steps */
  bass: { step: number; len: number }[];
}

export const TEMPLATES: KitTemplate[] = [
  {
    id: 'boom', name: 'Boom Bap', blurb: 'Dusty 90s hip hop', bpm: 90, mode: 'minor', swing: 0.12, kit: {},
    kick: [0, 7, 10], snare: [4, 12], clap: [], hatC: [0, 2, 4, 6, 8, 10, 12, 14], hatO: [],
    fill: [{ pitch: SNARE, steps: [14, 15] }, { pitch: KICK, steps: [14] }],
    bass: [{ step: 0, len: 6 }, { step: 7, len: 3 }, { step: 10, len: 5 }],
  },
  {
    id: 'trap', name: 'Trap', blurb: 'Half-time, rolling hats', bpm: 140, mode: 'minor', swing: 0, kit: { decay: 1.3, tune: 0.75 },
    kick: [0, 7, 10], snare: [], clap: [8], hatC: Array.from({ length: 16 }, (_, i) => i), hatO: [],
    fill: [{ pitch: HAT_C, steps: [14, 15] }, { pitch: CLAP, steps: [15] }],
    bass: [{ step: 0, len: 8 }, { step: 10, len: 6 }],
  },
  {
    id: 'house', name: 'House', blurb: 'Four on the floor', bpm: 124, mode: 'minor', swing: 0, kit: { decay: 0.6, tune: 1.1 },
    kick: [0, 4, 8, 12], snare: [], clap: [4, 12], hatC: [0, 4, 8, 12], hatO: [2, 6, 10, 14],
    fill: [{ pitch: CLAP, steps: [14, 15] }],
    bass: [{ step: 2, len: 2 }, { step: 6, len: 2 }, { step: 10, len: 2 }, { step: 14, len: 2 }],
  },
  {
    id: 'lofi', name: 'Lo-Fi', blurb: 'Slow, soft, swung', bpm: 80, mode: 'major', swing: 0.3, kit: { decay: 0.8, tune: 0.9, level: 0.85 },
    kick: [0, 10], snare: [4, 12], clap: [], hatC: [0, 2, 4, 6, 8, 10, 12, 14], hatO: [],
    fill: [{ pitch: SNARE, steps: [15] }],
    bass: [{ step: 0, len: 10 }, { step: 10, len: 6 }],
  },
];

export const getTemplate = (id: string): KitTemplate => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

const SCALE = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
/** One chord per bar, as semitones above the key and chord quality. */
const PROGRESSION = {
  minor: [{ root: 0, third: 3 }, { root: 8, third: 4 }, { root: 3, third: 4 }, { root: 10, third: 4 }],
  major: [{ root: 0, third: 4 }, { root: 7, third: 4 }, { root: 9, third: 3 }, { root: 5, third: 4 }],
};
const RHYTHMS = [[0, 3, 6, 8, 12], [0, 4, 8, 10, 14], [2, 6, 10, 12], [0, 6, 8, 14], [0, 2, 6, 10, 12, 14]];

export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Small seeded random number generator so "Shuffle" is repeatable. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BeatPlan { bpm: number; bars: number; drums: Note[]; bass: Note[]; pad: Note[]; lead: Note[] }

const swingShift = (step: number, swing: number) => (step % 4 === 2 ? swing : 0);

export function generateBeat(o: { template: KitTemplate; key: number; bars: number; seed: number }): BeatPlan {
  const { template: t, bars } = o;
  const key = ((o.key % 12) + 12) % 12;
  const rand = rng(o.seed);
  const chords = PROGRESSION[t.mode];
  const scale = SCALE[t.mode];
  const drums: Note[] = [], bass: Note[] = [], pad: Note[] = [], lead: Note[] = [];

  for (let b = 0; b < bars; b++) {
    const o0 = b * STEPS_PER_BAR;
    const chord = chords[b % 4];
    const isFillBar = b % 4 === 3;

    // drums
    const hit = (pitch: number, steps: number[], vel: (s: number) => number, swing = false) =>
      steps.forEach((s) => drums.push({ step: o0 + s, pitch, len: 1, vel: Math.round(vel(s) * (0.94 + rand() * 0.12)), shift: swing ? swingShift(s, t.swing) : 0 }));
    hit(KICK, t.kick, () => 112);
    hit(SNARE, t.snare, () => 105);
    hit(CLAP, t.clap, () => 100);
    hit(HAT_C, t.hatC, (s) => (s % 4 === 0 ? 88 : 62), true);
    hit(HAT_O, t.hatO, () => 80);
    if (isFillBar) t.fill.forEach((f) => hit(f.pitch, f.steps, () => 84));

    // bass: the chord's root, now and then the fifth on a later hit
    const rootPitch = 36 + ((key + chord.root) % 12);
    t.bass.forEach((h, i) => bass.push({ step: o0 + h.step, pitch: i > 0 && rand() < 0.25 ? rootPitch + 7 : rootPitch, len: h.len, vel: i === 0 ? 112 : 96 }));

    // pad: a held triad, kept in a comfortable middle range
    let base = 48 + ((key + chord.root) % 12);
    if (base > 59) base -= 12;
    [0, chord.third, 7].forEach((iv) => pad.push({ step: o0, pitch: base + iv, len: STEPS_PER_BAR, vel: 80 }));
  }

  // lead: a 4 bar motif, then a varied answer for the next 4, repeating
  const leadBase = 64 + ((key + 8) % 12); // 64..75
  const pitchesFor = (bar: number) => {
    const ch = chords[bar % 4];
    const tones = [0, ch.third, 7].map((x) => (key + ch.root + x) % 12);
    const scalePcs = scale.map((x) => (key + x) % 12);
    const out: { pitch: number; chord: boolean }[] = [];
    for (let p = leadBase; p <= leadBase + 14; p++) {
      const pc = p % 12;
      if (tones.includes(pc)) out.push({ pitch: p, chord: true });
      else if (scalePcs.includes(pc)) out.push({ pitch: p, chord: false });
    }
    return out;
  };
  const buildPhrase = (seed: number): { step: number; pitch: number }[][] => {
    const r = rng(seed);
    let prev = leadBase + 7;
    return [0, 1, 2, 3].map((bar) => {
      const cands = pitchesFor(bar);
      const steps = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
      return steps.map((step) => {
        const pool = r() < 0.7 ? cands.filter((c) => c.chord) : cands;
        const near = pool.filter((c) => Math.abs(c.pitch - prev) <= 4);
        const list = near.length > 0 && r() < 0.65 ? near : pool;
        const pick = list[Math.floor(r() * list.length)] ?? cands[0];
        prev = pick.pitch;
        return { step, pitch: pick.pitch };
      });
    });
  };
  const phraseA = buildPhrase(o.seed * 7 + 1);
  const phraseB = buildPhrase(o.seed * 7 + 2);
  for (let b = 0; b < bars; b++) {
    const phrase = Math.floor(b / 4) % 2 === 0 ? phraseA : phraseB;
    const notes = phrase[b % 4];
    notes.forEach((n, i) => {
      const next = i + 1 < notes.length ? notes[i + 1].step : STEPS_PER_BAR;
      lead.push({ step: b * STEPS_PER_BAR + n.step, pitch: n.pitch, len: Math.max(1, Math.min(4, next - n.step)), vel: 96, shift: swingShift(n.step, t.swing) });
    });
  }

  return { bpm: t.bpm, bars, drums, bass, pad, lead };
}
