import { getPreset, PRESETS } from './synth/presets';
import { DRUMS } from './synth/engines';

export const STEPS_PER_BAR = 16;
export const MAX_TRACKS = 8;
export const BAR_OPTIONS = [1, 2, 4, 8, 16];

export interface Note { step: number; pitch: number; len: number; vel: number }
export interface Track {
  id: string; name: string; presetId: string;
  volume: number; pan: number; mute: boolean; solo: boolean;
  notes: Note[];
}
export interface Session { bpm: number; bars: number; tracks: Track[] }

const KEY = 'beet-session-v1';
const newId = () => crypto.randomUUID();

export const isDrumTrack = (t: Track) => getPreset(t.presetId).category === 'drums';
export const totalSteps = (s: Session) => s.bars * STEPS_PER_BAR;
export const stepSeconds = (bpm: number) => 60 / bpm / 4;

export function audible(s: Session): Track[] {
  const anySolo = s.tracks.some((t) => t.solo);
  return s.tracks.filter((t) => !t.mute && (!anySolo || t.solo));
}

export function newTrack(presetId: string, existing: Track[]): Track {
  const p = getPreset(presetId);
  const n = existing.filter((t) => t.presetId === presetId).length;
  return {
    id: newId(), name: n ? `${p.name} ${n + 1}` : p.name, presetId,
    volume: p.category === 'drums' ? 0.9 : 0.75, pan: 0, mute: false, solo: false, notes: [],
  };
}

/** A starter beat so the first Play makes noise. */
export function defaultSession(): Session {
  const drums = newTrack('kit-punchy', []);
  const k = DRUMS.find((d) => d.name === 'Kick')!.pitch;
  const sn = DRUMS.find((d) => d.name === 'Snare')!.pitch;
  const hh = DRUMS.find((d) => d.name === 'Closed Hat')!.pitch;
  const notes: Note[] = [];
  for (let bar = 0; bar < 2; bar++) {
    const o = bar * 16;
    for (const s of [0, 6, 8, 14]) notes.push({ step: o + s, pitch: k, len: 1, vel: 110 });
    for (const s of [4, 12]) notes.push({ step: o + s, pitch: sn, len: 1, vel: 105 });
    for (let s = 0; s < 16; s += 2) notes.push({ step: o + s, pitch: hh, len: 1, vel: s % 4 === 0 ? 95 : 70 });
  }
  drums.notes = notes;
  return { bpm: 92, bars: 2, tracks: [drums] };
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Session;
      if (s && typeof s.bpm === 'number' && BAR_OPTIONS.includes(s.bars) && Array.isArray(s.tracks) && s.tracks.length <= MAX_TRACKS &&
        s.tracks.every((t) => t && typeof t.id === 'string' && Array.isArray(t.notes) && PRESETS.some((p) => p.id === t.presetId))) return s;
    }
  } catch { /* corrupt or blocked storage: fall back to the starter */ }
  return defaultSession();
}

export function saveSession(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}
