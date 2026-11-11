import { getEngine, type P } from './engines';
import { STEPS_PER_BAR, type BeatPlan, type KitTemplate, type Note } from './patterns';
import type { Sound } from './sounds';

const SR = 44100;
const TAIL = 2;

export interface Choice { bass: Sound | null; pad: Sound | null; lead: Sound | null }

function reverb(ctx: BaseAudioContext, out: AudioNode): GainNode {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  const input = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = buf;
  const wet = ctx.createGain(); wet.gain.value = 5; // a convolver normalizes itself quiet; lift it back
  input.connect(conv); conv.connect(wet); wet.connect(out);
  return input;
}

/** Plays a whole plan into an offline context and returns the audio. */
export async function renderBeat(plan: BeatPlan, template: KitTemplate, choice: Choice): Promise<AudioBuffer> {
  const stepSec = 60 / plan.bpm / 4;
  const seconds = plan.bars * STEPS_PER_BAR * stepSec + TAIL;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const verb = reverb(ctx, ctx.destination);

  const strip = (gain: number, pan: number, send: number) => {
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const s = ctx.createGain(); s.gain.value = send;
    g.connect(p); p.connect(ctx.destination); p.connect(s); s.connect(verb);
    return g;
  };
  const play = (notes: Note[], out: AudioNode, engineId: string, params: Partial<P>, trim: number) => {
    const engine = getEngine(engineId);
    const merged = { ...engine.defaults, ...params } as P;
    for (const n of notes) engine.play(ctx, out, { pitch: n.pitch, vel: n.vel * trim, time: (n.step + (n.shift ?? 0)) * stepSec, dur: n.len * stepSec }, merged);
  };

  play(plan.drums, strip(0.9, 0, 0.04), 'drums', template.kit, 1);
  if (choice.bass) play(plan.bass, strip(0.8, 0, 0), choice.bass.engine, choice.bass.params, choice.bass.trim);
  if (choice.pad) play(plan.pad, strip(0.45, -0.15, 0.3), choice.pad.engine, choice.pad.params, choice.pad.trim);
  if (choice.lead) play(plan.lead, strip(0.55, 0.15, 0.3), choice.lead.engine, choice.lead.params, choice.lead.trim);

  const out = await ctx.startRendering();
  // only turn it down if it would clip
  let peak = 0;
  for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const ceil = Math.pow(10, -1 / 20);
  if (peak > ceil) { const k = ceil / peak; for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  return out;
}
