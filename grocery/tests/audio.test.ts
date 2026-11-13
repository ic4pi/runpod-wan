import { describe, expect, it } from 'vitest';
import { endOf, leadingSilence } from '@/lib/audio';

const fake = (samples: number[], rate = 100) =>
  ({ length: samples.length, sampleRate: rate, numberOfChannels: 1, getChannelData: () => Float32Array.from(samples) }) as unknown as AudioBuffer;

describe('timeline math', () => {
  it('endOf: positive nudge delays the end, negative trims the start', () => {
    expect(endOf({ offset: 0, duration: 10 })).toBe(10);
    expect(endOf({ offset: 0.5, duration: 10 })).toBeCloseTo(10.5);
    expect(endOf({ offset: -2, duration: 10 })).toBeCloseTo(8);
  });
  it('leadingSilence finds the first real sound', () => {
    expect(leadingSilence(fake([0, 0, 0, 0.5, 0.2]))).toBeCloseTo(0.03);
    expect(leadingSilence(fake([0, 0, 0]))).toBe(0);
  });
});
