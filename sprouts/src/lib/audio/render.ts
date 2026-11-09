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
function analyzeBuffer(buf: AudioBuffer): Analysis {
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

/**
 * Decode context — created lazily, resumed if suspended, and closed on page
 * unload so mobile browsers can reclaim the audio subsystem.
 */
let decodeCtx: AudioContext | null = null;
let unloadHooked = false;

function getDecodeCtx(): AudioContext {
  if (!decodeCtx || decodeCtx.state === 'closed') {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    decodeCtx = new AC();
    if (!unloadHooked) {
      unloadHooked = true;
      window.addEventListener('pagehide', () => void disposeDecodeCtx());
    }
  }
  return decodeCtx;
}

export async function disposeDecodeCtx(): Promise<void> {
  if (decodeCtx && decodeCtx.state !== 'closed') {
    await decodeCtx.close().catch(() => undefined);
  }
  decodeCtx = null;
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getDecodeCtx();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* decode still works on a suspended ctx in most engines */
    }
  }
  const arr = await blob.arrayBuffer();
  return ctx.decodeAudioData(arr);
}

/**
 * Bleed cancellation — speaker-mode cleanup. When a take was recorded with
 * the backing playing quietly through the phone speaker, a little of it
 * bleeds into the mic. We find the delay by cross-correlation (the speaker
 * is a few ms from the mic), then subtract the level-matched backing. The
 * speaker backing is already turned down ~12dB, so what's left to remove is
 * small — but removing it keeps a layered stack from building ghosts.
 */
export function cancelBleed(take: AudioBuffer, backing: AudioBuffer): AudioBuffer {
  const sr = take.sampleRate;
  const t = take.getChannelData(0);
  const b = backing.getChannelData(0);
  const bStep = backing.sampleRate / sr;

  const out = new AudioBuffer({ length: take.length, numberOfChannels: 1, sampleRate: sr });
  const o = out.getChannelData(0);
  o.set(t);

  // 1. ENVELOPE correlation for delay — raw-sample correlation is unstable
  //    (periodic content beats itself at wrong lags). RMS in 1ms windows
  //    tracks the *shape* of the bleed and locks onto the true delay.
  const win = Math.max(16, Math.floor(sr * 0.001));
  const maxLag = Math.floor(sr * 0.06);
  const probeLen = Math.min(t.length, Math.floor(sr * 2));

  const env = (src: Float32Array): Float32Array => {
    const n = Math.floor(probeLen / win);
    const e = new Float32Array(n);
    for (let w = 0; w < n; w++) {
      let sum = 0;
      const start = w * win;
      for (let i = start; i < start + win; i += 4) sum += src[i] * src[i];
      e[w] = Math.sqrt(sum / (win / 4));
    }
    return e;
  };
  const tEnv = env(t);
  // backing envelope at the take's sample rate so lags line up
  const bResampled = new Float32Array(Math.floor(b.length / bStep));
  for (let i = 0; i < bResampled.length; i++) bResampled[i] = b[Math.floor(i * bStep)];
  const bEnv = env(bResampled);

  const maxLagW = Math.floor(maxLag / win);
  let bestLagW = 0;
  let bestCorr = -Infinity;
  for (let lag = 0; lag < maxLagW; lag++) {
    let corr = 0;
    const lim = Math.min(tEnv.length, bEnv.length + lag);
    for (let w = lag; w < lim; w++) corr += tEnv[w] * bEnv[w - lag];
    if (corr > bestCorr) { bestCorr = corr; bestLagW = lag; }
  }
  const bestLag = bestLagW * win;

  if (bestCorr <= 1e-8) return out; // no bleed found — nothing to cancel

  // 2. Estimate the bleed gain at that delay
  let num = 0;
  let den = 0;
  for (let i = bestLag; i < t.length; i += 4) {
    const bi = Math.floor((i - bestLag) * bStep);
    if (bi >= b.length) break;
    num += t[i] * b[bi];
    den += b[bi] * b[bi];
  }
  const bleedGain = den > 1e-9 ? Math.min(1, num / den) : 0;

  // 3. Subtract, conservatively (85% — full subtraction risks phase artifacts
  //    on real rooms; what's left sits 20+dB under the vocal)
  const k = bleedGain * 0.85;
  for (let i = bestLag; i < o.length; i++) {
    const bi = Math.floor((i - bestLag) * bStep);
    if (bi >= b.length) break;
    o[i] -= b[bi] * k;
  }
  return out;
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
}

export interface LayerInput {
  buffer: AudioBuffer;
  role: 'lead' | 'double' | 'backup' | 'adlib';
  /** explicit pan/gain override; when null the smart defaults below apply */
  pan: number | null;
  gain: number | null;
  /** optional FX insert id (telephone, megaphone, …); 'none'/undefined = clean */
  fx?: string;
}

/**
 * Automatic double-tracking (ADT) — manufactures a second "performance" from
 * one take, the way Abbey Road did it with tape varispeed in the '60s:
 * a slightly detuned, slightly delayed clone. Because pitch and timing drift
 * constantly, the clone can't be a perfect copy, so it widens instead of
 * phasing. This is the classic doubler-plugin trick, done with plain DSP —
 * no AI fingerprint, no artifacts of generative models.
 */
export function makeDouble(source: AudioBuffer, opts: { cents: number; delayMs: number }): AudioBuffer {
  const sr = source.sampleRate;
  const ratio = Math.pow(2, opts.cents / 1200);
  const delaySamples = Math.floor((opts.delayMs / 1000) * sr);
  const outLen = source.length + delaySamples + Math.floor(sr * 0.05);
  const out = new AudioBuffer({ length: outLen, numberOfChannels: 1, sampleRate: sr });
  const d = out.getChannelData(0);
  const s = source.getChannelData(0);

  // Resample by `ratio` with linear interp: cents>0 plays faster→higher pitch.
  // Delay shifts the whole clone late so transients don't line up.
  for (let i = 0; i < outLen; i++) {
    const srcPos = (i - delaySamples) * ratio;
    if (srcPos < 0 || srcPos >= s.length - 1) continue;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    d[i] = s[i0] * (1 - frac) + s[i0 + 1] * frac;
  }

  // Gentle 8ms fade-out so a resample-clipped tail never clicks
  const fade = Math.min(Math.floor(sr * 0.008), outLen);
  for (let i = 0; i < fade; i++) {
    d[outLen - 1 - i] *= i / fade;
  }
  return out;
}

/**
 * Smart stack placement — how an engineer pans a vocal stack by hand:
 * lead dead center, doubles flared L/R, extra doubles wider, ad-libs
 * scattered further out and tucked lower. Ad-libs also get a touch of
 * extra HPF + a darker top so they sit *behind* the lead.
 */
export function layerDefaults(index: { role: LayerInput['role']; roleIndex: number }): { pan: number; gain: number } {
  const { role, roleIndex } = index;
  if (role === 'lead') return { pan: 0, gain: 1 };
  if (role === 'double') {
    // 1st pair: ±0.6 · 2nd: ∓0.85 · alternate sides, slightly lower each time
    const side = roleIndex % 2 === 0 ? 1 : -1;
    const spread = roleIndex < 2 ? 0.6 : 0.85;
    return { pan: side * spread, gain: Math.max(0.55, 0.8 - Math.floor(roleIndex / 2) * 0.1) };
  }
  if (role === 'backup') {
    // BVs sit inside the doubles' field: mid-width alternating, tucked well under
    const side = roleIndex % 2 === 0 ? -1 : 1;
    return { pan: side * 0.5, gain: 0.7 };
  }
  // ad-libs: wide alternating, tucked down
  const side = roleIndex % 2 === 0 ? -1 : 1;
  return { pan: side * 0.75, gain: 0.6 };
}

/** Mix a vocal stack: every layer through the voice chain, placed by role, summed to master. */
export async function mixLayers(layers: LayerInput[], template: GenreTemplate, levels: Levels): Promise<AudioBuffer> {
  const sr = 44100;
  const dur = Math.max(...layers.map((l) => l.buffer.duration));
  const offline = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const masterBus = offline.createGain();

  const roleCounters: Record<string, number> = { lead: 0, double: 0, backup: 0, adlib: 0 };

  for (const layer of layers) {
    const roleIndex = roleCounters[layer.role]++;
    const def = layerDefaults({ role: layer.role, roleIndex });
    const pan = layer.pan ?? def.pan;
    const gain = layer.gain ?? def.gain;

    const src = offline.createBufferSource();
    src.buffer = layer.buffer;
    const analysis = analyzeBuffer(layer.buffer);

    let chain = template.voice;
    if (layer.role === 'adlib') {
      // ad-lib treatment: brighter HPF, darker top, a bit more space
      chain = {
        ...template.voice,
        hpf: Math.min(200, template.voice.hpf * 1.6),
        eq: template.voice.eq.map((b) =>
          b.type === 'highshelf' ? { ...b, gainDb: b.gainDb - 2.5 } : b,
        ),
        reverb: { ...template.voice.reverb, mix: Math.min(0.5, template.voice.reverb.mix * 1.3) },
      };
    } else if (layer.role === 'backup') {
      // BV treatment: behind the lead — thinner lows, darker top, wetter, tighter compression
      chain = {
        ...template.voice,
        hpf: Math.min(200, template.voice.hpf * 1.4),
        eq: template.voice.eq.map((b) =>
          b.type === 'highshelf' ? { ...b, gainDb: b.gainDb - 2 } : b,
        ),
        presenceDb: template.voice.presenceDb * 0.6,
        saturation: template.voice.saturation * 0.6,
        reverb: { ...template.voice.reverb, mix: Math.min(0.5, template.voice.reverb.mix * 1.25) },
        comp: { ...template.voice.comp, thresholdDb: template.voice.comp.thresholdDb - 2 },
      };
    } else if (layer.role === 'double') {
      // doubles get slightly less presence so they widen without fighting the lead
      chain = { ...template.voice, presenceDb: template.voice.presenceDb * 0.7 };
    }

    let out = buildVoiceChain(offline, src, applyLevels(chain, levels), analysis);

    // per-layer FX insert (telephone, megaphone…) — after the template chain
    if (layer.fx && layer.fx !== 'none') {
      const { buildFxChain } = await import('./fx');
      out = buildFxChain(offline, out, layer.fx);
    }

    const g = offline.createGain();
    g.gain.value = gain;
    out.connect(g);

    const panner = offline.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(panner);
    panner.connect(masterBus);
    src.start();
  }

  finishMaster(offline, masterBus, template);
  const rendered = await offline.startRendering();
  normalizeTo(rendered, template.master.ceilingDb);
  return rendered;
}

/**
 * Sidechain ducking — the vocal envelope carved into the beat, in place.
 * Web Audio's DynamicsCompressorNode has no sidechain port, so we do it the
 * way an engineer's automation lane would: measure the vocal's RMS envelope,
 * smooth it with a fast attack / slow release, and ride the beat's gain
 * down while the vocal is up. Depth scales with the Punch fader.
 */
function sidechainDuck(target: AudioBuffer, vocal: AudioBuffer, amount: number): void {
  if (amount <= 0.01) return;
  const sr = target.sampleRate;
  const v = vocal.getChannelData(0);
  const vSr = vocal.sampleRate;
  const len = Math.min(target.length, Math.floor((v.length / vSr) * sr));

  // 1. RMS envelope of the vocal at ~5ms hops
  const hop = Math.max(64, Math.floor(sr * 0.005));
  const vStep = vSr / sr; // resample factor if rates differ
  const nWin = Math.ceil(len / hop);
  const env = new Float32Array(nWin);
  let envPeak = 0;
  for (let w = 0; w < nWin; w++) {
    const start = Math.floor(w * hop * vStep);
    const end = Math.min(v.length, start + Math.floor(hop * vStep));
    let sum = 0;
    for (let i = start; i < end; i += 4) sum += v[i] * v[i];
    const rms = Math.sqrt(sum / Math.max(1, (end - start) / 4));
    env[w] = rms;
    if (rms > envPeak) envPeak = rms;
  }
  if (envPeak < 1e-5) return;

  // 2. Normalize + attack/release smoothing (fast down, musical recovery)
  const atk = 1 - Math.exp(-hop / (sr * 0.004));   // ~4ms grab
  const rel = 1 - Math.exp(-hop / (sr * 0.25));    // ~250ms recover
  let g = 1;
  const gainCurve = new Float32Array(nWin);
  for (let w = 0; w < nWin; w++) {
    const duck = Math.min(1, env[w] / (envPeak * 0.5)); // duck hard at -6dB below vocal peak
    const targetGain = 1 - amount * duck;
    const k = targetGain < g ? atk : rel;
    g += (targetGain - g) * k;
    gainCurve[w] = g;
  }

  // 3. Apply per-sample with linear interp between windows
  for (let c = 0; c < target.numberOfChannels; c++) {
    const d = target.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const pos = i / hop;
      const w0 = Math.floor(pos);
      const w1 = Math.min(nWin - 1, w0 + 1);
      const frac = pos - w0;
      d[i] *= gainCurve[w0] * (1 - frac) + gainCurve[w1] * frac;
    }
  }
}

/** Full multi-stem mixdown through the template's buses + master. */
export async function mixStems(stems: StemInput[], template: GenreTemplate, levels: Levels): Promise<AudioBuffer> {
  const sr = 44100;
  const dur = Math.max(...stems.map((s) => s.buffer.duration));
  const offline = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const masterBus = offline.createGain();

  // Sidechain: when a vocal and a beat/bass coexist, the music ducks under the voice.
  // Punch fader steers depth: neutral ≈ 4 dB, max ≈ 9 dB, pulled back ≈ 1.5 dB.
  const vocal = stems.find((s) => s.role === 'voice');
  const duckDepthDb = 4 * levels.punch;
  const duckAmount = Math.min(0.65, 1 - fromDb(-duckDepthDb));

  for (const stem of stems) {
    // duck in place on a copy so the caller's buffers stay pristine
    let buffer = stem.buffer;
    if (vocal && stem.role !== 'voice' && duckAmount > 0.01) {
      const copy = new AudioBuffer({ length: stem.buffer.length, numberOfChannels: stem.buffer.numberOfChannels, sampleRate: stem.buffer.sampleRate });
      for (let c = 0; c < copy.numberOfChannels; c++) {
        copy.getChannelData(c).set(stem.buffer.getChannelData(c));
      }
      sidechainDuck(copy, vocal.buffer, duckAmount);
      buffer = copy;
    }

    const src = offline.createBufferSource();
    src.buffer = buffer;
    const analysis = analyzeBuffer(buffer);
    let node: AudioNode;
    if (stem.role === 'voice') {
      node = buildVoiceChain(offline, src, applyLevels(template.voice, levels), analysis);
    } else {
      node = buildBusChain(offline, src, stem.role === 'bass' ? template.bass : template.beat, analysis);
    }
    node.connect(masterBus);
    src.start();
  }

  finishMaster(offline, masterBus, template);
  const rendered = await offline.startRendering();
  normalizeTo(rendered, template.master.ceilingDb);
  return rendered;
}
