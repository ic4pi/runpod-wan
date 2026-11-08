/**
 * Synth Engine Core Interfaces
 *
 * This module defines the contract for all synth engine implementations.
 * Each engine must provide a SynthEngine factory interface and return a Synth
 * instance when initialized with an AudioContext.
 */

/**
 * Synth instance - represents an initialized synth ready for playback
 * Created by SynthEngine.init(ctx)
 */
export interface Synth {
  /**
   * Trigger a note at a given pitch with velocity and duration
   * @param pitch MIDI note number (0-127)
   * @param velocity MIDI velocity (0-127), typically used for amplitude
   * @param duration Duration in seconds
   */
  triggerNote(pitch: number, velocity: number, duration: number): void;

  /**
   * Release a note at a given pitch (if supported by the engine)
   * Some engines may use this to trigger release envelopes
   * @param pitch MIDI note number (0-127)
   */
  release(pitch: number): void;

  /**
   * Clean up resources and disconnect from AudioContext
   * Must be called before disposing a synth instance
   */
  dispose(): void;
}

/**
 * SynthEngine factory interface
 * All synth engines must implement this to be compatible with the system
 */
export interface SynthEngine {
  /**
   * Unique identifier for this engine (e.g., 'tone-basic', 'tone-wavetable')
   */
  id: string;

  /**
   * Human-readable name for this engine
   */
  name: string;

  /**
   * Initialize the synth engine with an AudioContext
   * @param ctx AudioContext to use for synthesis
   * @returns Initialized Synth instance ready for playback
   */
  init(ctx: AudioContext): Synth;

  /**
   * Check if this engine is ready for use
   * Useful for async initialization scenarios
   */
  ready(): boolean;
}
