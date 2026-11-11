/**
 * The mix engineer. Analysis first (like a real tech listening to the room),
 * then a full offline chain render: clean-up → EQ → de-ess → compress →
 * saturate → space → glue → limit → normalize to the template ceiling.
 */
import { applyLevels, type BusChain, type GenreTemplate, type Levels, type VoiceChain } from '../templates';

export interface Analysis {
  peakDb: number;
  rmsDb: number;
  /** 0..1 energy share below 120 Hz — rumble detector */
  lowRatio: number;
  /** 0..1 energy share in the 5–10 kHz sibilance band */
  sibRatio: number;
  duration: number;
}

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-8));
const fromDb = (v: number) => Math.pow(10, v / 20);

/** Listen before touching anything: measure level, rumble, sibilance. */
export function analyzeBuffer(buf: AudioBuffer): Analysis {
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0;
  let sumSq = 0;
  // coarse band energies via simple one-pole filters on a decimated pass
  let lp = 0; // low-passed state (rumble)
  let hp = 0; // high-passed state (sibilance)
  let lpPrev = 0;
  let hpPrevIn = 0;
  let lowSq = 0;
  let sibSq = 0;
  const aLow = Math.exp(-2 * Math.PI * 120 / sr);
  const aHigh = Math.exp(-2 * Math.PI * 5000 / sr);
  const step = Math.max(1, Math.floor(sr / 16000)); // decimate for speed
  let count = 0;
  for (let i = 0; i < ch.length; i += step) {
    const x = ch[i];
    const ax = Math.abs(x);
    if (ax > peak) peak = ax;
    sumSq += x * x;
    lp = aLow * lpPrev + (1 - aLow) * x; lpPrev = lp;
    lowSq += lp * lp;
    hp = aHigh * (hp + x - hpPrevIn); hpPrevIn = x;
    sibSq += hp * hp;
    count++;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, count));
  const lowRms = Math.sqrt(lowSq / Math.max(1, count));
  const sibRms = Math.sqrt(sibSq / Math.max(1, count));
  return {
    peakDb: db(peak),
    rmsDb: db(rms),
    lowRatio: Math.min(1, (lowRms * lowRms) / Math.max(1e-10, sumSq / count)),
    sibRatio: Math.min(1, (sibRms * sibRms) / Math.max(1e-10, sumSq / count)),
    duration: buf.duration,
  };
}

function makeImpulse(ctx: BaseAudioContext, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * decay));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  return buf;
}

function makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = 1 + amount * 8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/** Full vocal chain on an OfflineAudioContext. */
function buildVoiceChain(
  ctx: OfflineAudioContext,
  input: AudioNode,
  v: VoiceChain,
  analysis: Analysis,
): AudioNode {
  // Gain-stage to a healthy -18 dBFS RMS before dynamics
  const stage = ctx.createGain();
  stage.gain.value = Math.min(4, Math.max(0.25, fromDb(-18 - analysis.rmsDb)));
  input.connect(stage);

  // Rumble cleanup — push HPF higher if the take is bottom-heavy
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = analysis.lowRatio > 0.35 ? Math.min(160, v.hpf * 1.4) : v.hpf;
  stage.connect(hpf);

  let node: AudioNode = hpf;
  for (const band of v.eq) {
    const f = ctx.createBiquadFilter();
    f.type = band.type;
    f.frequency.value = band.freq;
    f.gain.value = band.gainDb;
    f.Q.value = band.q;
    node.connect(f);
    node = f;
  }

  // De-ess: cut scaled by measured sibilance (more "sss" → deeper cut)
  if (v.deessDb < 0) {
    const ds = ctx.createBiquadFilter();
    ds.type = 'peaking';
    ds.frequency.value = v.deessFreq;
    ds.Q.value = 2.2;
    const scale = Math.min(1.6, 0.6 + analysis.sibRatio * 6);
    ds.gain.value = v.deessDb * scale;
    node.connect(ds);
    node = ds;
  }

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = v.comp.thresholdDb;
  comp.ratio.value = v.comp.ratio;
  comp.attack.value = v.comp.attack;
  comp.release.value = v.comp.release;
  comp.knee.value = 12;
  node.connect(comp);

  const makeup = ctx.createGain();
  makeup.gain.value = fromDb(v.makeupDb);
  comp.connect(makeup);

  let out: AudioNode = makeup;
  if (v.saturation > 0.02) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeSaturationCurve(v.saturation);
    shaper.oversample = '2x';
    makeup.connect(shaper);
    out = shaper;
  }

  if (v.presenceDb !== 0) {
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 12000;
    air.gain.value = v.presenceDb;
    out.connect(air);
    out = air;
  }

  // Space: convolver send blended with the dry signal
  if (v.reverb.mix > 0.01) {
    const dry = ctx.createGain();
    dry.gain.value = 1 - v.reverb.mix * 0.5;
    out.connect(dry);
    const wetGain = ctx.createGain();
    wetGain.gain.value = v.reverb.mix;
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, v.reverb.decay);
    out.connect(conv);
    conv.connect(wetGain);
    const merge = ctx.createGain();
    dry.connect(merge);
    wetGain.connect(merge);
    out = merge;
  }
  return out;
}

function buildBusChain(
  ctx: OfflineAudioContext,
  input: AudioNode,
  bus: BusChain,
  analysis: Analysis,
): AudioNode {
  // Auto trim: level the stem toward the bus target before compression
  const stage = ctx.createGain();
  const target = -16 + bus.trimDb;
  stage.gain.value = Math.min(3, Math.max(0.2, fromDb(target - analysis.rmsDb)));
  input.connect(stage);

  let node: AudioNode = stage;
  if (bus.hpf > 20) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = bus.hpf;
    node.connect(f);
    node = f;
  }
  if (bus.lpf < 19000) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = bus.lpf;
    node.connect(f);
    node = f;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = bus.compThresholdDb;
  comp.ratio.value = bus.compRatio;
  comp.attack.value = 0.012;
  comp.release.value = 0.2;
  comp.knee.value = 8;
  node.connect(comp);
  return comp;
}

function finishMaster(ctx: OfflineAudioContext, node: AudioNode, t: GenreTemplate): void {
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = t.master.glueThresholdDb;
  glue.ratio.value = t.master.glueRatio;
  glue.attack.value = 0.02;
  glue.release.value = 0.25;
  glue.knee.value = 10;
  node.connect(glue);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = t.master.limiterThresholdDb;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.knee.value = 0;
  glue.connect(limiter);
  limiter.connect(ctx.destination);
}

/** Normalize rendered buffer peak to the template ceiling. */
function normalizeTo(buf: AudioBuffer, ceilingDb: number): void {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  const target = fromDb(ceilingDb);
  if (peak > target || peak < target * 0.5) {
    const g = target / Math.max(peak, 1e-6);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
}

let decodeCtx: AudioContext | null = null;
function getDecodeCtx(): AudioContext {
  if (!decodeCtx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    decodeCtx = new AC();
  }
  return decodeCtx;
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getDecodeCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  const arr = await blob.arrayBuffer();
  return ctx.decodeAudioData(arr);
}

/** Mix a single vocal take with the full template chain. */
export async function mixVocalTake(blob: Blob, template: GenreTemplate, levels: Levels): Promise<{ buffer: AudioBuffer; analysis: Analysis }> {
  const decoded = await decodeBlob(blob);
  const analysis = analyzeBuffer(decoded);
  const sr = Math.min(48000, decoded.sampleRate);
  const offline = new OfflineAudioContext(2, Math.ceil(decoded.duration * sr), sr);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  const out = buildVoiceChain(offline, src, applyLevels(template.voice, levels), analysis);
  finishMaster(offline, out, template);
  src.start();
  const rendered = await offline.startRendering();
  normalizeTo(rendered, template.master.ceilingDb);
  return { buffer: rendered, analysis };
}

export interface StemInput {
  name: string;
  buffer: AudioBuffer;
  role: 'voice' | 'beat' | 'bass';
  /** seconds the stem is moved: + plays later, - plays earlier (skips into the audio) */
  offset?: number;
}

/** Full multi-stem mixdown through the template's buses + master. */
export async function mixStems(stems: StemInput[], template: GenreTemplate, levels: Levels): Promise<AudioBuffer> {
  const sr = 44100;
  const endOf = (s: StemInput) => Math.max(0, s.offset ?? 0) + s.buffer.duration - Math.max(0, -(s.offset ?? 0));
  const dur = Math.max(...stems.map(endOf));
  const offline = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const masterBus = offline.createGain();

  for (const stem of stems) {
    const src = offline.createBufferSource();
    src.buffer = stem.buffer;
    const analysis = analyzeBuffer(stem.buffer);
    let node: AudioNode;
    if (stem.role === 'voice') {
      node = buildVoiceChain(offline, src, applyLevels(template.voice, levels), analysis);
    } else {
      node = buildBusChain(offline, src, stem.role === 'bass' ? template.bass : template.beat, analysis);
    }
    node.connect(masterBus);
    const off = stem.offset ?? 0;
    if (off >= 0) src.start(off); else src.start(0, -off);
  }

  finishMaster(offline, masterBus, template);
  const rendered = await offline.startRendering();
  normalizeTo(rendered, template.master.ceilingDb);
  return rendered;
}
