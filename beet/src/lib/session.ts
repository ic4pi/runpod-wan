import { getPreset, PRESETS } from './synth/presets';
import { DRUMS } from './synth/engines';

export const MAX_TRACKS = 8;
export const BAR_OPTIONS = [1, 2, 4, 8, 16];

/**
 * Time signature. BPM is always quarter notes per minute, whatever the meter.
 * The grid is always 16th-notes, so:
 *   - a quarter-note beat (/4) = 4 steps
 *   - an eighth-note beat (/8) = 2 steps, with the accent every dotted quarter (3 eighths = 6 steps)
 */
export interface TimeSig { beats: number; unit: 4 | 8 }

export const DEFAULT_SIG: TimeSig = { beats: 4, unit: 4 };
/** 16th-note steps per notated beat unit */
export const unitSteps = (sig: TimeSig) => (sig.unit === 8 ? 2 : 4);
/** 16th-note steps per bar: 4/4 = 16, 3/4 = 12, 6/8 = 12, 5/4 = 20 */
export const barSteps = (sig: TimeSig) => sig.beats * unitSteps(sig);
/** accent spacing in steps: every beat in /4, every dotted quarter in /8 */
export const accentSteps = (sig: TimeSig) => (sig.unit === 8 ? 6 : unitSteps(sig));
export const totalSteps = (s: Session) => s.bars * barSteps(s.sig);
export const stepSeconds = (bpm: number) => 60 / bpm / 4;
export const entryStep = (s: Session, t: Track) => t.startBar * barSteps(s.sig);

export interface Note { step: number; pitch: number; len: number; vel: number }
export interface Track {
  id: string; name: string; presetId: string;
  volume: number; pan: number; mute: boolean; solo: boolean;
  /** the track is silent until this bar (0-based) */
  startBar: number;
  reverb: number; delay: number; humanize: number;
  notes: Note[];
}
export interface Session { bpm: number; bars: number; sig: TimeSig; tracks: Track[] }

const KEY = 'beet-session-v1';
const newId = () => crypto.randomUUID();
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const isDrumTrack = (t: Track) => getPreset(t.presetId).category === 'drums';

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

/** Drop notes that fall outside the song and clip note tails at the end. */
export function fitNotes(s: Session): Session {
  const total = totalSteps(s);
  return {
    ...s,
    tracks: s.tracks.map((t) => ({
      ...t,
      startBar: Math.min(t.startBar, s.bars - 1),
      notes: t.notes
        .filter((n) => n.step < total)
        .map((n) => ({ ...n, len: Math.min(n.len, total - n.step) })),
    })),
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
  return { bpm: 92, bars: 2, sig: { ...DEFAULT_SIG }, tracks: [drums] };
}

/** Accepts sessions saved by older versions (fills missing fields). Returns null if unusable. */
export function normalizeSession(raw: unknown): Session | null {
  const s = raw as Partial<Session> | null;
  if (!s || typeof s.bpm !== 'number' || !BAR_OPTIONS.includes(s.bars as number) || !Array.isArray(s.tracks) || s.tracks.length > MAX_TRACKS) return null;
  const rawSig = s.sig as Partial<TimeSig> | undefined;
  const beats = Math.round(Number(rawSig?.beats));
  const unit = Number(rawSig?.unit);
  const sig: TimeSig = beats >= 1 && beats <= 8 && (unit === 4 || unit === 8)
    ? { beats, unit }
    : { ...DEFAULT_SIG };
  const total = s.bars as number * barSteps(sig);
  const tracks: Track[] = [];
  for (const t of s.tracks as Partial<Track>[]) {
    if (!t || typeof t.id !== 'string' || !Array.isArray(t.notes) || !PRESETS.some((p) => p.id === t.presetId)) return null;
    tracks.push({
      id: t.id, name: String(t.name ?? 'Track'), presetId: t.presetId as string,
      volume: clamp(Number(t.volume ?? 0.8), 0, 1.2), pan: clamp(Number(t.pan ?? 0), -1, 1),
      mute: !!t.mute, solo: !!t.solo,
      startBar: clamp(Math.round(Number(t.startBar ?? 0)), 0, (s.bars as number) - 1),
      reverb: clamp(Number(t.reverb ?? 0), 0, 1), delay: clamp(Number(t.delay ?? 0), 0, 1), humanize: clamp(Number(t.humanize ?? 0), 0, 1),
      notes: (t.notes as Note[]).filter((n) => n && Number.isFinite(n.step) && Number.isFinite(n.pitch) && n.len >= 1 && n.step < total)
        .map((n) => ({ ...n, len: Math.min(n.len, total - n.step) })),
    });
  }
  return { bpm: clamp(Math.round(s.bpm), 60, 180), bars: s.bars as number, sig, tracks };
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
