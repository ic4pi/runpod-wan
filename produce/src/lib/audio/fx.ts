/**
 * Sprouts FX — classic vocal effects, rendered as a post-chain insert.
 * Each is a small DSP preset (EQ + filter + optional modulation), no AI.
 * Applied per-layer on top of the template chain, so a user can put a
 * telephone ad-lib under a clean lead.
 */
export interface FxDef {
  id: string;
  name: string;
  short: string;
  blurb: string;
}

export const FX_LIST: FxDef[] = [
  { id: 'none', name: 'Clean', short: 'CLN', blurb: 'Just the template chain — no extra effect.' },
  { id: 'telephone', name: 'Telephone', short: 'TEL', blurb: 'Narrow band, no lows or highs — like a phone call.' },
  { id: 'megaphone', name: 'Megaphone', short: 'MEG', blurb: 'Mid-forward, crunchy, a little distorted.' },
  { id: 'robot', name: 'Robot', short: 'RBT', blurb: 'Hard pitch-quantize feel via fast ring-mod shimmer.' },
  { id: 'whisper', name: 'Whisper', short: 'WSP', blurb: 'Airy, bright, pulled back — breathy and close.' },
  { id: 'hall', name: 'Big Hall', short: 'HAL', blurb: 'Long lush reverb — arena tail.' },
  { id: 'radio', name: 'Old Radio', short: 'RAD', blurb: 'Lo-fi crackle box — rolled off everything.' },
  { id: 'chorus', name: 'Chorus', short: 'CHR', blurb: 'Slight detune shimmer — 80s width.' },
];

export function getFx(id: string | null | undefined): FxDef {
  return FX_LIST.find((f) => f.id === id) ?? FX_LIST[0];
}

function makeImpulse(ctx: OfflineAudioContext, decay: number): AudioBuffer {
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

function makeSatCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = 1 + amount * 8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/**
 * Insert an FX chain between `input` and the return node, on an
 * OfflineAudioContext. 'none' passes through untouched.
 */
export function buildFxChain(ctx: OfflineAudioContext, input: AudioNode, fxId: string): AudioNode {
  const bp = (type: BiquadFilterType, freq: number, gainDb = 0, q = 1): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.gain.value = gainDb;
    f.Q.value = q;
    return f;
  };
  const g = (v: number): GainNode => {
    const gn = ctx.createGain();
    gn.gain.value = v;
    return gn;
  };

  switch (fxId) {
    case 'telephone': {
      // band-limit 300–3400, squash, slight grit
      const hp = bp('highpass', 300, 0, 0.7);
      const lp = bp('lowpass', 3400, 0, 0.7);
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeSatCurve(0.15);
      input.connect(hp); hp.connect(lp); lp.connect(shaper);
      return shaper;
    }
    case 'megaphone': {
      const hp = bp('highpass', 500, 0, 0.7);
      const lp = bp('lowpass', 4000, 0, 0.7);
      const mid = bp('peaking', 1200, 6, 1.2);
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeSatCurve(0.5);
      input.connect(hp); hp.connect(lp); lp.connect(mid); mid.connect(shaper);
      return shaper;
    }
    case 'robot': {
      // ring-mod at 55Hz for metallic shimmer + slight hp
      const rm = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.frequency.value = 55;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.6;
      osc.connect(oscGain);
      oscGain.connect(rm.gain);
      const hp = bp('highpass', 250);
      input.connect(rm); rm.connect(hp);
      osc.start();
      return hp;
    }
    case 'whisper': {
      // pull lows out, boost air, drop level
      const hp = bp('highpass', 400);
      const air = bp('highshelf', 8000, 5);
      const vol = g(0.7);
      input.connect(hp); hp.connect(air); air.connect(vol);
      return vol;
    }
    case 'hall': {
      // big wet convolver blended with dry
      const dry = g(0.6);
      const wet = g(0.55);
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, 2.8);
      const merge = g(1);
      input.connect(dry); dry.connect(merge);
      input.connect(conv); conv.connect(wet); wet.connect(merge);
      return merge;
    }
    case 'radio': {
      const hp = bp('highpass', 400, 0, 0.8);
      const lp = bp('lowpass', 3000, 0, 0.8);
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeSatCurve(0.25);
      const vol = g(0.85);
      input.connect(hp); hp.connect(lp); lp.connect(shaper); shaper.connect(vol);
      return vol;
    }
    case 'chorus': {
      // two detuned LFO'd delays blended under the dry signal
      const dry = g(0.9);
      const merge = g(1);
      input.connect(dry); dry.connect(merge);
      for (const [rate, depth, time] of [[0.8, 0.004, 0.018], [1.1, 0.005, 0.027]] as const) {
        const delay = ctx.createDelay(0.1);
        delay.delayTime.value = time;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = depth;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        const wetG = g(0.25);
        input.connect(delay); delay.connect(wetG); wetG.connect(merge);
        lfo.start();
      }
      return merge;
    }
    default:
      return input;
  }
}
