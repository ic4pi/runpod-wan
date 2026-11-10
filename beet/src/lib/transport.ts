import { audible, stepSeconds, totalSteps, type Session, type Track } from './session';
import { voiceOf } from './synth/presets';

interface Chain { g: GainNode; p: StereoPannerNode }

/** Live playback: a lookahead scheduler that loops the pattern. */
export class Transport {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private chains = new Map<string, Chain>();
  private timer: number | null = null;
  private nextTime = 0;
  private nextStep = 0;
  private marks: { time: number; step: number }[] = [];
  playing = false;

  private getSession: () => Session;

  constructor(getSession: () => Session) { this.getSession = getSession; }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.85;
      const lim = this.ctx.createDynamicsCompressor();
      lim.threshold.value = -4; lim.ratio.value = 12; lim.knee.value = 3; lim.attack.value = 0.003; lim.release.value = 0.1;
      this.master.connect(lim); lim.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private chain(t: Track): Chain {
    const ctx = this.ensure();
    let c = this.chains.get(t.id);
    if (!c) {
      c = { g: ctx.createGain(), p: ctx.createStereoPanner() };
      c.g.connect(c.p); c.p.connect(this.master);
      this.chains.set(t.id, c);
    }
    return c;
  }

  private syncMix(s: Session) {
    const on = new Set(audible(s).map((t) => t.id));
    for (const t of s.tracks) { const c = this.chain(t); c.g.gain.value = on.has(t.id) ? t.volume : 0; c.p.pan.value = t.pan; }
    for (const id of [...this.chains.keys()]) if (!s.tracks.some((t) => t.id === id)) { this.chains.get(id)!.p.disconnect(); this.chains.delete(id); }
  }

  /** Play one note now (keyboard, or tapping a cell). */
  preview(t: Track, pitch: number) {
    const ctx = this.ensure();
    this.syncMix(this.getSession());
    const { engine, params } = voiceOf(t.presetId);
    engine.play(ctx, this.chain(t).g, { pitch, vel: 100, time: ctx.currentTime + 0.01, dur: 0.25 }, params);
  }

  private tick = () => {
    const ctx = this.ctx; if (!ctx) return;
    const s = this.getSession();
    this.syncMix(s);
    const total = totalSteps(s), dur = stepSeconds(s.bpm);
    const on = audible(s);
    while (this.nextTime < ctx.currentTime + 0.12) {
      const step = this.nextStep % total;
      this.marks.push({ time: this.nextTime, step });
      if (this.marks.length > 64) this.marks.shift();
      for (const t of on) {
        const hits = t.notes.filter((n) => n.step === step);
        if (!hits.length) continue;
        const { engine, params } = voiceOf(t.presetId);
        const out = this.chain(t).g;
        for (const n of hits) engine.play(ctx, out, { pitch: n.pitch, vel: n.vel, time: this.nextTime, dur: n.len * dur }, params);
      }
      this.nextTime += dur;
      this.nextStep = (step + 1) % total;
    }
  };

  start() {
    const ctx = this.ensure();
    if (this.playing) return;
    this.nextTime = ctx.currentTime + 0.06; this.nextStep = 0; this.marks = [];
    this.playing = true;
    this.timer = window.setInterval(this.tick, 25);
    this.tick();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null; this.playing = false;
  }

  /** Fractional step under the playhead, or null when stopped. */
  position(): number | null {
    if (!this.ctx || !this.playing) return null;
    const now = this.ctx.currentTime;
    let m: { time: number; step: number } | undefined;
    for (const x of this.marks) if (x.time <= now) m = x;
    if (!m) return null;
    return m.step + (now - m.time) / stepSeconds(this.getSession().bpm);
  }
}
