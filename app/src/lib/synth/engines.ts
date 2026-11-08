/**
 * Synth Engine Implementations
 *
 * 5 concrete synth engines with distinct sonic characteristics:
 * 1. ToneBasicSynth - Warm polyphonic synth (ADSR envelope)
 * 2. ToneWavetableSynth - Bright FM synth (FM synthesis)
 * 3. CustomOscSynth - Analog-style oscillator (sawtooth + lowpass)
 * 4. ChiptuneSynth - 8-bit retro sound (square wave, fast envelope)
 * 5. NoisePercSynth - Percussion/noise (noise + highpass filter)
 */

import * as Tone from 'tone';
import type { Synth, SynthEngine } from './types';

/**
 * ToneBasicSynth - Warm polyphonic synthesizer
 * Uses Tone.js PolySynth with ADSR envelope for warm, humanized sound
 */
export class ToneBasicSynth implements SynthEngine {
  id = 'tone-basic';
  name = 'Tone Basic (Warm)';

  private synth: Tone.PolySynth | null = null;

  init(ctx: AudioContext): Synth {
    // Set Tone.js to use the provided AudioContext
    if (ctx !== Tone.getContext().rawContext) {
      Tone.setContext(new Tone.Context(ctx));
    }

    // Create polyphonic synth with ADSR envelope
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.005, // 5ms - quick attack for articulation
        decay: 0.1, // 100ms - moderate decay
        sustain: 0.3, // 30% sustain level
        release: 0.1, // 100ms - moderate release
      },
    }).toDestination();

    // Return Synth interface implementation
    return this.createSynthInstance();
  }

  ready(): boolean {
    return this.synth !== null;
  }

  private createSynthInstance(): Synth {
    const synth = this.synth;
    if (!synth) throw new Error('Synth not initialized');

    return {
      triggerNote: (pitch: number, velocity: number, duration: number) => {
        const freq = Tone.Midi(pitch).toFrequency();
        const vel = Math.max(0, Math.min(1, velocity / 127));
        synth.triggerAttackRelease(freq, duration, undefined, vel);
      },

      release: (pitch: number) => {
        // Tone.js PolySynth handles release via triggerRelease
        const freq = Tone.Midi(pitch).toFrequency();
        synth.triggerRelease(freq);
      },

      dispose: () => {
        synth.dispose();
      },
    };
  }
}

/**
 * ToneWavetableSynth - Bright FM synthesizer
 * Uses Tone.js PolySynth with FMSynth for bright, bell-like sound
 */
export class ToneWavetableSynth implements SynthEngine {
  id = 'tone-wavetable';
  name = 'Tone Wavetable (Bright/FM)';

  private synth: Tone.PolySynth | null = null;

  init(ctx: AudioContext): Synth {
    if (ctx !== Tone.getContext().rawContext) {
      Tone.setContext(new Tone.Context(ctx));
    }

    // Create polyphonic FMSynth for bright, bell-like character
    this.synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3, // Frequency ratio for FM modulation
      modulationIndex: 40, // Amount of FM modulation
      envelope: {
        attack: 0.008,
        decay: 0.2,
        sustain: 0.1,
        release: 0.15,
      },
      modulation: {
        attack: 0.008,
        decay: 0.2,
        sustain: 0.1,
        release: 0.15,
      },
    }).toDestination();

    return this.createSynthInstance();
  }

  ready(): boolean {
    return this.synth !== null;
  }

  private createSynthInstance(): Synth {
    const synth = this.synth;
    if (!synth) throw new Error('Synth not initialized');

    return {
      triggerNote: (pitch: number, velocity: number, duration: number) => {
        const freq = Tone.Midi(pitch).toFrequency();
        const vel = Math.max(0, Math.min(1, velocity / 127));
        synth.triggerAttackRelease(freq, duration, undefined, vel);
      },

      release: (pitch: number) => {
        const freq = Tone.Midi(pitch).toFrequency();
        synth.triggerRelease(freq);
      },

      dispose: () => {
        synth.dispose();
      },
    };
  }
}

/**
 * CustomOscSynth - Analog-style synthesizer using Web Audio API
 * Sawtooth oscillator + lowpass filter for warm, analog tone
 */
export class CustomOscSynth implements SynthEngine {
  id = 'custom-osc';
  name = 'Custom OSC (Analog)';

  private ctx: AudioContext | null = null;
  private activeNotes: Map<number, { osc: OscillatorNode; env: GainNode; filter: BiquadFilterNode }> = new Map();

  init(ctx: AudioContext): Synth {
    this.ctx = ctx;
    return this.createSynthInstance();
  }

  ready(): boolean {
    return this.ctx !== null;
  }

  private createSynthInstance(): Synth {
    const ctx = this.ctx;
    if (!ctx) throw new Error('AudioContext not initialized');

    return {
      triggerNote: (pitch: number, velocity: number, duration: number) => {
        const freq = Tone.Midi(pitch).toFrequency();
        const vel = Math.max(0, Math.min(1, velocity / 127));

        // Create oscillator
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        // Create lowpass filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000 + freq * 0.2; // Dynamic cutoff based on pitch
        filter.Q.value = 3;

        // Create envelope (ADSR)
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(vel, ctx.currentTime + 0.008); // attack
        env.gain.exponentialRampToValueAtTime(vel * 0.3, ctx.currentTime + 0.108); // decay
        env.gain.setValueAtTime(vel * 0.3, ctx.currentTime + duration - 0.1); // sustain
        env.gain.linearRampToValueAtTime(0, ctx.currentTime + duration); // release

        // Connect nodes
        osc.connect(filter);
        filter.connect(env);
        env.connect(ctx.destination);

        // Start oscillator
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);

        // Track for release
        this.activeNotes.set(pitch, { osc, env, filter });

        // Cleanup after note ends
        osc.onended = () => {
          this.activeNotes.delete(pitch);
        };
      },

      release: (pitch: number) => {
        const note = this.activeNotes.get(pitch);
        if (note) {
          // Cancel any scheduled changes and fade out
          note.env.gain.cancelScheduledValues(ctx.currentTime);
          note.env.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
        }
      },

      dispose: () => {
        // Stop all active notes
        this.activeNotes.forEach(({ osc, env }) => {
          env.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
          osc.stop(ctx.currentTime + 0.05);
        });
        this.activeNotes.clear();
      },
    };
  }
}

/**
 * ChiptuneSynth - 8-bit retro synthesizer
 * Square wave with fast, snappy envelope for chiptune character
 */
export class ChiptuneSynth implements SynthEngine {
  id = 'chiptune';
  name = 'Chiptune (8-bit Retro)';

  private ctx: AudioContext | null = null;
  private activeNotes: Map<number, { osc: OscillatorNode; env: GainNode }> = new Map();

  init(ctx: AudioContext): Synth {
    this.ctx = ctx;
    return this.createSynthInstance();
  }

  ready(): boolean {
    return this.ctx !== null;
  }

  private createSynthInstance(): Synth {
    const ctx = this.ctx;
    if (!ctx) throw new Error('AudioContext not initialized');

    return {
      triggerNote: (pitch: number, velocity: number, duration: number) => {
        const freq = Tone.Midi(pitch).toFrequency();
        const vel = Math.max(0, Math.min(1, velocity / 127));

        // Create square wave oscillator
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;

        // Create envelope with very fast attack (snappy chiptune feel)
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(vel, ctx.currentTime + 0.002); // 2ms attack
        env.gain.linearRampToValueAtTime(vel * 0.2, ctx.currentTime + 0.05); // 50ms decay
        env.gain.setValueAtTime(vel * 0.2, ctx.currentTime + duration - 0.02); // sustain
        env.gain.linearRampToValueAtTime(0, ctx.currentTime + duration); // 20ms release

        // Connect and start
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);

        this.activeNotes.set(pitch, { osc, env });

        osc.onended = () => {
          this.activeNotes.delete(pitch);
        };
      },

      release: (pitch: number) => {
        const note = this.activeNotes.get(pitch);
        if (note) {
          note.env.gain.cancelScheduledValues(ctx.currentTime);
          note.env.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.02);
          note.osc.stop(ctx.currentTime + 0.02);
        }
      },

      dispose: () => {
        this.activeNotes.forEach(({ osc, env }) => {
          env.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.02);
          osc.stop(ctx.currentTime + 0.02);
        });
        this.activeNotes.clear();
      },
    };
  }
}

/**
 * NoisePercSynth - Percussion and noise synthesizer
 * White noise with highpass filter and punchy envelope for drum/percussion sounds
 */
export class NoisePercSynth implements SynthEngine {
  id = 'noise-perc';
  name = 'Noise/Perc (Percussion)';

  private ctx: AudioContext | null = null;
  private activeNotes: Map<number, { noise: AudioBufferSourceNode; env: GainNode; filter: BiquadFilterNode }> = new Map();

  init(ctx: AudioContext): Synth {
    this.ctx = ctx;
    return this.createSynthInstance();
  }

  ready(): boolean {
    return this.ctx !== null;
  }

  private createNoiseBuffer(): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext not initialized');
    const bufferSize = this.ctx.sampleRate * 2; // 2 second buffer
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // White noise
    }
    return buffer;
  }

  private createSynthInstance(): Synth {
    const ctx = this.ctx;
    if (!ctx) throw new Error('AudioContext not initialized');

    return {
      triggerNote: (pitch: number, velocity: number, duration: number) => {
        const vel = Math.max(0, Math.min(1, velocity / 127));

        // Create noise source
        const noise = ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer();
        noise.loop = true;

        // Create highpass filter
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000; // Remove low frequencies for punchy percussion
        filter.Q.value = 2;

        // Create punchy envelope
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(vel, ctx.currentTime + 0.003); // 3ms attack
        env.gain.exponentialRampToValueAtTime(vel * 0.1, ctx.currentTime + 0.15); // 150ms decay
        env.gain.linearRampToValueAtTime(0, ctx.currentTime + duration); // release

        // Connect nodes
        noise.connect(filter);
        filter.connect(env);
        env.connect(ctx.destination);

        // Start noise
        noise.start(ctx.currentTime);
        noise.stop(ctx.currentTime + duration);

        this.activeNotes.set(pitch, { noise, env, filter });

        noise.onended = () => {
          this.activeNotes.delete(pitch);
        };
      },

      release: (pitch: number) => {
        const note = this.activeNotes.get(pitch);
        if (note) {
          note.env.gain.cancelScheduledValues(ctx.currentTime);
          note.env.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
          note.noise.stop(ctx.currentTime + 0.05);
        }
      },

      dispose: () => {
        this.activeNotes.forEach(({ noise, env }) => {
          env.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
          noise.stop(ctx.currentTime + 0.05);
        });
        this.activeNotes.clear();
      },
    };
  }
}

/**
 * Registry of all available synth engines
 */
export const SYNTH_ENGINES: SynthEngine[] = [
  new ToneBasicSynth(),
  new ToneWavetableSynth(),
  new CustomOscSynth(),
  new ChiptuneSynth(),
  new NoisePercSynth(),
];

/**
 * Get a synth engine by ID
 */
export function getSynthEngine(id: string): SynthEngine | undefined {
  return SYNTH_ENGINES.find((engine) => engine.id === id);
}
