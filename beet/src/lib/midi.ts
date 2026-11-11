import { audible, entryStep, totalSteps, type Session } from './session';
import { getPreset } from './synth/presets';

const PPQ = 480;
const TICK = PPQ / 4; // one 16th

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7) > 0) out.unshift((n & 0x7f) | 0x80);
  return out;
}
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63));
const chunk = (type: string, data: number[]) => [...ascii(type), ...be32(data.length), ...data];

interface Ev { tick: number; order: number; bytes: number[] }

function trackChunk(events: Ev[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let last = 0;
  for (const e of events) { data.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  data.push(...vlq(0), 0xff, 0x2f, 0x00);
  return chunk('MTrk', data);
}

/** Standard MIDI file (format 1): a tempo track plus one track per audible track. Drums go on channel 10. */
export function sessionToMidi(s: Session): Uint8Array {
  const tracks = audible(s).filter((t) => t.notes.some((n) => n.step >= entryStep(t) && n.step < totalSteps(s)));
  const us = Math.round(60_000_000 / s.bpm);
  const tempo: Ev[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255] },
    { tick: 0, order: 1, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
  ];
  const chunks = [trackChunk(tempo)];
  const melodicChannels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let m = 0;
  for (const t of tracks) {
    const ch = getPreset(t.presetId).category === 'drums' ? 9 : melodicChannels[m++ % melodicChannels.length];
    const name = ascii(t.name);
    const ev: Ev[] = [{ tick: 0, order: 0, bytes: [0xff, 0x03, name.length, ...name] }];
    for (const n of t.notes) {
      if (n.step < entryStep(t) || n.step >= totalSteps(s)) continue;
      const vel = Math.max(1, Math.min(127, Math.round(n.vel)));
      const pitch = Math.max(0, Math.min(127, n.pitch));
      ev.push({ tick: n.step * TICK, order: 2, bytes: [0x90 | ch, pitch, vel] });
      ev.push({ tick: (n.step + n.len) * TICK, order: 1, bytes: [0x80 | ch, pitch, 0] });
    }
    chunks.push(trackChunk(ev));
  }
  return new Uint8Array([...chunk('MThd', [...be16(1), ...be16(chunks.length), ...be16(PPQ)]), ...chunks.flat()]);
}
