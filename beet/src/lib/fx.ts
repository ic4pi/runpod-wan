import type { Track } from './session';

export interface FxBus { rev: GainNode; del: GainNode; setBpm(bpm: number): void }

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Shared reverb and delay that every track can send into. */
export function createFxBus(ctx: BaseAudioContext, out: AudioNode, bpm: number): FxBus {
  const rev = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 2.4, 2.2);
  const wet = ctx.createGain(); wet.gain.value = 5; // a convolver normalizes its own level, so lift it back up
  rev.connect(conv); conv.connect(wet); wet.connect(out);

  const del = ctx.createGain();
  const line = ctx.createDelay(2);
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  del.connect(line); line.connect(lp); lp.connect(fb); fb.connect(line); lp.connect(out);
  const setBpm = (b: number) => { line.delayTime.value = Math.min(1.9, (60 / b) * 0.75); }; // dotted eighth
  setBpm(bpm);
  return { rev, del, setBpm };
}

export interface Strip { input: GainNode; pan: StereoPannerNode; rev: GainNode; del: GainNode }

export function createStrip(ctx: BaseAudioContext, dest: AudioNode, bus: FxBus): Strip {
  const input = ctx.createGain(), pan = ctx.createStereoPanner(), rev = ctx.createGain(), del = ctx.createGain();
  input.connect(pan); pan.connect(dest);
  pan.connect(rev); rev.connect(bus.rev);
  pan.connect(del); del.connect(bus.del);
  return { input, pan, rev, del };
}

export function setStrip(s: Strip, t: Track, on: boolean) {
  s.input.gain.value = on ? t.volume : 0;
  s.pan.pan.value = t.pan;
  s.rev.gain.value = t.reverb * 0.7;
  s.del.gain.value = t.delay * 0.7;
}
