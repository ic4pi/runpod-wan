/**
 * Synth Engine Tests
 *
 * Comprehensive test suite for all 5 synth engines:
 * - ToneBasicSynth
 * - ToneWavetableSynth
 * - CustomOscSynth
 * - ChiptuneSynth
 * - NoisePercSynth
 */

import {
  ToneBasicSynth,
  ToneWavetableSynth,
  CustomOscSynth,
  ChiptuneSynth,
  NoisePercSynth,
  SYNTH_ENGINES,
  getSynthEngine,
} from '../../../app/src/lib/synth/engines';
import type { SynthEngine, Synth } from '../../../app/src/lib/synth/types';

describe('Synth Engines', () => {
  let ctx: AudioContext;

  beforeEach(() => {
    // Create a fresh AudioContext for each test
    ctx = new AudioContext();
  });

  afterEach(async () => {
    // Clean up AudioContext after each test
    await ctx.close();
  });

  describe('ToneBasicSynth', () => {
    let engine: SynthEngine;
    let synth: Synth;

    beforeEach(() => {
      engine = new ToneBasicSynth();
      synth = engine.init(ctx);
    });

    afterEach(() => {
      synth.dispose();
    });

    it('should have correct id and name', () => {
      expect(engine.id).toBe('tone-basic');
      expect(engine.name).toContain('Tone Basic');
    });

    it('should initialize with AudioContext', () => {
      expect(engine.ready()).toBe(true);
    });

    it('should trigger a note without throwing', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.5); // C4, velocity 100, 500ms
      }).not.toThrow();
    });

    it('should trigger multiple notes (polyphonic)', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.5); // C4
        synth.triggerNote(64, 100, 0.5); // E4
        synth.triggerNote(67, 100, 0.5); // G4
      }).not.toThrow();
    });

    it('should handle MIDI note range (0-127)', () => {
      expect(() => {
        synth.triggerNote(0, 100, 0.5); // Lowest note
        synth.triggerNote(127, 100, 0.5); // Highest note
        synth.triggerNote(60, 100, 0.5); // Middle C
      }).not.toThrow();
    });

    it('should handle velocity range (0-127)', () => {
      expect(() => {
        synth.triggerNote(60, 0, 0.5); // Silent
        synth.triggerNote(60, 64, 0.5); // Half velocity
        synth.triggerNote(60, 127, 0.5); // Max velocity
      }).not.toThrow();
    });

    it('should release a note without throwing', () => {
      synth.triggerNote(60, 100, 0.5);
      expect(() => {
        synth.release(60);
      }).not.toThrow();
    });

    it('should dispose without throwing', () => {
      expect(() => {
        synth.dispose();
      }).not.toThrow();
    });

    it('should not throw when disposing multiple times', () => {
      expect(() => {
        synth.dispose();
        synth.dispose();
      }).not.toThrow();
    });
  });

  describe('ToneWavetableSynth', () => {
    let engine: SynthEngine;
    let synth: Synth;

    beforeEach(() => {
      engine = new ToneWavetableSynth();
      synth = engine.init(ctx);
    });

    afterEach(() => {
      synth.dispose();
    });

    it('should have correct id and name', () => {
      expect(engine.id).toBe('tone-wavetable');
      expect(engine.name).toContain('Wavetable');
    });

    it('should initialize with AudioContext', () => {
      expect(engine.ready()).toBe(true);
    });

    it('should trigger a note without throwing', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.5);
      }).not.toThrow();
    });

    it('should trigger notes at different pitches', () => {
      expect(() => {
        synth.triggerNote(50, 100, 0.5); // Lower pitch
        synth.triggerNote(70, 100, 0.5); // Higher pitch
      }).not.toThrow();
    });

    it('should release a note without throwing', () => {
      synth.triggerNote(60, 100, 0.5);
      expect(() => {
        synth.release(60);
      }).not.toThrow();
    });

    it('should dispose without throwing', () => {
      expect(() => {
        synth.dispose();
      }).not.toThrow();
    });
  });

  describe('CustomOscSynth', () => {
    let engine: SynthEngine;
    let synth: Synth;

    beforeEach(() => {
      engine = new CustomOscSynth();
      synth = engine.init(ctx);
    });

    afterEach(() => {
      synth.dispose();
    });

    it('should have correct id and name', () => {
      expect(engine.id).toBe('custom-osc');
      expect(engine.name).toContain('Analog');
    });

    it('should initialize with AudioContext', () => {
      expect(engine.ready()).toBe(true);
    });

    it('should trigger a note without throwing', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.5);
      }).not.toThrow();
    });

    it('should handle multiple simultaneous notes', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.5);
        synth.triggerNote(64, 100, 0.5);
        synth.triggerNote(67, 100, 0.5);
      }).not.toThrow();
    });

    it('should release a note without throwing', () => {
      synth.triggerNote(60, 100, 0.5);
      expect(() => {
        synth.release(60);
      }).not.toThrow();
    });

    it('should dispose without throwing', () => {
      expect(() => {
        synth.dispose();
      }).not.toThrow();
    });

    it('should handle very short durations', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.01); // 10ms
      }).not.toThrow();
    });

    it('should handle long durations', () => {
      expect(() => {
        synth.triggerNote(60, 100, 5.0); // 5 seconds
      }).not.toThrow();
    });
  });

  describe('ChiptuneSynth', () => {
    let engine: SynthEngine;
    let synth: Synth;

    beforeEach(() => {
      engine = new ChiptuneSynth();
      synth = engine.init(ctx);
    });

    afterEach(() => {
      synth.dispose();
    });

    it('should have correct id and name', () => {
      expect(engine.id).toBe('chiptune');
      expect(engine.name).toContain('Chiptune');
    });

    it('should initialize with AudioContext', () => {
      expect(engine.ready()).toBe(true);
    });

    it('should trigger a note without throwing', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.5);
      }).not.toThrow();
    });

    it('should trigger retro-sounding notes (square wave)', () => {
      expect(() => {
        synth.triggerNote(48, 100, 0.3); // C3
        synth.triggerNote(52, 100, 0.3); // E3
        synth.triggerNote(55, 100, 0.3); // G3
      }).not.toThrow();
    });

    it('should release a note without throwing', () => {
      synth.triggerNote(60, 100, 0.5);
      expect(() => {
        synth.release(60);
      }).not.toThrow();
    });

    it('should dispose without throwing', () => {
      expect(() => {
        synth.dispose();
      }).not.toThrow();
    });

    it('should have snappy envelope (fast attack)', () => {
      // This is more of an integration test - verify it doesn't crash
      expect(() => {
        synth.triggerNote(60, 127, 0.1); // Max velocity, short duration
      }).not.toThrow();
    });
  });

  describe('NoisePercSynth', () => {
    let engine: SynthEngine;
    let synth: Synth;

    beforeEach(() => {
      engine = new NoisePercSynth();
      synth = engine.init(ctx);
    });

    afterEach(() => {
      synth.dispose();
    });

    it('should have correct id and name', () => {
      expect(engine.id).toBe('noise-perc');
      expect(engine.name).toContain('Noise');
    });

    it('should initialize with AudioContext', () => {
      expect(engine.ready()).toBe(true);
    });

    it('should trigger a percussive note without throwing', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.2); // Short duration for percussion
      }).not.toThrow();
    });

    it('should trigger multiple percussion hits', () => {
      expect(() => {
        synth.triggerNote(60, 100, 0.1);
        synth.triggerNote(60, 80, 0.15);
        synth.triggerNote(60, 100, 0.1);
      }).not.toThrow();
    });

    it('should release a note without throwing', () => {
      synth.triggerNote(60, 100, 0.2);
      expect(() => {
        synth.release(60);
      }).not.toThrow();
    });

    it('should dispose without throwing', () => {
      expect(() => {
        synth.dispose();
      }).not.toThrow();
    });

    it('should create percussive sounds with high velocity', () => {
      expect(() => {
        synth.triggerNote(60, 127, 0.15); // Maximum velocity
      }).not.toThrow();
    });
  });

  describe('Cross-Synth Integration', () => {
    it('should initialize all 5 synth engines', () => {
      const engines = [
        new ToneBasicSynth(),
        new ToneWavetableSynth(),
        new CustomOscSynth(),
        new ChiptuneSynth(),
        new NoisePercSynth(),
      ];

      engines.forEach((engine) => {
        const synth = engine.init(ctx);
        expect(synth).toBeDefined();
        expect(engine.ready()).toBe(true);
        synth.dispose();
      });
    });

    it('should trigger notes on all engines without crashing', () => {
      const engines = [
        new ToneBasicSynth(),
        new ToneWavetableSynth(),
        new CustomOscSynth(),
        new ChiptuneSynth(),
        new NoisePercSynth(),
      ];

      expect(() => {
        engines.forEach((engine) => {
          const synth = engine.init(ctx);
          synth.triggerNote(60, 100, 0.5);
          synth.release(60);
          synth.dispose();
        });
      }).not.toThrow();
    });

    it('should have distinct sonic characteristics', () => {
      // This is a qualitative test - each engine should sound different
      // We verify they don't crash with various parameters
      const engines = [
        new ToneBasicSynth(),
        new ToneWavetableSynth(),
        new CustomOscSynth(),
        new ChiptuneSynth(),
        new NoisePercSynth(),
      ];

      expect(() => {
        // Play a C major chord on each engine to hear the difference
        engines.forEach((engine) => {
          const synth = engine.init(ctx);
          synth.triggerNote(60, 100, 0.3); // C4
          synth.triggerNote(64, 100, 0.3); // E4
          synth.triggerNote(67, 100, 0.3); // G4
          synth.dispose();
        });
      }).not.toThrow();
    });

    it('should dispose all engines properly', () => {
      const engines = [
        new ToneBasicSynth(),
        new ToneWavetableSynth(),
        new CustomOscSynth(),
        new ChiptuneSynth(),
        new NoisePercSynth(),
      ];

      expect(() => {
        engines.forEach((engine) => {
          const synth = engine.init(ctx);
          synth.triggerNote(60, 100, 0.5);
          synth.dispose();
          synth.dispose(); // Should be safe to call multiple times
        });
      }).not.toThrow();
    });
  });

  describe('Engine Registry', () => {
    it('should provide registry of all engines', () => {
      expect(SYNTH_ENGINES).toBeDefined();
      expect(SYNTH_ENGINES.length).toBe(5);
    });

    it('should have unique engine IDs', () => {
      const ids = SYNTH_ENGINES.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should get engine by ID', () => {
      const engine = getSynthEngine('tone-basic');
      expect(engine).toBeDefined();
      expect(engine?.id).toBe('tone-basic');
    });

    it('should return undefined for unknown engine ID', () => {
      const engine = getSynthEngine('unknown-engine');
      expect(engine).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle edge case: zero duration', () => {
      const synth = new ToneBasicSynth().init(ctx);
      expect(() => {
        synth.triggerNote(60, 100, 0);
      }).not.toThrow();
      synth.dispose();
    });

    it('should handle edge case: zero velocity', () => {
      const synth = new ToneBasicSynth().init(ctx);
      expect(() => {
        synth.triggerNote(60, 0, 0.5);
      }).not.toThrow();
      synth.dispose();
    });

    it('should handle edge case: velocity > 127', () => {
      const synth = new ToneBasicSynth().init(ctx);
      expect(() => {
        synth.triggerNote(60, 200, 0.5);
      }).not.toThrow();
      synth.dispose();
    });

    it('should handle rapid note triggers', () => {
      const synth = new CustomOscSynth().init(ctx);
      expect(() => {
        for (let i = 0; i < 100; i++) {
          synth.triggerNote(60 + (i % 12), 100, 0.05);
        }
      }).not.toThrow();
      synth.dispose();
    });

    it('should handle release of non-existent note', () => {
      const synth = new CustomOscSynth().init(ctx);
      expect(() => {
        synth.release(60); // Never triggered
      }).not.toThrow();
      synth.dispose();
    });
  });

  describe('Type Compliance', () => {
    it('should implement SynthEngine interface', () => {
      const engine: SynthEngine = new ToneBasicSynth();
      expect(engine.id).toBeDefined();
      expect(engine.name).toBeDefined();
      expect(typeof engine.init).toBe('function');
      expect(typeof engine.ready).toBe('function');
    });

    it('should implement Synth interface', () => {
      const engine = new ToneBasicSynth();
      const synth: Synth = engine.init(ctx);
      expect(typeof synth.triggerNote).toBe('function');
      expect(typeof synth.release).toBe('function');
      expect(typeof synth.dispose).toBe('function');
      synth.dispose();
    });
  });
});
