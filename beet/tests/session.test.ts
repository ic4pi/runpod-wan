import { beforeEach, describe, expect, it } from 'vitest';
import { audible, defaultSession, loadSession, newTrack, normalizeSession, saveSession, type Session } from '@/lib/session';
import { copyBar, maxLength } from '@/lib/notes';
import { feel } from '@/lib/humanize';

class MemStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }
beforeEach(() => { (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore(); });

const two = (): Session => {
  const s = defaultSession();
  s.tracks.push(newTrack('bass-sub', s.tracks));
  return s;
};

describe('mute and solo', () => {
  it('plays everything when nothing is muted or soloed', () => expect(audible(two())).toHaveLength(2));
  it('drops muted tracks', () => { const s = two(); s.tracks[0].mute = true; expect(audible(s).map((t) => t.name)).toEqual(['Sub Bass']); });
  it('solo wins over the rest', () => { const s = two(); s.tracks[1].solo = true; expect(audible(s).map((t) => t.name)).toEqual(['Sub Bass']); });
  it('a muted track stays silent even when soloed', () => { const s = two(); s.tracks[1].solo = true; s.tracks[1].mute = true; expect(audible(s)).toHaveLength(0); });
});

describe('saving and loading', () => {
  it('falls back to the starter beat on corrupt data', () => {
    localStorage.setItem('beet-session-v1', '{not json');
    expect(loadSession().tracks).toHaveLength(1);
  });
  it('round-trips a session', () => {
    const s = two(); s.bpm = 110; saveSession(s);
    expect(loadSession().bpm).toBe(110);
    expect(loadSession().tracks).toHaveLength(2);
  });
  it('fills in fields that older saves did not have', () => {
    const old = { bpm: 100, bars: 2, tracks: [{ id: 'a', name: 'Old', presetId: 'kit-punchy', volume: 0.8, pan: 0, mute: false, solo: false, notes: [] }] };
    const s = normalizeSession(old)!;
    expect(s.tracks[0]).toMatchObject({ startBar: 0, reverb: 0, delay: 0, humanize: 0 });
  });
  it('rejects unknown sounds and too many tracks', () => {
    expect(normalizeSession({ bpm: 90, bars: 2, tracks: [{ id: 'a', presetId: 'nope', notes: [] }] })).toBeNull();
    const t = (i: number) => ({ id: String(i), presetId: 'kit-punchy', notes: [] });
    expect(normalizeSession({ bpm: 90, bars: 2, tracks: Array.from({ length: 9 }, (_, i) => t(i)) })).toBeNull();
  });
  it('clamps a bad start bar and out-of-range tempo', () => {
    const s = normalizeSession({ bpm: 999, bars: 2, tracks: [{ id: 'a', presetId: 'kit-punchy', startBar: 9, notes: [] }] })!;
    expect(s.bpm).toBe(180); expect(s.tracks[0].startBar).toBe(1);
  });
});

describe('note editing helpers', () => {
  const n = (step: number, pitch = 60, len = 1) => ({ step, pitch, len, vel: 100 });
  it('a note stops at the next note on the same pitch', () => expect(maxLength([n(0), n(4)], n(0), 0, 32)).toBe(4));
  it('ignores notes on other pitches', () => expect(maxLength([n(0), n(4, 61)], n(0), 0, 32)).toBe(32));
  it('a note stops at the end of the song', () => expect(maxLength([n(30)], n(30), 0, 32)).toBe(2));
  it('copies a bar and replaces the target', () => {
    const out = copyBar([n(0), n(4), n(16, 62)], 0, 1);
    expect(out.filter((x) => x.step >= 16).map((x) => [x.step, x.pitch]).sort()).toEqual([[16, 60], [20, 60]]);
  });
  it('copying onto itself changes nothing', () => { const a = [n(0)]; expect(copyBar(a, 0, 0)).toBe(a); });
  it('clips a copied note at the bar end', () => expect(copyBar([n(14, 60, 4)], 0, 1).find((x) => x.step === 30)!.len).toBe(2));
});

describe('feel (humanize)', () => {
  const t = (h: number) => ({ ...newTrack('kit-punchy', []), id: 'x', humanize: h });
  const note = { step: 3, pitch: 36, len: 1, vel: 100 };
  it('does nothing at zero', () => expect(feel(t(0), note)).toEqual({ delay: 0, vel: 100 }));
  it('is the same every time', () => expect(feel(t(1), note)).toEqual(feel(t(1), note)));
  it('only ever delays, and stays small', () => { for (let s = 0; s < 200; s++) { const f = feel(t(1), { ...note, step: s }); expect(f.delay).toBeGreaterThanOrEqual(0); expect(f.delay).toBeLessThan(0.023); expect(f.vel).toBeGreaterThan(85); expect(f.vel).toBeLessThan(115); } });
});
