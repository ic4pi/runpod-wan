import { audioContext } from './audio';

/**
 * One shared analyser on the playback path. Every visualizer reads from it, so the
 * EQs move with the real recording while a preview plays and idle softly otherwise.
 */
let node: AnalyserNode | null = null;
let freq: Uint8Array<ArrayBuffer> | null = null;
let wave: Uint8Array<ArrayBuffer> | null = null;
let active = false;

export function playbackAnalyser(): AnalyserNode {
  if (!node) {
    const ctx = audioContext();
    node = ctx.createAnalyser();
    node.fftSize = 2048;
    node.smoothingTimeConstant = 0.78;
    node.connect(ctx.destination);
    freq = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
    wave = new Uint8Array(new ArrayBuffer(node.fftSize));
  }
  return node;
}

export const setAnalyserActive = (value: boolean) => { active = value; };
export const analyserActive = () => active && !!node;

/** Fills `out` (0..1) with `out.length` log-spaced bands. Returns false when nothing is playing. */
export function readBands(out: Float32Array): boolean {
  if (!node || !freq || !active) return false;
  node.getByteFrequencyData(freq);
  const bins = freq.length;
  const n = out.length;
  const lo = 2;
  const hi = Math.floor(bins * 0.72);
  for (let i = 0; i < n; i += 1) {
    const a = Math.floor(lo * Math.pow(hi / lo, i / n));
    const b = Math.max(a + 1, Math.floor(lo * Math.pow(hi / lo, (i + 1) / n)));
    let sum = 0;
    for (let j = a; j < b; j += 1) sum += freq[j];
    out[i] = Math.min(1, (sum / (b - a)) / 255 * (1 + i / n * 0.6));
  }
  return true;
}

/** Fills `out` (-1..1) with the current waveform. Returns false when nothing is playing. */
export function readWave(out: Float32Array): boolean {
  if (!node || !wave || !active) return false;
  node.getByteTimeDomainData(wave);
  const step = wave.length / out.length;
  for (let i = 0; i < out.length; i += 1) out[i] = (wave[Math.floor(i * step)] - 128) / 128;
  return true;
}

/** Deterministic ambient motion for when no audio is playing. */
export function idleBands(out: Float32Array, t: number, energy = 0.35) {
  for (let i = 0; i < out.length; i += 1) {
    const x = i / out.length;
    const v = Math.sin(t * 1.7 + i * 0.42) * 0.5 + Math.sin(t * 0.9 - i * 0.17) * 0.35 + Math.sin(t * 3.1 + i * 1.3) * 0.15;
    out[i] = Math.max(0.03, (0.5 + v * 0.5) * energy * (1 - x * 0.45));
  }
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
