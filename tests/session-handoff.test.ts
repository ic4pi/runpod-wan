import { describe, expect, it } from 'vitest';
import { buildGrocerySession } from '../sprouts/src/lib/audio/grocery';

const layers = [
  { role: 'lead', duration: 2.5, pan: null, gain: null },
  { role: 'double', duration: 2.6, pan: -0.75, gain: 0.7 },
];

describe('Sprouts to Pastry session metadata', () => {
  it('keeps every uploaded backing stem independent and aligned at zero', () => {
    const session = buildGrocerySession({
      sessionName: 'Two-stem test',
      bpm: 120,
      templateId: 'melodic-rap',
      levels: { warmth: 1.1, brightness: 1.2, punch: 0.9, space: 1.3 },
      layers,
      backingStems: [
        { name: 'drums.wav', duration: 8, role: 'beat', file: 'backing-1.wav' },
        { name: 'bass.wav', duration: 8, role: 'bass', file: 'backing-2.wav' },
      ],
    });

    expect(session.tracks).toHaveLength(4);
    expect(session.tracks.slice(0, 2)).toMatchObject([
      { name: 'drums.wav', role: 'beat', file: 'backing-1.wav', startBar: 0, offsetSeconds: 0 },
      { name: 'bass.wav', role: 'bass', file: 'backing-2.wav', startBar: 0, offsetSeconds: 0 },
    ]);
    expect(session.tracks.slice(2).map((track) => track.role)).toEqual(['lead', 'double']);
    expect(session.levels).toEqual({ warmth: 1.1, brightness: 1.2, punch: 0.9, space: 1.3 });
    expect(session.barCount).toBe(4);
  });

  it('generates unique backing filenames and retains the legacy single-beat shape', () => {
    const multi = buildGrocerySession({
      sessionName: 'Names', bpm: 90, templateId: 'drill', layers: [],
      backingStems: [
        { name: 'music.wav', duration: 4, role: 'beat' },
        { name: 'low.wav', duration: 4, role: 'bass' },
      ],
    });
    expect(multi.tracks.map((track) => track.file)).toEqual(['backing-1.wav', 'backing-2.wav']);

    const legacy = buildGrocerySession({
      sessionName: 'Legacy', bpm: 90, templateId: 'drill', layers: [], beatDuration: 4,
    });
    expect(legacy.tracks).toHaveLength(1);
    expect(legacy.tracks[0]).toMatchObject({ role: 'beat', file: 'beat.wav' });
  });
});
