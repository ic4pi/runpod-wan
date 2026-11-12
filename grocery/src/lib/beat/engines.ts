/**
 * Beet sound engines. Plain Web Audio, written so a note can be scheduled at an
 * exact time on ANY BaseAudioContext. The same code plays live and renders
 * offline for export, so stems line up exactly with what you heard.
 */
export type P = Record<string, number | string>;
export interface PlayOpts { pitch: number; vel: number; time: number; dur: number }
export interface Engine {
  id: string;
  name: string;
  kind: 'melodic' | 'drum';
  defaults: P;
  play(ctx: BaseAudioContext, out: AudioNode, o: PlayOpts, p: P): void;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const num = (p: P, k: string) => Number(p[k]);

/** ADSR on a param. Returns the time the voice can be stopped. */
function adsr(g: AudioParam, t: number, peak: number, a: number, d: number, s: number, r: number, dur: number): number {
  const hold = Math.max(dur, a + d);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.linearRampToValueAtTime(peak * s, t + a + d);
  g.setValueAtTime(peak * s, t + hold);
  g.setTargetAtTime(0, t + hold, Math.max(0.005, r / 3));
  return t + hold + r * 2 + 0.05;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

function noiseHit(ctx: BaseAudioContext, out: AudioNode, t: number, len: number, filter: BiquadFilterType, freq: number, level: number, q = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t); src.stop(t + len + 0.02);
}

// 1. Basic: warm single oscillator with an ADSR
const basic: Engine = {
  id: 'basic', name: 'Warm', kind: 'melodic',
  defaults: { wave: 'triangle', a: 0.005, d: 0.1, s: 0.3, r: 0.12 },
  play(ctx, out, o, p) {
    const osc = ctx.createOscillator(); osc.type = String(p.wave) as OscillatorType; osc.frequency.value = mtof(o.pitch);
    const g = ctx.createGain();
    const stop = adsr(g.gain, o.time, (o.vel / 127) * 0.35, num(p, 'a'), num(p, 'd'), num(p, 's'), num(p, 'r'), o.dur);
    osc.connect(g); g.connect(out); osc.start(o.time); osc.stop(stop);
  },
};

// 2. FM: bright, bell-like
const fm: Engine = {
  id: 'fm', name: 'FM Bell', kind: 'melodic',
  defaults: { ratio: 3, index: 6, a: 0.008, d: 0.25, s: 0.1, r: 0.2 },
  play(ctx, out, o, p) {
    const f = mtof(o.pitch);
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * num(p, 'ratio');
    const mg = ctx.createGain();
    const g = ctx.createGain();
    const depth = f * num(p, 'ratio') * num(p, 'index');
    const stop = adsr(g.gain, o.time, (o.vel / 127) * 0.3, num(p, 'a'), num(p, 'd'), num(p, 's'), num(p, 'r'), o.dur);
    adsr(mg.gain, o.time, depth, num(p, 'a'), num(p, 'd'), num(p, 's'), num(p, 'r'), o.dur);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(out);
    car.start(o.time); mod.start(o.time); car.stop(stop); mod.stop(stop);
  },
};

// 3. Analog: two detuned saws through a lowpass with a filter envelope, plus a sub
const analog: Engine = {
  id: 'analog', name: 'Analog', kind: 'melodic',
  defaults: { wave: 'sawtooth', detune: 8, cutoff: 1200, res: 4, fenv: 2500, fdecay: 0.25, sub: 0.3, a: 0.01, d: 0.2, s: 0.6, r: 0.15 },
  play(ctx, out, o, p) {
    const f = mtof(o.pitch);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = num(p, 'res');
    const cutoff = num(p, 'cutoff');
    filt.frequency.setValueAtTime(Math.min(18000, cutoff + num(p, 'fenv')), o.time);
    filt.frequency.setTargetAtTime(cutoff, o.time, Math.max(0.01, num(p, 'fdecay') / 3));
    const g = ctx.createGain();
    const stop = adsr(g.gain, o.time, (o.vel / 127) * 0.22, num(p, 'a'), num(p, 'd'), num(p, 's'), num(p, 'r'), o.dur);
    const voices: OscillatorNode[] = [];
    for (const dt of [-num(p, 'detune'), num(p, 'detune')]) {
      const osc = ctx.createOscillator(); osc.type = String(p.wave) as OscillatorType; osc.frequency.value = f; osc.detune.value = dt;
      osc.connect(filt); voices.push(osc);
    }
    if (num(p, 'sub') > 0) {
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2;
      const sg = ctx.createGain(); sg.gain.value = num(p, 'sub') * 1.4;
      sub.connect(sg); sg.connect(filt); voices.push(sub);
    }
    filt.connect(g); g.connect(out);
    voices.forEach((v) => { v.start(o.time); v.stop(stop); });
  },
};

// 4. Chiptune: hard square, tiny envelope
const chip: Engine = {
  id: 'chip', name: 'Chiptune', kind: 'melodic',
  defaults: { wave: 'square', a: 0.002, d: 0.06, s: 0.55, r: 0.04 },
  play(ctx, out, o, p) {
    const osc = ctx.createOscillator(); osc.type = String(p.wave) as OscillatorType; osc.frequency.value = mtof(o.pitch);
    const g = ctx.createGain();
    const stop = adsr(g.gain, o.time, (o.vel / 127) * 0.2, num(p, 'a'), num(p, 'd'), num(p, 's'), num(p, 'r'), o.dur);
    osc.connect(g); g.connect(out); osc.start(o.time); osc.stop(stop);
  },
};

// 5. Drums: kit voices on fixed notes
export const DRUMS: { pitch: number; name: string }[] = [
  { pitch: 49, name: 'Crash' },
  { pitch: 46, name: 'Open Hat' },
  { pitch: 42, name: 'Closed Hat' },
  { pitch: 45, name: 'Tom' },
  { pitch: 39, name: 'Clap' },
  { pitch: 38, name: 'Snare' },
  { pitch: 37, name: 'Rim' },
  { pitch: 36, name: 'Kick' },
];

const drums: Engine = {
  id: 'drums', name: 'Drum Kit', kind: 'drum',
  defaults: { tune: 1, decay: 1, level: 1 },
  play(ctx, out, o, p) {
    const t = o.time, tune = num(p, 'tune'), dec = num(p, 'decay'), v = (o.vel / 127) * num(p, 'level');
    const tone = (type: OscillatorType, f0: number, f1: number, sweep: number, len: number, level: number) => {
      const osc = ctx.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + sweep);
      const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + len + 0.02);
    };
    switch (o.pitch) {
      case 36: tone('sine', 150 * tune, 45 * tune, 0.12, 0.4 * dec, 0.95 * v); break;
      case 38: noiseHit(ctx, out, t, 0.2 * dec, 'highpass', 1800, 0.55 * v); tone('triangle', 190 * tune, 120 * tune, 0.06, 0.1 * dec, 0.5 * v); break;
      case 37: tone('square', 820 * tune, 700 * tune, 0.02, 0.04 * dec, 0.25 * v); break;
      case 39: for (const dt of [0, 0.012, 0.024]) noiseHit(ctx, out, t + dt, 0.05, 'bandpass', 1500, 0.5 * v, 1.2); noiseHit(ctx, out, t + 0.036, 0.16 * dec, 'bandpass', 1500, 0.45 * v, 1.2); break;
      case 42: noiseHit(ctx, out, t, 0.05 * dec, 'highpass', 7000, 0.35 * v); break;
      case 46: noiseHit(ctx, out, t, 0.32 * dec, 'highpass', 7000, 0.3 * v); break;
      case 45: tone('sine', 170 * tune, 85 * tune, 0.2, 0.3 * dec, 0.7 * v); break;
      case 49: noiseHit(ctx, out, t, 1.0 * dec, 'highpass', 5000, 0.3 * v); break;
      default: noiseHit(ctx, out, t, 0.08, 'highpass', 4000, 0.3 * v);
    }
  },
};

export const ENGINES: Engine[] = [basic, fm, analog, chip, drums];
export const getEngine = (id: string): Engine => ENGINES.find((e) => e.id === id) ?? basic;
