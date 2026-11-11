import type { Slots, Track } from './store';
import { audioBufferToWav } from './audio/wav';

let ctx: AudioContext | null = null;
export function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

const cache = new Map<string, AudioBuffer>();
export async function decode(track: Pick<Track, 'id' | 'blob'>): Promise<AudioBuffer> {
  const hit = cache.get(track.id);
  if (hit) return hit;
  const buf = await getCtx().decodeAudioData(await track.blob.arrayBuffer());
  cache.set(track.id, buf);
  return buf;
}
export const forget = (id: string) => cache.delete(id);
export const forgetAll = () => cache.clear();

/** Seconds of near-silence before the first real sound (below about -48 dB). */
export function leadingSilence(buf: AudioBuffer, threshold = 0.004): number {
  let first = buf.length;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < first; i++) if (Math.abs(d[i]) > threshold) { first = i; break; }
  }
  return first >= buf.length ? 0 : first / buf.sampleRate;
}

export async function inspect(blob: Blob): Promise<{ duration: number; lead: number }> {
  const buf = await getCtx().decodeAudioData(await blob.arrayBuffer());
  return { duration: buf.duration, lead: leadingSilence(buf) };
}

/** Where a track ends on the shared timeline once it is nudged. */
export const endOf = (t: Pick<Track, 'offset' | 'duration'>) => Math.max(0, t.offset) + t.duration - Math.max(0, -t.offset);

/** Start a source `when` seconds from now, moved by `offset` (negative skips into the audio). */
export function startNudged(src: AudioBufferSourceNode, when: number, offset: number) {
  if (offset >= 0) src.start(when + offset);
  else src.start(when, -offset);
}

/** Live preview: all tracks start together; volume/pan can be changed while playing. */
export interface Player {
  stop(): void;
  update(slots: Slots): void;
  ended: Promise<void>;
}

export async function play(slots: Slots, skipSlot?: number): Promise<Player> {
  const c = getCtx();
  if (c.state === 'suspended') await c.resume();
  const nodes = new Map<string, { gain: GainNode; pan: StereoPannerNode }>();
  const sources: AudioBufferSourceNode[] = [];
  let resolveEnd!: () => void;
  const ended = new Promise<void>((r) => (resolveEnd = r));
  let remaining = 0;

  const items = slots
    .map((t, i) => ({ t, i }))
    .filter((x): x is { t: Track; i: number } => !!x.t && x.i !== skipSlot);
  const buffers = await Promise.all(items.map((x) => decode(x.t)));
  const startAt = c.currentTime + 0.05;

  items.forEach(({ t }, k) => {
    const src = c.createBufferSource();
    src.buffer = buffers[k];
    const gain = c.createGain();
    const pan = c.createStereoPanner();
    gain.gain.value = t.volume;
    pan.pan.value = t.pan;
    src.connect(gain).connect(pan).connect(c.destination);
    nodes.set(t.id, { gain, pan });
    remaining++;
    src.onended = () => { if (--remaining === 0) resolveEnd(); };
    startNudged(src, startAt, t.offset ?? 0);
    sources.push(src);
  });
  if (remaining === 0) resolveEnd();

  return {
    ended,
    stop: () => sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }),
    update: (next) => next.forEach((t) => {
      const n = t && nodes.get(t.id);
      if (n && t) { n.gain.gain.value = t.volume; n.pan.pan.value = t.pan; }
    }),
  };
}

/**
 * Mixdown: a plain sum of the tracks with their volume and pan. No EQ, no
 * compression, no limiting, no loudness processing. The only safety is a
 * gain reduction if the sum would clip.
 */
export async function mixdown(slots: Slots): Promise<Blob> {
  const tracks = slots.filter((t): t is Track => !!t);
  if (!tracks.length) throw new Error('Nothing to mix');
  const buffers = await Promise.all(tracks.map(decode));
  const sampleRate = 44100;
  const length = Math.ceil(Math.max(...tracks.map((t) => endOf({ offset: t.offset ?? 0, duration: t.duration }))) * sampleRate);
  const off = new OfflineAudioContext(2, length, sampleRate);
  tracks.forEach((t, i) => {
    const src = off.createBufferSource();
    src.buffer = buffers[i];
    const gain = off.createGain();
    gain.gain.value = t.volume;
    const pan = off.createStereoPanner();
    pan.pan.value = t.pan;
    src.connect(gain).connect(pan).connect(off.destination);
    startNudged(src, 0, t.offset ?? 0);
  });
  const out = await off.startRendering();
  let peak = 0;
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0.99) {
    const k = 0.99 / peak;
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return audioBufferToWav(out);
}
