/**
 * Bakery audio engine. One graph builder is used for live playback and for
 * offline rendering, so what you hear is what you export.
 *
 * Track:  source -> low shelf -> mid peak -> high shelf -> compressor -> gain -> pan -> master bus
 * Master: bus -> glue compressor -> makeup gain -> limiter -> out
 */
import { audioBufferToWav } from './audio/wav';

export interface BTrack {
  id: string;
  name: string;
  blob: Blob;
  duration: number;
  /** seconds from session start */
  offset: number;
  volume: number; // 0..1.5
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  eq: { low: number; mid: number; high: number }; // dB, -12..12
  comp: number; // 0..1 amount
}

export interface Master {
  glue: number; // 0..1
  loudness: number; // 0..1  (makeup into the limiter)
  ceilingDb: number; // -6..0
}

export const DEFAULT_MASTER: Master = { glue: 0.3, loudness: 0.3, ceilingDb: -1 };
export const SAMPLE_RATE = 44100;

export const isAudible = (t: BTrack, all: BTrack[]) =>
  !t.mute && (!all.some((x) => x.solo) || t.solo);

// ---- decode cache ---------------------------------------------------------
let live: AudioContext | null = null;
export function liveCtx(): AudioContext {
  if (!live) live = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return live;
}
const cache = new Map<string, AudioBuffer>();
export async function decode(t: Pick<BTrack, 'id' | 'blob'>): Promise<AudioBuffer> {
  const hit = cache.get(t.id);
  if (hit) return hit;
  const buf = await liveCtx().decodeAudioData(await t.blob.arrayBuffer());
  cache.set(t.id, buf);
  return buf;
}
export const forget = (id: string) => cache.delete(id);
export const forgetAll = () => cache.clear();

// ---- graph ----------------------------------------------------------------
interface TrackNodes {
  low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode;
  comp: DynamicsCompressorNode; gain: GainNode; pan: StereoPannerNode;
}
interface MasterNodes {
  bus: GainNode; glue: DynamicsCompressorNode; makeup: GainNode; limiter: DynamicsCompressorNode;
}

function buildTrack(ctx: BaseAudioContext, src: AudioNode, dest: AudioNode): TrackNodes {
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 120;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1500; mid.Q.value = 0.9;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 8000;
  const comp = ctx.createDynamicsCompressor(); comp.knee.value = 6; comp.attack.value = 0.01; comp.release.value = 0.2;
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  src.connect(low); low.connect(mid); mid.connect(high); high.connect(comp);
  comp.connect(gain); gain.connect(pan); pan.connect(dest);
  return { low, mid, high, comp, gain, pan };
}

function applyTrack(n: TrackNodes, t: BTrack, audible: boolean) {
  n.low.gain.value = t.eq.low;
  n.mid.gain.value = t.eq.mid;
  n.high.gain.value = t.eq.high;
  n.comp.threshold.value = -t.comp * 30; // 0 = off
  n.comp.ratio.value = 1 + t.comp * 7;
  n.gain.gain.value = audible ? t.volume : 0;
  n.pan.pan.value = t.pan;
}

function buildMaster(ctx: BaseAudioContext, dest: AudioNode): MasterNodes {
  const bus = ctx.createGain();
  const glue = ctx.createDynamicsCompressor(); glue.knee.value = 8; glue.attack.value = 0.03; glue.release.value = 0.25;
  const makeup = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor(); limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  bus.connect(glue); glue.connect(makeup); makeup.connect(limiter); limiter.connect(dest);
  return { bus, glue, makeup, limiter };
}

function applyMaster(n: MasterNodes, m: Master) {
  n.glue.threshold.value = -8 - m.glue * 14;
  n.glue.ratio.value = 1 + m.glue * 3;
  n.makeup.gain.value = Math.pow(10, (m.loudness * 9) / 20);
  n.limiter.threshold.value = m.ceilingDb - 2;
}

// ---- live playback --------------------------------------------------------
export interface Player {
  stop(): void;
  update(tracks: BTrack[], master: Master): void;
  ended: Promise<void>;
}

export async function play(tracks: BTrack[], master: Master): Promise<Player> {
  const ctx = liveCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  const mn = buildMaster(ctx, ctx.destination);
  applyMaster(mn, master);
  const buffers = await Promise.all(tracks.map(decode));
  const nodes = new Map<string, TrackNodes>();
  const sources: AudioBufferSourceNode[] = [];
  let remaining = 0;
  let done!: () => void;
  const ended = new Promise<void>((r) => (done = r));
  const t0 = ctx.currentTime + 0.05;

  tracks.forEach((t, i) => {
    const src = ctx.createBufferSource();
    src.buffer = buffers[i];
    const tn = buildTrack(ctx, src, mn.bus);
    applyTrack(tn, t, isAudible(t, tracks));
    nodes.set(t.id, tn);
    remaining++;
    src.onended = () => { if (--remaining === 0) done(); };
    src.start(t0 + t.offset);
    sources.push(src);
  });
  if (!remaining) done();

  return {
    ended,
    stop: () => sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }),
    update: (next, m) => {
      applyMaster(mn, m);
      next.forEach((t) => { const n = nodes.get(t.id); if (n) applyTrack(n, t, isAudible(t, next)); });
    },
  };
}

// ---- offline render -------------------------------------------------------
const lengthOf = (tracks: BTrack[]) =>
  Math.ceil(Math.max(0.1, ...tracks.map((t) => t.offset + t.duration)) * SAMPLE_RATE) + Math.round(0.3 * SAMPLE_RATE);

/** Full master (all audible tracks -> master chain), peak-trimmed to the ceiling. */
export async function renderMaster(tracks: BTrack[], master: Master): Promise<AudioBuffer> {
  const audible = tracks.filter((t) => isAudible(t, tracks));
  if (!audible.length) throw new Error('Nothing audible to render');
  const off = new OfflineAudioContext(2, lengthOf(audible), SAMPLE_RATE);
  const mn = buildMaster(off, off.destination);
  applyMaster(mn, master);
  for (const t of audible) {
    const src = off.createBufferSource();
    src.buffer = await decode(t);
    applyTrack(buildTrack(off, src, mn.bus), t, true);
    src.start(t.offset);
  }
  const out = await off.startRendering();
  trimToCeiling(out, master.ceilingDb);
  return out;
}

/** One track through its own chain only (no master), for stem bouncing. */
export async function renderStem(t: BTrack): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, lengthOf([t]), SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = await decode(t);
  applyTrack(buildTrack(off, src, off.destination), t, true);
  src.start(t.offset);
  return off.startRendering();
}

function trimToCeiling(buf: AudioBuffer, ceilingDb: number) {
  const ceil = Math.pow(10, ceilingDb / 20);
  const { peak } = measure(buf);
  if (peak <= ceil) return;
  const k = ceil / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

/** Peak and overall RMS. RMS is a rough loudness guide, not LUFS. */
export function measure(buf: AudioBuffer): { peak: number; peakDb: number; rmsDb: number } {
  let peak = 0, sum = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
    n += d.length;
  }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peak, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))) };
}

export const toWav = (buf: AudioBuffer) => audioBufferToWav(buf);
