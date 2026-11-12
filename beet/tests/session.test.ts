import { beforeEach, describe, expect, it } from 'vitest';
import {
  accentSteps, audible, barSteps, defaultSession, entryStep, fitNotes, loadSession, newTrack, normalizeSession, saveSession,
  totalSteps, unitSteps, type Session, type TimeSig,
} from '@/lib/session';
import { copyBar, maxLength } from '@/lib/notes';
import { feel } from '@/lib/humanize';
import { sessionToMidi } from '@/lib/midi';

class MemStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }
beforeEach(() => { (globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore(); });

const two = (): Session => {
  const s = defaultSession();
  s.tracks.push(newTrack('bass-sub', s.tracks));
  return s;
};

const sig = (beats: number, unit: 4 | 8): TimeSig => ({ beats, unit });

describe('mute and solo', () => {
  it('plays everything when nothing is muted or soloed', () => expect(audible(two())).toHaveLength(2));
  it('drops muted tracks', () => { const s = two(); s.tracks[0].mute = true; expect(audible(s).map((t) => t.name)).toEqual(['Sub Bass']); });
  it('solo wins over the rest', () => { const s = two(); s.tracks[1].solo = true; expect(audible(s).map((t) => t.name)).toEqual(['Sub Bass']); });
  it('a muted track stays silent even when soloed', () => { const s = two(); s.tracks[1].solo = true; s.tracks[1].mute = true; expect(audible(s)).toHaveLength(0); });
});

describe('time signature', () => {
  it('bars have one 16th-note slot per beat of the measure', () => {
    expect(barSteps(sig(4, 4))).toBe(16); // 4/4: four quarter beats
    expect(barSteps(sig(3, 4))).toBe(12); // 3/4
    expect(barSteps(sig(2, 4))).toBe(8);
    expect(barSteps(sig(5, 4))).toBe(20);
    expect(barSteps(sig(6, 8))).toBe(12); // six eighths
    expect(barSteps(sig(7, 8))).toBe(14);
  });
  it('accents fall on every beat in /4 and every dotted quarter in /8', () => {
    expect(accentSteps(sig(4, 4))).toBe(4);
    expect(accentSteps(sig(3, 4))).toBe(4);
    expect(accentSteps(sig(6, 8))).toBe(6);
    expect(accentSteps(sig(7, 8))).toBe(6);
    expect(unitSteps(sig(6, 8))).toBe(2);
  });
  it('totals follow the meter', () => {
    const s = defaultSession(); // 2 bars of 4/4
    expect(totalSteps(s)).toBe(32);
    s.sig = sig(3, 4);
    expect(totalSteps(s)).toBe(24);
    s.sig = sig(6, 8);
    expect(totalSteps(s)).toBe(24);
  });
  it('entry step is measured in the new meter', () => {
    const s = defaultSession();
    s.tracks[0].startBar = 1;
    expect(entryStep(s, s.tracks[0])).toBe(16);
    s.sig = sig(3, 4);
    expect(entryStep(s, s.tracks[0])).toBe(12);
  });
  it('old saves without a signature load as 4/4', () => {
    const old = { bpm: 100, bars: 2, tracks: [{ id: 'a', name: 'Old', presetId: 'kit-punchy', volume: 0.8, pan: 0, mute: false, solo: false, notes: [] }] };
    const s = normalizeSession(old)!;
    expect(s.sig).toEqual({ beats: 4, unit: 4 });
  });
  it('keeps a valid signature and repairs a junk one', () => {
    const base = { bpm: 100, bars: 2, tracks: [{ id: 'a', presetId: 'kit-punchy', notes: [] }] };
    expect(normalizeSession({ ...base, sig: { beats: 6, unit: 8 } })!.sig).toEqual({ beats: 6, unit: 8 });
    expect(normalizeSession({ ...base, sig: { beats: 99, unit: 8 } })!.sig).toEqual({ beats: 4, unit: 4 });
    expect(normalizeSession({ ...base, sig: { beats: 3, unit: 5 } })!.sig).toEqual({ beats: 4, unit: 4 });
  });
  it('drops notes that fall outside the song when the meter shrinks', () => {
    const s = defaultSession(); // kick at step 30 in bar 2 survives 4/4
    expect(s.tracks[0].notes.some((n) => n.step >= 24)).toBe(true);
    s.sig = sig(3, 4); // 2 bars * 12 = 24 steps
    const f = fitNotes(s);
    expect(f.tracks[0].notes.every((n) => n.step < 24)).toBe(true);
  });
  it('writes the time signature into MIDI files', () => {
    const s = defaultSession();
    const find = (bytes: Uint8Array, nn: number, dd: number) => {
      for (let i = 0; i < bytes.length - 7; i++) {
        if (bytes[i] === 0xff && bytes[i + 1] === 0x58 && bytes[i + 3] === nn && bytes[i + 4] === dd && bytes[i + 5] === 24 && bytes[i + 6] === 8) return true;
      }
      return false;
    };
    s.sig = sig(3, 4);
    expect(find(sessionToMidi(s), 3, 2)).toBe(true);
    s.sig = sig(6, 8);
    expect(find(sessionToMidi(s), 6, 3)).toBe(true);
    s.sig = sig(5, 4);
    expect(find(sessionToMidi(s), 5, 2)).toBe(true);
  });
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
    const out = copyBar([n(0), n(4), n(16, 62)], 0, 1, 16);
    expect(out.filter((x) => x.step >= 16).map((x) => [x.step, x.pitch]).sort()).toEqual([[16, 60], [20, 60]]);
  });
  it('copies a bar in 3/4 (12-step bars)', () => {
    const out = copyBar([n(0), n(4), n(12, 62)], 0, 1, 12);
    expect(out.filter((x) => x.step >= 12).map((x) => [x.step, x.pitch]).sort()).toEqual([[12, 60], [16, 60]]);
  });
  it('copying onto itself changes nothing', () => { const a = [n(0)]; expect(copyBar(a, 0, 0, 16)).toBe(a); });
  it('clips a copied note at the bar end', () => expect(copyBar([n(14, 60, 4)], 0, 1, 16).find((x) => x.step === 30)!.len).toBe(2));
});

describe('feel (humanize)', () => {
  const t = (h: number) => ({ ...newTrack('kit-punchy', []), id: 'x', humanize: h });
  const note = { step: 3, pitch: 36, len: 1, vel: 100 };
  it('does nothing at zero', () => expect(feel(t(0), note)).toEqual({ delay: 0, vel: 100 }));
  it('is the same every time', () => expect(feel(t(1), note)).toEqual(feel(t(1), note)));
  it('only ever delays, and stays small', () => { for (let s = 0; s < 200; s++) { const f = feel(t(1), { ...note, step: s }); expect(f.delay).toBeGreaterThanOrEqual(0); expect(f.delay).toBeLessThan(0.023); expect(f.vel).toBeGreaterThan(85); expect(f.vel).toBeLessThan(115); } });
});
