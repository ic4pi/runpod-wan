import { describe, expect, it } from 'vitest';
import { sessionToMidi } from '@/lib/midi';
import { defaultSession, newTrack, type Session } from '@/lib/session';

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

/** Split a Standard MIDI File into its track chunks, checking the layout as it goes. */
function parse(b: Uint8Array) {
  expect(String.fromCharCode(...b.slice(0, 4))).toBe('MThd');
  expect(u32(b, 4)).toBe(6);
  const format = u16(b, 8), ntrks = u16(b, 10), division = u16(b, 12);
  const tracks: Uint8Array[] = [];
  let o = 14;
  for (let i = 0; i < ntrks; i++) {
    expect(String.fromCharCode(...b.slice(o, o + 4))).toBe('MTrk');
    const len = u32(b, o + 4);
    tracks.push(b.slice(o + 8, o + 8 + len)); o += 8 + len;
  }
  expect(o).toBe(b.length);
  return { format, ntrks, division, tracks };
}

/** Walk a track and collect note-on/note-off events with absolute ticks. */
function events(t: Uint8Array) {
  const out: { tick: number; kind: 'on' | 'off'; ch: number; pitch: number; vel: number }[] = [];
  let i = 0, tick = 0, running = 0;
  while (i < t.length) {
    let d = 0; while (t[i] & 0x80) d = (d << 7) | (t[i++] & 0x7f); d = (d << 7) | t[i++]; tick += d;
    if (t[i] === 0xff) { const len = t[i + 2]; i += 3 + len; continue; }
    const st = t[i] & 0x80 ? (running = t[i++]) : running;
    const hi = st & 0xf0;
    if (hi === 0x90 || hi === 0x80) { out.push({ tick, kind: hi === 0x90 ? 'on' : 'off', ch: st & 0x0f, pitch: t[i], vel: t[i + 1] }); i += 2; }
    else i += 2;
  }
  return out;
}

describe('MIDI file export', () => {
  it('writes a valid format-1 file with a tempo track plus one track per instrument', () => {
    const s = defaultSession(); s.tracks.push({ ...newTrack('bass-sub', s.tracks), notes: [{ step: 0, pitch: 36, len: 4, vel: 90 }] });
    const m = parse(sessionToMidi(s));
    expect(m.format).toBe(1); expect(m.ntrks).toBe(3); expect(m.division).toBe(480);
  });
  it('writes the tempo', () => {
    const s = defaultSession(); s.bpm = 120;
    const tempo = parse(sessionToMidi(s)).tracks[0];
    const at = tempo.findIndex((x, i) => x === 0xff && tempo[i + 1] === 0x51);
    expect((tempo[at + 3] << 16) | (tempo[at + 4] << 8) | tempo[at + 5]).toBe(500000);
  });
  it('has one note-on and one note-off per note, with the right timing', () => {
    const s = defaultSession();
    const ev = events(parse(sessionToMidi(s)).tracks[1]);
    expect(ev.filter((e) => e.kind === 'on')).toHaveLength(s.tracks[0].notes.length);
    expect(ev.filter((e) => e.kind === 'off')).toHaveLength(s.tracks[0].notes.length);
    const kick = ev.find((e) => e.kind === 'on' && e.pitch === 36)!;
    expect(kick.tick).toBe(0);
    const off = ev.find((e) => e.kind === 'off' && e.pitch === 36)!;
    expect(off.tick).toBe(120); // one 16th at 480 PPQ
  });
  it('puts drums on channel 10 and melodic tracks elsewhere', () => {
    const s = defaultSession(); s.tracks.push({ ...newTrack('bass-sub', s.tracks), notes: [{ step: 0, pitch: 36, len: 1, vel: 90 }] });
    const m = parse(sessionToMidi(s));
    expect(new Set(events(m.tracks[1]).map((e) => e.ch))).toEqual(new Set([9]));
    expect(new Set(events(m.tracks[2]).map((e) => e.ch))).toEqual(new Set([0]));
  });
  it('leaves out muted tracks and notes before a track enters', () => {
    const s: Session = defaultSession(); s.tracks[0].mute = true;
    expect(parse(sessionToMidi(s)).ntrks).toBe(1);
    const b = { ...newTrack('bass-sub', []), startBar: 1, notes: [{ step: 0, pitch: 36, len: 1, vel: 90 }, { step: 16, pitch: 38, len: 1, vel: 90 }] };
    const ev = events(parse(sessionToMidi({ bpm: 90, bars: 2, tracks: [b] })).tracks[1]).filter((e) => e.kind === 'on');
    expect(ev.map((e) => e.pitch)).toEqual([38]);
  });
});
