/**
 * Grocery suite — interop contract.
 * Sprouts (recording) hands sessions off to the Grocery hub, Beet (beats),
 * and Processed/Preserves (mix/master) using one metadata shape + a strict
 * WAV spec. Everything here is plain JSON + PCM — no proprietary glue, so
 * any future Grocery app or compatible partner can read it.
 */
import type { Levels } from '../templates';

export const GROCERY_SAMPLE_RATE = 44100;
export const GROCERY_BIT_DEPTH = 16;
export const GROCERY_CHANNELS = 2;

/** One track in a session — a vocal layer or the beat. */
export interface GroceryTrack {
  name: string;
  role: string;          // 'beat' | 'lead' | 'double' | 'backup' | 'adlib'
  startBar: number;      // 0-based bar where the track begins
  offsetSeconds: number; // fine offset within the bar (sub-beat timing)
  duration: number;      // seconds
  pan: number | null;
  gain: number | null;
  /** stem filename inside the export bundle (relative) */
  file: string;
}

export interface GrocerySession {
  suite: 'grocery';
  app: 'sprouts';
  version: 1;
  sessionName: string;
  bpm: number;
  barCount: number;
  templateId: string;
  levels?: Levels;
  createdAt: number;
  tracks: GroceryTrack[];
}

/** seconds → bars at a given bpm (4/4) */
export function secondsToBars(seconds: number, bpm: number): number {
  return (seconds / 60) * (bpm / 4);
}

/** Build the handoff metadata for a recorded session. */
export function buildGrocerySession(opts: {
  sessionName: string;
  bpm: number;
  templateId: string;
  levels?: Levels;
  layers: { role: string; duration: number; pan: number | null; gain: number | null }[];
  /** Individual music stems retained for the Pastry mix. */
  backingStems?: { name: string; duration: number; role: 'beat' | 'bass'; file?: string }[];
  /** Legacy single-instrumental input. */
  beatDuration?: number;
}): GrocerySession {
  const { sessionName, bpm, templateId, levels, layers, backingStems = [], beatDuration } = opts;
  const tracks: GroceryTrack[] = [];
  let maxEnd = 0;

  const music = backingStems.length > 0
    ? backingStems.map((stem, index) => ({ ...stem, file: stem.file ?? `backing-${index + 1}.wav` }))
    : beatDuration && beatDuration > 0
      ? [{ name: 'beat', duration: beatDuration, role: 'beat' as const, file: 'beat.wav' }]
      : [];

  for (const stem of music) {
    tracks.push({
      name: stem.name,
      role: stem.role,
      startBar: 0,
      offsetSeconds: 0,
      duration: stem.duration,
      pan: null,
      gain: null,
      file: stem.file,
    });
    maxEnd = Math.max(maxEnd, stem.duration);
  }

  const roleCounts: Record<string, number> = {};
  for (const l of layers) {
    const idx = (roleCounts[l.role] = (roleCounts[l.role] ?? 0) + 1);
    tracks.push({
      name: idx > 1 ? `${l.role}-${idx}` : l.role,
      role: l.role,
      startBar: 0,
      offsetSeconds: 0,
      duration: l.duration,
      pan: l.pan,
      gain: l.gain,
      file: `${l.role}${idx > 1 ? `-${idx}` : ''}.wav`,
    });
    maxEnd = Math.max(maxEnd, l.duration);
  }

  return {
    suite: 'grocery',
    app: 'sprouts',
    version: 1,
    sessionName,
    bpm,
    barCount: Math.max(1, Math.ceil(secondsToBars(maxEnd, bpm))),
    templateId,
    levels,
    createdAt: Date.now(),
    tracks,
  };
}

/** Serialize to the JSON sidecar that travels with the stems. */
export function grocerySessionJson(session: GrocerySession): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Parse a Grocery/Beet session on import. Validates the envelope and
 * returns null on anything that doesn't look like the contract.
 */
export function parseGrocerySession(json: string): GrocerySession | null {
  try {
    const o = JSON.parse(json) as Partial<GrocerySession>;
    if ((o.suite as string) !== 'grocery' && (o.suite as string) !== 'produce' || typeof o.bpm !== 'number' || !Array.isArray(o.tracks)) return null;
    return o as GrocerySession;
  } catch {
    return null;
  }
}
