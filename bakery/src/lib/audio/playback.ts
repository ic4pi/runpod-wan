/** Playback engine — routes output through an analyser so the halo dances. */
export class PlaybackEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private onEndedCb: (() => void) | null = null;
  playing = false;

  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* surfaced by play failure */
      }
    }
    return this.ctx;
  }

  async playBuffer(buffer: AudioBuffer, onEnded?: () => void): Promise<void> {
    const ctx = await this.ensureCtx();
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser!);
    // Guard: a stale source's onended must never clear a newer source's state.
    src.onended = () => {
      if (this.source !== src) return;
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
    const ctx = await this.ensureCtx();
    // Try the blob's own ctx first (audio/webm;codecs=opus etc.). If the
    // engine can't decode that container, route through mixVocalTake's
    // offline path instead — but WAV blobs from our own mixer decode fine.
    const arr = await blob.arrayBuffer();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(arr.slice(0));
    } catch (err) {
      // Second chance: ask the offline render engine to handle it (it shares
      // the decode context that already handles this type for mixdowns).
      const { decodeBlob } = await import('./render');
      buffer = await decodeBlob(blob).catch(() => {
        throw err; // surface the original failure if both paths fail
      });
    }
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

  async dispose(): Promise<void> {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.analyser = null;
  }
}

export const playback = new PlaybackEngine();
