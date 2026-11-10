import { getPreset, PRESETS } from './synth/presets';
import { DRUMS } from './synth/engines';

export const STEPS_PER_BAR = 16;
export const MAX_TRACKS = 8;
export const BAR_OPTIONS = [1, 2, 4, 8, 16];

export interface Note { step: number; pitch: number; len: number; vel: number }
export interface Track {
  id: string; name: string; presetId: string;
  volume: number; pan: number; mute: boolean; solo: boolean;
  /** the track is silent until this bar (0-based) */
  startBar: number;
  reverb: number; delay: number; humanize: number;
  notes: Note[];
}
export interface Session { bpm: number; bars: number; tracks: Track[] }

const KEY = 'beet-session-v1';
const newId = () => crypto.randomUUID();
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const isDrumTrack = (t: Track) => getPreset(t.presetId).category === 'drums';
export const totalSteps = (s: Session) => s.bars * STEPS_PER_BAR;
export const stepSeconds = (bpm: number) => 60 / bpm / 4;
export const entryStep = (t: Track) => t.startBar * STEPS_PER_BAR;

export function audible(s: Session): Track[] {
  const anySolo = s.tracks.some((t) => t.solo);
  return s.tracks.filter((t) => !t.mute && (!anySolo || t.solo));
}

export function newTrack(presetId: string, existing: Track[]): Track {
  const p = getPreset(presetId);
  const n = existing.filter((t) => t.presetId === presetId).length;
  return {
    id: newId(), name: n ? `${p.name} ${n + 1}` : p.name, presetId,
    volume: p.category === 'drums' ? 0.9 : 0.75, pan: 0, mute: false, solo: false,
    startBar: 0, reverb: 0, delay: 0, humanize: 0, notes: [],
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

/** Accepts sessions saved by older versions (fills missing fields). Returns null if unusable. */
export function normalizeSession(raw: unknown): Session | null {
  const s = raw as Partial<Session> | null;
  if (!s || typeof s.bpm !== 'number' || !BAR_OPTIONS.includes(s.bars as number) || !Array.isArray(s.tracks) || s.tracks.length > MAX_TRACKS) return null;
  const tracks: Track[] = [];
  for (const t of s.tracks as Partial<Track>[]) {
    if (!t || typeof t.id !== 'string' || !Array.isArray(t.notes) || !PRESETS.some((p) => p.id === t.presetId)) return null;
    tracks.push({
      id: t.id, name: String(t.name ?? 'Track'), presetId: t.presetId as string,
      volume: clamp(Number(t.volume ?? 0.8), 0, 1.2), pan: clamp(Number(t.pan ?? 0), -1, 1),
      mute: !!t.mute, solo: !!t.solo,
      startBar: clamp(Math.round(Number(t.startBar ?? 0)), 0, (s.bars as number) - 1),
      reverb: clamp(Number(t.reverb ?? 0), 0, 1), delay: clamp(Number(t.delay ?? 0), 0, 1), humanize: clamp(Number(t.humanize ?? 0), 0, 1),
      notes: (t.notes as Note[]).filter((n) => n && Number.isFinite(n.step) && Number.isFinite(n.pitch) && n.len >= 1),
    });
  }
  return { bpm: clamp(Math.round(s.bpm), 60, 180), bars: s.bars as number, tracks };
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = normalizeSession(JSON.parse(raw)); if (s) return s; }
  } catch { /* corrupt or blocked storage: fall back to the starter */ }
  return defaultSession();
}

export function saveSession(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}
