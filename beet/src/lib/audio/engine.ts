/**
 * The studio — live capture engine.
 * Mic → light template chain (HPF + EQ + gentle comp) → headphones (monitor)
 * Raw mic → MediaRecorder (takes are captured dry; the full chain is
 * applied at mix time so a take can be re-mixed with any template).
 */
import { applyLevels, NEUTRAL_LEVELS, type GenreTemplate, type Levels } from '../templates';

export interface LiveLevels {
  analyser: AnalyserNode | null;
}

/** Build the light live chain shared by startMic / applyTemplate. */
function buildLiveChain(ctx: AudioContext, template: GenreTemplate, levels: Levels): { head: BiquadFilterNode; tail: DynamicsCompressorNode } {
  const v = applyLevels(template.voice, levels);
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = v.hpf;
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
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = v.comp.thresholdDb + 6; // gentler live
  comp.ratio.value = Math.max(1.5, v.comp.ratio * 0.5);
  comp.attack.value = v.comp.attack;
  comp.release.value = v.comp.release;
  node.connect(comp);
  return { head: hpf, tail: comp };
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chainIn: GainNode | null = null;
  private monitorGain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  mimeType = '';
  private wakeLock: { release: () => Promise<void> } | null = null;

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Start the mic with the light live version of a template chain. */
  async startMic(template: GenreTemplate, monitor: boolean, levels: Levels = NEUTRAL_LEVELS): Promise<void> {
    const ctx = this.ensureCtx();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: true, // bedroom cleanup, on by design
        autoGainControl: false, // our compressor does the leveling
        channelCount: 1,
      },
    });
    this.source = ctx.createMediaStreamSource(this.stream);

    const { head, tail } = buildLiveChain(ctx, template, levels);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;
    tail.connect(this.analyser);

    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = monitor ? 1 : 0;
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(ctx.destination);

    this.chainIn = ctx.createGain();
    this.source.connect(this.chainIn);
    this.chainIn.connect(head);
  }

  setMonitor(on: boolean): void {
    if (this.ctx && this.monitorGain) {
      this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
    }
  }

  /** Swap the live chain's template (rebuilds nodes, keeps the stream). */
  async applyTemplate(template: GenreTemplate, monitor: boolean, levels: Levels = NEUTRAL_LEVELS): Promise<void> {
    if (!this.stream) return;
    this.teardownChain();
    const ctx = this.ensureCtx();
    this.source = ctx.createMediaStreamSource(this.stream);

    const { head, tail } = buildLiveChain(ctx, template, levels);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;
    tail.connect(this.analyser);
    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = monitor ? 1 : 0;
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(ctx.destination);
    this.chainIn = ctx.createGain();
    this.source.connect(this.chainIn);
    this.chainIn.connect(head);
  }

  startRecording(): void {
    if (!this.stream) throw new Error('mic not started');
    this.chunks = [];
    const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', ''];
    this.mimeType = candidates.find((c) => c === '' || MediaRecorder.isTypeSupported(c)) ?? '';
    this.recorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(250);
    this.startedAt = performance.now();
    void this.acquireWakeLock();
  }

  /** Stop and return the dry take blob + duration. */
  stopRecording(): Promise<{ blob: Blob; duration: number; mimeType: string }> {
    const duration = (performance.now() - this.startedAt) / 1000;
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error('not recording'));
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || this.mimeType || 'audio/webm' });
        resolve({ blob, duration, mimeType: blob.type });
      };
      this.recorder.stop();
      void this.wakeLock?.release().catch(() => undefined);
      this.wakeLock = null;
    });
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock) this.wakeLock = await nav.wakeLock.request('screen');
    } catch {
      /* wake lock unavailable — non-fatal */
    }
  }

  /** Stop playback/monitor chain nodes but keep the mic stream alive. */
  private teardownChain(): void {
    try { this.source?.disconnect(); } catch { /* noop */ }
    try { this.chainIn?.disconnect(); } catch { /* noop */ }
    try { this.analyser?.disconnect(); } catch { /* noop */ }
    try { this.monitorGain?.disconnect(); } catch { /* noop */ }
  }

  /** Full teardown — mic released, context closed. */
  async dispose(): Promise<void> {
    this.teardownChain();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }
}

export const engine = new AudioEngine();
