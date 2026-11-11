import { describe, expect, it } from 'vitest';
import { CLAP, HAT_C, HAT_O, KEY_NAMES, KICK, SNARE, STEPS_PER_BAR, TEMPLATES, generateBeat, getTemplate, rng, type BeatPlan } from '../src/lib/beat/patterns';
import { BASS, LEADS, PADS } from '../src/lib/beat/sounds';
import { ENGINES } from '../src/lib/beat/engines';

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const plan = (id = 'boom', key = 9, bars = 16, seed = 1) => generateBeat({ template: getTemplate(id), key, bars, seed });
const all = (p: BeatPlan) => [...p.drums, ...p.bass, ...p.pad, ...p.lead];

describe('beat generator', () => {
  it('gives the same beat for the same inputs, and a different one for a new seed', () => {
    expect(plan('house', 4, 16, 5)).toEqual(plan('house', 4, 16, 5));
    expect(plan('boom', 9, 16, 1).lead).not.toEqual(plan('boom', 9, 16, 2).lead);
  });

  it.each(TEMPLATES.map((t) => [t.id]))('%s: every note is a valid, in-range, in-time note', (id) => {
    for (const key of [0, 3, 6, 9, 11]) for (const bars of [8, 16, 32]) {
      const p = plan(id, key, bars, 3);
      for (const n of all(p)) {
        expect(Number.isInteger(n.step)).toBe(true);
        expect(n.step).toBeGreaterThanOrEqual(0);
        expect(n.step).toBeLessThan(bars * STEPS_PER_BAR);
        expect(n.pitch).toBeGreaterThanOrEqual(0); expect(n.pitch).toBeLessThanOrEqual(127);
        expect(n.len).toBeGreaterThanOrEqual(1);
        expect(n.vel).toBeGreaterThan(0); expect(n.vel).toBeLessThanOrEqual(127);
        expect(n.shift ?? 0).toBeGreaterThanOrEqual(0); expect(n.shift ?? 0).toBeLessThan(1);
      }
    }
  });

  it('bass plays the chord root (or its fifth) in the chosen key', () => {
    for (const key of [0, 5, 9]) {
      const t = getTemplate('boom'); const p = generateBeat({ template: t, key, bars: 8, seed: 4 });
      const roots = [0, 8, 3, 10]; // minor progression
      p.bass.forEach((n) => {
        const bar = Math.floor(n.step / STEPS_PER_BAR);
        const rootPc = (key + roots[bar % 4]) % 12;
        expect([rootPc, (rootPc + 7) % 12]).toContain(n.pitch % 12);
        expect(n.pitch).toBeGreaterThanOrEqual(36); expect(n.pitch).toBeLessThanOrEqual(54);
      });
    }
  });

  it('pad plays one triad per bar with the right quality, all held for the bar', () => {
    const p = plan('boom', 9, 8, 1); // A minor: Am F C G
    const bars = Array.from({ length: 8 }, (_, b) => p.pad.filter((n) => n.step === b * 16).map((n) => n.pitch).sort((a, b) => a - b));
    bars.forEach((b) => expect(b).toHaveLength(3));
    const interval = (b: number[]) => [b[1] - b[0], b[2] - b[1]];
    expect(interval(bars[0])).toEqual([3, 4]); // A minor
    expect(interval(bars[1])).toEqual([4, 3]); // F major
    expect(interval(bars[2])).toEqual([4, 3]); // C major
    expect(interval(bars[3])).toEqual([4, 3]); // G major
    expect(bars[0][0] % 12).toBe(9); expect(bars[1][0] % 12).toBe(5);
    p.pad.forEach((n) => expect(n.len).toBe(16));
  });

  it('major templates use a major progression', () => {
    const p = generateBeat({ template: getTemplate('lofi'), key: 0, bars: 4, seed: 1 }); // C: C G Am F
    const bars = Array.from({ length: 4 }, (_, b) => p.pad.filter((n) => n.step === b * 16).map((n) => n.pitch).sort((a, b) => a - b));
    expect(bars.map((b) => b[0] % 12)).toEqual([0, 7, 9, 5]);
    expect(bars.map((b) => b[1] - b[0])).toEqual([4, 4, 3, 4]);
  });

  it('lead notes stay inside the key', () => {
    for (const id of ['boom', 'trap', 'house', 'lofi']) for (const key of [0, 2, 7, 10]) {
      const t = getTemplate(id); const scale = (t.mode === 'minor' ? MINOR : MAJOR).map((x) => (key + x) % 12);
      generateBeat({ template: t, key, bars: 16, seed: 9 }).lead.forEach((n) => expect(scale).toContain(n.pitch % 12));
    }
  });

  it('lead notes do not overlap and stay in a singable range', () => {
    const p = plan('boom', 9, 16, 2);
    const sorted = [...p.lead].sort((a, b) => a.step - b.step);
    sorted.forEach((n, i) => { if (sorted[i + 1]) expect(n.step + n.len).toBeLessThanOrEqual(sorted[i + 1].step); });
    p.lead.forEach((n) => { expect(n.pitch).toBeGreaterThanOrEqual(60); expect(n.pitch).toBeLessThanOrEqual(92); });
  });

  it('each kit has its signature groove', () => {
    const steps = (p: BeatPlan, pitch: number, bar = 0) => p.drums.filter((n) => n.pitch === pitch && Math.floor(n.step / 16) === bar).map((n) => n.step % 16);
    const house = plan('house'); expect(steps(house, KICK)).toEqual([0, 4, 8, 12]); expect(steps(house, CLAP)).toEqual([4, 12]); expect(steps(house, HAT_O)).toEqual([2, 6, 10, 14]);
    const boom = plan('boom'); expect(steps(boom, SNARE)).toEqual([4, 12]);
    const trap = plan('trap'); expect(steps(trap, CLAP)).toEqual([8]); expect(steps(trap, HAT_C)).toHaveLength(16);
  });

  it('adds a fill only on the last bar of every four', () => {
    const p = plan('boom', 9, 8, 1);
    const snareAt = (bar: number) => p.drums.filter((n) => n.pitch === SNARE && Math.floor(n.step / 16) === bar && n.step % 16 >= 14).length;
    expect(snareAt(3)).toBe(2); expect(snareAt(7)).toBe(2); expect(snareAt(0)).toBe(0); expect(snareAt(4)).toBe(0);
  });

  it('only swings the off-beat hats, and only for swung kits', () => {
    const lofi = plan('lofi').drums.filter((n) => n.pitch === HAT_C);
    expect(lofi.filter((n) => (n.step % 16) % 4 === 2).every((n) => n.shift === 0.3)).toBe(true);
    expect(lofi.filter((n) => (n.step % 16) % 4 !== 2).every((n) => !n.shift)).toBe(true);
    expect(plan('house').drums.every((n) => !n.shift)).toBe(true);
  });

  it('tempos and names are sensible', () => {
    TEMPLATES.forEach((t) => { expect(t.bpm).toBeGreaterThanOrEqual(60); expect(t.bpm).toBeLessThanOrEqual(180); expect(t.name.length).toBeGreaterThan(0); });
    expect(KEY_NAMES).toHaveLength(12);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('every sound points at a real engine', () => {
    const engines = new Set(ENGINES.map((e) => e.id));
    [...BASS, ...PADS, ...LEADS].forEach((s) => expect(engines.has(s.engine)).toBe(true));
    expect(new Set([...BASS, ...PADS, ...LEADS].map((s) => s.id + s.engine)).size).toBe(9);
  });

  it('the random generator is steady and in range', () => {
    const a = rng(7), b = rng(7);
    for (let i = 0; i < 50; i++) { const x = a(); expect(x).toBe(b()); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});
