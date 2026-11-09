/**
 * Produce suite — interop contract.
 * Sprouts (recording) hands sessions off to the Produce hub, Beet (beats),
 * and Processed/Preserves (mix/master) using one metadata shape + a strict
 * WAV spec. Everything here is plain JSON + PCM — no proprietary glue, so
 * any future Produce app or compatible partner can read it.
 */

export const PRODUCE_SAMPLE_RATE = 44100;
export const PRODUCE_BIT_DEPTH = 16;
export const PRODUCE_CHANNELS = 2;

/** One track in a session — a vocal layer or the beat. */
export interface ProduceTrack {
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

export interface ProduceSession {
  suite: 'produce';
  app: 'sprouts';
  version: 1;
  sessionName: string;
  bpm: number;
  barCount: number;
  templateId: string;
  createdAt: number;
  tracks: ProduceTrack[];
}

/** seconds → bars at a given bpm (4/4) */
export function secondsToBars(seconds: number, bpm: number): number {
  return (seconds / 60) * (bpm / 4);
}

/** Build the handoff metadata for a recorded session. */
export function buildProduceSession(opts: {
  sessionName: string;
  bpm: number;
  templateId: string;
  layers: { role: string; duration: number; pan: number | null; gain: number | null }[];
  beatDuration?: number;
}): ProduceSession {
  const { sessionName, bpm, templateId, layers, beatDuration } = opts;
  const tracks: ProduceTrack[] = [];
  let maxEnd = 0;

  if (beatDuration && beatDuration > 0) {
    tracks.push({
      name: 'beat',
      role: 'beat',
      startBar: 0,
      offsetSeconds: 0,
      duration: beatDuration,
      pan: null,
      gain: null,
      file: 'beat.wav',
    });
    maxEnd = Math.max(maxEnd, beatDuration);
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
    suite: 'produce',
    app: 'sprouts',
    version: 1,
    sessionName,
    bpm,
    barCount: Math.max(1, Math.ceil(secondsToBars(maxEnd, bpm))),
    templateId,
    createdAt: Date.now(),
    tracks,
  };
}

/** Serialize to the JSON sidecar that travels with the stems. */
export function produceSessionJson(session: ProduceSession): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Parse a Produce/Beet session on import. Validates the envelope and
 * returns null on anything that doesn't look like the contract.
 */
export function parseProduceSession(json: string): ProduceSession | null {
  try {
    const o = JSON.parse(json) as Partial<ProduceSession>;
    if (o.suite !== 'produce' || typeof o.bpm !== 'number' || !Array.isArray(o.tracks)) return null;
    return o as ProduceSession;
  } catch {
    return null;
  }
}
