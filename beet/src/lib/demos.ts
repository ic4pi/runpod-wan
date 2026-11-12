import type { Note, Session, Track } from './session';

/**
 * Starter patterns — press Play and it's already music. Each demo is a
 * complete 2-bar session built from stock presets, so users can tear them
 * apart cell by cell and learn the grid by breaking things.
 */

const n = (step: number, pitch: number, len: number, vel = 100): Note => ({ step, pitch, len, vel });

const trk = (id: string, name: string, presetId: string, notes: Note[], p: Partial<Track> = {}): Track => ({
  id, name, presetId,
  volume: 0.75, pan: 0, mute: false, solo: false, startBar: 0,
  reverb: 0, delay: 0, humanize: 0, notes,
  ...p,
});

export interface Demo { id: string; name: string; session: Session }

// Kit pitches: 36 kick · 38 snare · 39 clap · 42 closed hat · 46 open hat · 45 tom · 37 rim · 49 crash

const boomBap: Session = {
  bpm: 88, bars: 2, sig: { beats: 4, unit: 4 },
  tracks: [
    trk('demo-boom-drums', 'Boom Kit', 'kit-boom', [
      n(0, 36, 2, 110), n(10, 36, 2, 96),
      n(4, 38, 2, 104), n(12, 38, 2, 100),
      n(2, 42, 1, 72), n(6, 42, 1, 64), n(8, 42, 1, 76), n(14, 46, 2, 70),
      n(16, 36, 2, 108), n(26, 36, 2, 94),
      n(20, 38, 2, 104), n(28, 38, 2, 100),
      n(18, 42, 1, 70), n(22, 42, 1, 62), n(24, 42, 1, 78), n(30, 46, 2, 72),
    ], { volume: 0.9, humanize: 0.25 }),
    trk('demo-boom-bass', 'Round Bass', 'bass-round', [
      n(0, 36, 6, 104), n(8, 36, 2, 92), n(10, 39, 4, 98),
      n(16, 41, 6, 102), n(24, 43, 4, 96), n(28, 36, 4, 90),
    ], { volume: 0.8, humanize: 0.15 }),
    trk('demo-boom-keys', 'Warm Keys', 'keys-warm', [
      n(4, 60, 2, 84), n(12, 63, 2, 78),
      n(20, 63, 2, 82), n(28, 67, 2, 76),
    ], { volume: 0.6, reverb: 0.3, humanize: 0.2 }),
  ],
};

const trap: Session = {
  bpm: 140, bars: 2, sig: { beats: 4, unit: 4 },
  tracks: [
    trk('demo-trap-drums', 'Trap Kit', 'kit-trap', [
      n(0, 36, 2, 112), n(6, 36, 2, 100), n(10, 36, 2, 106),
      n(8, 39, 2, 108), n(24, 39, 2, 108),
      n(0, 42, 1, 80), n(1, 42, 1, 62), n(2, 42, 1, 74), n(3, 42, 1, 60),
      n(4, 42, 1, 78), n(5, 42, 1, 62), n(6, 42, 1, 74), n(7, 42, 1, 64),
      n(8, 42, 1, 82), n(9, 42, 1, 60), n(10, 42, 1, 76), n(11, 42, 1, 62),
      n(12, 42, 1, 80), n(13, 42, 1, 66), n(14, 46, 2, 74), n(15, 42, 1, 88),
      n(16, 42, 1, 80), n(17, 42, 1, 62), n(18, 42, 1, 74), n(19, 42, 1, 60),
      n(20, 42, 1, 78), n(21, 42, 1, 62), n(22, 42, 1, 74), n(23, 42, 1, 64),
      n(24, 42, 1, 82), n(25, 42, 1, 60), n(26, 42, 1, 76), n(27, 42, 1, 62),
      n(28, 42, 1, 80), n(29, 42, 1, 66), n(30, 46, 2, 74), n(31, 42, 1, 88),
    ], { volume: 0.9, humanize: 0.12 }),
    trk('demo-trap-808', 'Sub Bass', 'bass-sub', [
      n(0, 36, 10, 110), n(12, 36, 4, 96),
      n(16, 39, 6, 106), n(24, 35, 8, 100),
    ], { volume: 0.85 }),
    trk('demo-trap-bells', 'Bells', 'keys-bell', [
      n(4, 72, 2, 82), n(12, 70, 2, 76),
      n(20, 67, 2, 80), n(28, 63, 4, 74),
    ], { volume: 0.55, reverb: 0.35, delay: 0.2, humanize: 0.2 }),
  ],
};

const house: Session = {
  bpm: 124, bars: 2, sig: { beats: 4, unit: 4 },
  tracks: [
    trk('demo-house-drums', 'Tight Kit', 'kit-tight', [
      n(0, 36, 2, 108), n(4, 36, 2, 108), n(8, 36, 2, 108), n(12, 36, 2, 108),
      n(16, 36, 2, 108), n(20, 36, 2, 108), n(24, 36, 2, 108), n(28, 36, 2, 108),
      n(2, 46, 2, 76), n(6, 46, 2, 72), n(10, 46, 2, 76), n(14, 46, 2, 72),
      n(18, 46, 2, 76), n(22, 46, 2, 72), n(26, 46, 2, 76), n(30, 46, 2, 72),
      n(4, 39, 2, 96), n(12, 39, 2, 92), n(20, 39, 2, 96), n(28, 39, 2, 92),
    ], { volume: 0.9, humanize: 0.1 }),
    trk('demo-house-bass', 'Pluck Bass', 'bass-pluck', [
      n(2, 36, 2, 100), n(6, 36, 2, 92), n(10, 36, 2, 100), n(14, 39, 2, 94),
      n(18, 36, 2, 100), n(22, 36, 2, 92), n(26, 36, 2, 100), n(30, 41, 2, 94),
    ], { volume: 0.8 }),
    trk('demo-house-pad', 'Warm Pad', 'pad-warm', [
      n(0, 48, 8, 74), n(0, 51, 8, 70), n(0, 55, 8, 72),
      n(8, 46, 8, 72), n(8, 50, 8, 68), n(8, 53, 8, 70),
      n(16, 48, 8, 74), n(16, 51, 8, 70), n(16, 55, 8, 72),
      n(24, 46, 8, 72), n(24, 50, 8, 68), n(24, 53, 8, 70),
    ], { volume: 0.55, reverb: 0.35 }),
  ],
};

const loFi: Session = {
  bpm: 82, bars: 2, sig: { beats: 4, unit: 4 },
  tracks: [
    trk('demo-lofi-drums', 'Lo-Fi Kit', 'kit-lofi', [
      n(0, 36, 2, 96), n(10, 36, 2, 88),
      n(4, 38, 2, 88), n(12, 38, 2, 84),
      n(2, 42, 1, 56), n(6, 42, 1, 48), n(14, 46, 2, 52),
      n(16, 36, 2, 94), n(26, 36, 2, 86),
      n(20, 38, 2, 88), n(28, 38, 2, 84),
      n(18, 42, 1, 54), n(22, 42, 1, 48), n(30, 46, 2, 52),
    ], { volume: 0.85, humanize: 0.35 }),
    trk('demo-lofi-bass', 'Triangle Bass', 'bass-tri', [
      n(0, 41, 8, 92), n(8, 43, 4, 86), n(12, 36, 4, 84),
      n(16, 39, 8, 90), n(24, 41, 4, 86), n(28, 43, 4, 84),
    ], { volume: 0.75, humanize: 0.2 }),
    trk('demo-lofi-ep', 'E-Piano', 'keys-ep', [
      n(2, 60, 6, 68), n(2, 63, 6, 62), n(2, 67, 6, 64),
      n(10, 58, 4, 64), n(10, 62, 4, 58), n(10, 65, 4, 60),
      n(18, 55, 6, 66), n(18, 58, 6, 60), n(18, 62, 6, 62),
      n(26, 53, 4, 62), n(26, 57, 4, 56), n(26, 60, 4, 58),
    ], { volume: 0.6, reverb: 0.4, humanize: 0.25 }),
  ],
};

export const DEMOS: Demo[] = [
  { id: 'boom-bap', name: 'Boom Bap', session: boomBap },
  { id: 'trap', name: 'Trap', session: trap },
  { id: 'house', name: 'House', session: house },
  { id: 'lo-fi', name: 'Lo-Fi', session: loFi },
];
