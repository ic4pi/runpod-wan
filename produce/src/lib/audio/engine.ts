/**
 * The studio — live capture engine.
 * Mic → light template chain (HPF + EQ + gentle comp) → headphones (monitor)
 * Raw mic → MediaRecorder (takes are captured dry; the full chain is
 * applied at mix time so a take can be re-mixed with any template).
 */
import { applyLevels, NEUTRAL_LEVELS, type GenreTemplate, type Levels } from '../templates';

type EngineEvent = 'recording-changed';
type Listener = () => void;

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
  private startedAt = 0;
  mimeType = '';
  private wakeLock: { release: () => Promise<void> } | null = null;
  private listeners = new Map<EngineEvent, Set<Listener>>();

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /** Event-based state — UI subscribes instead of polling. */
  on(event: EngineEvent, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  private emit(event: EngineEvent): void {
    this.listeners.get(event)?.forEach((fn) => fn());
  }

  /** iOS/Safari: resume is async — actually wait for it. */
  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* still suspended — caller surfaces the failure */
      }
    }
    return this.ctx;
  }

  private attachChain(ctx: AudioContext, template: GenreTemplate, monitor: boolean, levels: Levels): void {
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
    this.source!.connect(this.chainIn);
    this.chainIn.connect(head);
  }

  /** Start the mic with the light live version of a template chain. */
  async startMic(template: GenreTemplate, monitor: boolean, levels: Levels = NEUTRAL_LEVELS): Promise<void> {
    const ctx = await this.ensureCtx();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: true, // bedroom cleanup, on by design
        autoGainControl: false, // our compressor does the leveling
        channelCount: 1,
      },
    });
    // A MediaStream maps to exactly one source node per context — create once.
    this.source = ctx.createMediaStreamSource(this.stream);
    this.attachChain(ctx, template, monitor, levels);
  }

  setMonitor(on: boolean): void {
    if (this.ctx && this.monitorGain) {
      this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
    }
  }

  /** Swap the live chain's template (rebuilds nodes, keeps the stream + source). */
  async applyTemplate(template: GenreTemplate, monitor: boolean, levels: Levels = NEUTRAL_LEVELS): Promise<void> {
    if (!this.stream || !this.source) return;
    this.teardownChain();
    const ctx = await this.ensureCtx();
    this.attachChain(ctx, template, monitor, levels);
  }

  /** Per-take chunk buffer — a stale recorder can never write into a new take. */
  private takeChunks: Blob[] | null = null;

  /**
   * Guarded start — a second call while recording is a no-op instead of
   * silently orphaning the first recorder's chunks.
   */
  startRecording(): boolean {
    if (!this.stream) throw new Error('mic not started');
    if (this.recorder?.state === 'recording') return false;
    const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', ''];
    this.mimeType = candidates.find((c) => c === '' || MediaRecorder.isTypeSupported(c)) ?? '';
    this.recorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream);
    // Attach BEFORE start — with timeslice=250 the recorder emits chunks
    // throughout the take; a handler attached at stop would drop them all.
    this.takeChunks = [];
    const chunks = this.takeChunks;
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && this.takeChunks === chunks) chunks.push(e.data);
    };
    this.recorder.start(250);
    this.startedAt = performance.now();
    void this.acquireWakeLock();
    this.emit('recording-changed');
    return true;
  }

  /** Stop and return the dry take blob + duration. */
  stopRecording(): Promise<{ blob: Blob; duration: number; mimeType: string }> {
    const duration = (performance.now() - this.startedAt) / 1000;
    const recorder = this.recorder;
    return new Promise((resolve, reject) => {
      if (!recorder || recorder.state !== 'recording') return reject(new Error('not recording'));
      recorder.onstop = () => {
        const chunks = this.takeChunks ?? [];
        this.takeChunks = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || this.mimeType || 'audio/webm' });
        if (this.recorder === recorder) this.recorder = null;
        resolve({ blob, duration, mimeType: blob.type });
      };
      recorder.onerror = () => reject(new Error('recorder error'));
      recorder.stop();
      this.emit('recording-changed');
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

  // --- Backing playback while recording (record over your existing layers) ---
  private backingSource: AudioBufferSourceNode | null = null;
  private backingGain: GainNode | null = null;

  /** Play a backing mix into the monitor path while recording a new layer. */
  startBacking(buffer: AudioBuffer, volume = 0.9): void {
    if (!this.ctx || !this.monitorGain) return;
    this.stopBacking();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    // feed the same monitor gain the mic uses — the singer hears blend
    g.connect(this.monitorGain);
    src.start();
    this.backingSource = src;
    this.backingGain = g;
  }

  /**
   * Speaker mode — no headphones. The backing goes STRAIGHT to the speaker
   * (bypassing the muted monitor gain), turned way down. The mic never loops,
   * so no feedback; the singer hears the previous take quietly from the phone
   * speaker. Whatever little bleeds into the mic gets cancelled at mix time.
   */
  startBackingSpeaker(buffer: AudioBuffer, volume = 0.25): void {
    if (!this.ctx) return;
    this.stopBacking();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.ctx.destination); // speaker direct — monitor gain stays 0
    src.start();
    this.backingSource = src;
    this.backingGain = g;
    this.backingRef = buffer; // keep for bleed cancellation at mix time
    this.backingRefVolume = volume;
  }

  /** The backing buffer + volume used for speaker mode — render.ts subtracts it. */
  backingRef: AudioBuffer | null = null;
  backingRefVolume = 0;

  stopBacking(): void {
    if (this.backingSource) {
      try { this.backingSource.stop(); } catch { /* not started or already stopped */ }
      try { this.backingSource.disconnect(); } catch { /* noop */ }
      this.backingSource = null;
    }
    if (this.backingGain) {
      try { this.backingGain.disconnect(); } catch { /* noop */ }
      this.backingGain = null;
    }
  }

  /** Called once the take is safely captured — clears the speaker-mode reference. */
  clearBackingRef(): void {
    this.backingRef = null;
    this.backingRefVolume = 0;
  }

  get backingPlaying(): boolean {
    return this.backingSource !== null;
  }

  /** Stop chain nodes but keep the mic stream + source node alive. */
  private teardownChain(): void {
    try { this.chainIn?.disconnect(); } catch { /* noop */ }
    try { this.analyser?.disconnect(); } catch { /* noop */ }
    try { this.monitorGain?.disconnect(); } catch { /* noop */ }
    try { this.source?.disconnect(); } catch { /* noop */ }
  }

  /** Full teardown — mic released, context closed. */
  async dispose(): Promise<void> {
    if (this.recorder?.state === 'recording') {
      try { this.recorder.stop(); } catch { /* noop */ }
    }
    this.recorder = null;
    this.stopBacking();
    this.teardownChain();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.listeners.clear();
  }
}

export const engine = new AudioEngine();
