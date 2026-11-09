/** Playback engine — routes output through an analyser so the halo dances. */
export class PlaybackEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private onEndedCb: (() => void) | null = null;
  playing = false;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  async playBuffer(buffer: AudioBuffer, onEnded?: () => void): Promise<void> {
    const ctx = this.ensureCtx();
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser!);
    src.onended = () => {
      this.playing = false;
      this.source = null;
      this.onEndedCb?.();
    };
    this.onEndedCb = onEnded ?? null;
    this.source = src;
    this.playing = true;
    src.start();
  }

  async playBlob(blob: Blob, onEnded?: () => void): Promise<void> {
    const ctx = this.ensureCtx();
    const arr = await blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr);
    await this.playBuffer(buffer, onEnded);
  }

  stop(): void {
    if (this.source) {
      const src = this.source;
      this.source = null;
      this.onEndedCb = null;
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
    }
    this.playing = false;
  }
}

export const playback = new PlaybackEngine();
