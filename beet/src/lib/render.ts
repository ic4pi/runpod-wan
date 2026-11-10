import JSZip from 'jszip';
import { audioBufferToWav } from './audio/wav';
import { audible, stepSeconds, totalSteps, type Session, type Track } from './session';
import { getPreset, voiceOf } from './synth/presets';

const SR = 44100;
const TAIL = 1.5;

function schedule(ctx: BaseAudioContext, out: AudioNode, t: Track, s: Session) {
  const { engine, params } = voiceOf(t.presetId);
  const dur = stepSeconds(s.bpm), total = totalSteps(s);
  for (const n of t.notes) {
    if (n.step >= total) continue;
    engine.play(ctx, out, { pitch: n.pitch, vel: n.vel, time: n.step * dur, dur: n.len * dur }, params);
  }
}

function offline(s: Session) {
  return new OfflineAudioContext(2, Math.ceil((totalSteps(s) * stepSeconds(s.bpm) + TAIL) * SR), SR);
}

function strip(ctx: BaseAudioContext, t: Track, dest: AudioNode, s: Session) {
  const g = ctx.createGain(); g.gain.value = t.volume;
  const p = ctx.createStereoPanner(); p.pan.value = t.pan;
  g.connect(p); p.connect(dest);
  schedule(ctx, g, t, s);
}

function trimTo(buf: AudioBuffer, db: number) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
  const ceil = Math.pow(10, db / 20);
  if (peak > ceil) { const k = ceil / peak; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
}

/** The whole song, audible tracks summed. Only reduces level if it would clip. */
export async function renderMix(s: Session): Promise<AudioBuffer> {
  const on = audible(s);
  if (!on.length || !on.some((t) => t.notes.length)) throw new Error('Nothing to export. Add some notes first.');
  const ctx = offline(s);
  for (const t of on) strip(ctx, t, ctx.destination, s);
  const out = await ctx.startRendering();
  trimTo(out, -1);
  return out;
}

/** One track with its volume and pan baked in. Starts at bar 1 so every stem lines up. */
export async function renderStem(s: Session, t: Track): Promise<AudioBuffer> {
  const ctx = offline(s);
  strip(ctx, t, ctx.destination, s);
  const out = await ctx.startRendering();
  trimTo(out, -0.5);
  return out;
}

const safe = (n: string) => n.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-') || 'track';

/** Produce session bundle: stems/*.wav + session.json. Bakery and the Produce apps import this. */
export async function exportBundle(s: Session, sessionName = 'Beet session'): Promise<Blob> {
  const on = audible(s).filter((t) => t.notes.length);
  if (!on.length) throw new Error('Nothing to export. Add some notes first.');
  const zip = new JSZip();
  const used = new Map<string, number>();
  const tracks = [];
  const duration = totalSteps(s) * stepSeconds(s.bpm) + TAIL;
  for (const t of on) {
    const base = safe(t.name), n = (used.get(base) ?? 0) + 1; used.set(base, n);
    const file = `${base}${n > 1 ? `-${n}` : ''}.wav`;
    zip.file(`stems/${file}`, audioBufferToWav(await renderStem(s, t)));
    tracks.push({
      name: t.name, role: getPreset(t.presetId).category === 'bass' ? 'bass' : 'beat',
      startBar: 0, offsetSeconds: 0, duration, pan: null, gain: null, file,
    });
  }
  zip.file('session.json', JSON.stringify({
    suite: 'produce', app: 'beet', version: 1, sessionName, bpm: s.bpm, barCount: s.bars, templateId: '', createdAt: Date.now(), tracks,
  }, null, 2));
  zip.file('README.txt', `BEET SESSION (Produce suite)\nBPM ${s.bpm}, ${s.bars} bars. Stems are 44.1 kHz / 16-bit / stereo WAV, all starting at bar 1.\nImport this zip into Bakery or any Produce app.\n`);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export const mixToWav = (b: AudioBuffer) => audioBufferToWav(b);
