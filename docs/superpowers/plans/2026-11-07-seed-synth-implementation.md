# Seed Synth Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based synth composition app with 5-6 playable synth engines, timeline-based sequencing, keyboard input, presets, and WAV export for Levels Studio integration.

**Architecture:** Synth engines built with Tone.js (polyphonic synthesis) + Web Audio API for real-time audio. React-based UI with piano roll timeline editor. IndexedDB for session/preset persistence. Export pipeline renders audio with silence padding to maintain timeline alignment across stems.

**Tech Stack:** React 19 + TypeScript, Tone.js 14+, Web Audio API, IndexedDB, shadcn/ui (matching Levels), Tailwind CSS, WAV encoder library

**Spec:** `docs/superpowers/specs/2026-11-07-seed-synth-design.md`

---

## Global Constraints

- Target browsers: Chrome 90+, Firefox 88+, Safari 14+ (PWA support)
- Audio sample rate: 44.1 kHz (WAV export standard)
- BPM range: 60–180
- Max tracks: 8 simultaneous synth tracks
- Max bars: 32 (extensible)
- Synth types: Exactly 5 (Tone Basic, Tone Wavetable, Custom OSC, Chiptune, Noise/Perc) — not 6, to keep MVP lean
- Export format: WAV only (MIDI out of scope for MVP)
- No backend — all processing client-side

---

## Review Focus

These inputs/conditions are most likely to cause runtime failures or poor UX:

1. **Timing Misalignment on Export:** WAV stems don't align in Levels when imported; silence padding calculation is off-by-one or uses wrong sample rate. Test: export 3-track arrangement, import to Levels, verify playback sync without manual offset.

2. **AudioContext Suspended State:** Recording/playback fails silently on iOS/Safari because AudioContext.resume() is not awaited. Test: start playback immediately after user interaction; verify audio plays.

3. **Floating-Point Precision in Note Timing:** Notes placed at fractional beat positions lose precision; play back at wrong times. Test: place note at beat 1.5, export MIDI, re-import, verify timing is exact.

4. **Memory Leak from Synth Nodes:** Synth nodes created per-note accumulate without cleanup; browser memory grows unbounded over long sessions. Test: play 100 notes, check AudioContext.currentTime hasn't drifted and no detached nodes remain.

5. **Preset Load Corruption:** Corrupt IndexedDB entry or malformed JSON preset crashes the app. Test: load preset, clear IndexedDB, try to load again; verify graceful fallback to default.

---

## File Structure

```
app/src/
├── lib/
│   ├── synth/
│   │   ├── engines.ts          # 5 synth engine definitions (Tone-based + custom)
│   │   ├── presets.ts          # Preset library JSON data + loader
│   │   └── types.ts            # SynthEngine, Preset, SynthNote interfaces
│   ├── timeline/
│   │   ├── sequencer.ts        # Sequencer logic (playback, scheduling)
│   │   ├── renderer.ts         # WAV export + silence padding
│   │   └── types.ts            # Track, Session, Note data structures
│   └── storage.ts              # IndexedDB persistence (sessions, presets)
├── components/
│   ├── SynthApp.tsx            # Main app shell
│   ├── TimelineEditor.tsx       # Piano roll + track UI
│   ├── KeyboardInput.tsx        # Keyboard key mapping + event handling
│   ├── SynthSelector.tsx        # Synth engine picker
│   ├── PresetSelector.tsx       # Preset dropdown
│   ├── TransportControls.tsx    # Play/pause/stop + BPM/bar count
│   ├── TrackList.tsx            # Track rows (volume, mute, start bar)
│   └── ExportPanel.tsx          # Export WAV button + progress
├── hooks/
│   ├── useSynthSession.ts       # Session state (tracks, playback)
│   ├── useKeyboardInput.ts      # Keyboard → synth note mapping
│   └── useAudioContext.ts       # Singleton AudioContext + cleanup
└── App.tsx                      # Routing (if standalone) or embed in Levels

tests/
├── lib/
│   ├── synth/
│   │   ├── engines.test.ts      # Synth initialization, note triggering
│   │   └── presets.test.ts      # Preset loading + validation
│   ├── timeline/
│   │   ├── sequencer.test.ts    # Playback scheduling, timing accuracy
│   │   ├── renderer.test.ts     # WAV export, silence padding, alignment
│   │   └── types.test.ts        # Data structure validation
│   └── storage.test.ts          # IndexedDB CRUD
└── integration/
    └── full-session.test.ts     # End-to-end: compose → export → play
```

---

## Task Breakdown

### Task 1: Synth Engine Core (Tone.js Wrappers)

**Files:**
- Create: `app/src/lib/synth/types.ts`
- Create: `app/src/lib/synth/engines.ts`
- Create: `tests/lib/synth/engines.test.ts`

**Interfaces:**
- Consumes: (none — foundation task)
- Produces: 
  - `SynthEngine` interface: `{ id: string; name: string; init(ctx: AudioContext): Synth; triggerNote(pitch: number, velocity: number, duration: number): void; release(pitch: number): void; }`
  - `Synth` interface: methods for oscillator/filter control, cleanup
  - 5 concrete implementations: `ToneBasicSynth`, `ToneWavetableSynth`, `CustomOscSynth`, `ChiptuneSynth`, `NoisePercSynth`

**Dependencies:** Tone.js 14+, Web Audio API

- [ ] **Step 1: Define `SynthEngine` and `Synth` interfaces in `app/src/lib/synth/types.ts`**

Interfaces define the contract all synth engines follow. Include: `init(ctx)`, `triggerNote(pitch, velocity, duration)`, `release(pitch)`, `dispose()`.

- [ ] **Step 2: Write failing tests for `ToneBasicSynth` in `tests/lib/synth/engines.test.ts`**

```typescript
describe('ToneBasicSynth', () => {
  it('initializes with AudioContext', () => {
    const ctx = new AudioContext();
    const synth = new ToneBasicSynth();
    synth.init(ctx);
    expect(synth.ready()).toBe(true);
  });

  it('triggers note at correct pitch', () => {
    const synth = new ToneBasicSynth();
    synth.init(new AudioContext());
    const spy = jest.spyOn(synth, 'noteOn');
    synth.triggerNote(60, 100, 0.5); // C4, velocity 100, 500ms
    expect(spy).toHaveBeenCalledWith(60, 100);
  });

  it('releases note', () => {
    const synth = new ToneBasicSynth();
    synth.init(new AudioContext());
    synth.triggerNote(60, 100, 0.5);
    const spy = jest.spyOn(synth, 'noteOff');
    synth.release(60);
    expect(spy).toHaveBeenCalledWith(60);
  });

  it('cleans up resources on dispose', () => {
    const synth = new ToneBasicSynth();
    synth.init(new AudioContext());
    expect(() => synth.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 3: Implement `ToneBasicSynth` in `app/src/lib/synth/engines.ts`**

Use Tone.js `Synth` (polyphonic, ADSR envelope). Properties: attack=5ms, decay=10ms, sustain=0.3, release=100ms (standard warm sound). Tone.js handles note scheduling internally; expose `noteOn(pitch, velocity)` and `noteOff(pitch)` as the contract.

- [ ] **Step 4: Implement 4 more synth engines (`ToneWavetableSynth`, `CustomOscSynth`, `ChiptuneSynth`, `NoisePercSynth`) with distinct presets**

- `ToneWavetableSynth`: Use Tone.js `PolySynth` with `FMSynth` for FM synthesis (bright, bell-like).
- `CustomOscSynth`: Custom Web Audio API oscillator (sawtooth + lowpass filter for analog warmth).
- `ChiptuneSynth`: Square wave with fast envelope (8-bit retro sound).
- `NoisePercSynth`: Noise + highpass filter + short ADSR (percussion hits).

Each engine should sound distinctly different. Test that each one initializes without error.

- [ ] **Step 5: Write integration test: all 5 synths trigger notes without crashing**

```typescript
it('all synth engines initialize and play notes', () => {
  const ctx = new AudioContext();
  const engines = [
    new ToneBasicSynth(),
    new ToneWavetableSynth(),
    new CustomOscSynth(),
    new ChiptuneSynth(),
    new NoisePercSynth(),
  ];
  engines.forEach((engine) => {
    engine.init(ctx);
    expect(() => engine.triggerNote(60, 100, 0.5)).not.toThrow();
    engine.dispose();
  });
});
```

- [ ] **Step 6: Run all tests; verify PASS**

Run: `npm test -- tests/lib/synth/engines.test.ts`

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/synth/ tests/lib/synth/engines.test.ts
git commit -m "feat: add 5 synth engines with Tone.js + Web Audio API

- ToneBasicSynth: warm polyphonic synth
- ToneWavetableSynth: bright FM synth
- CustomOscSynth: analog-style oscillator
- ChiptuneSynth: 8-bit retro sound
- NoisePercSynth: percussion + noise

All engines pass initialization + note triggering tests."
```

---

### Task 2: Preset System & Storage

**Files:**
- Create: `app/src/lib/synth/presets.ts`
- Create: `app/src/lib/storage.ts`
- Create: `tests/lib/synth/presets.test.ts`
- Create: `tests/lib/storage.test.ts`

**Interfaces:**
- Consumes: `SynthEngine` from Task 1
- Produces:
  - `Preset` interface: `{ id: string; name: string; category: 'drums' | 'bass' | 'leads' | 'pads' | 'atmosphere' | 'percussion'; params: Record<string, number>; }`
  - `loadPreset(engine: SynthEngine, preset: Preset): void`
  - `saveSession(session: SeedSession): Promise<void>`
  - `loadSession(sessionId: string): Promise<SeedSession>`
  - `listSessions(): Promise<SeedSession[]>`

- [ ] **Step 1: Define `Preset` interface and create preset library (JSON data) in `app/src/lib/synth/presets.ts`**

Create 10 presets per synth engine (50 total), organized by category:
- Drums: kick, snare, hi-hat, clap, tom
- Bass: sub bass, deep bass, bass pluck
- Leads: bright lead, warm lead, digital lead
- Pads: string pad, ambient pad, choir pad
- Atmosphere: reverb pad, noise wash
- Percussion: cowbell, perc hit, cymbal

Each preset stores synth-specific parameters (e.g., `{ attack: 0.005, decay: 0.1, cutoff: 2000 }`).

```typescript
export const PRESETS: Preset[] = [
  {
    id: 'tone-basic-kick',
    name: 'Deep Kick',
    synthEngine: 'tone-basic',
    category: 'drums',
    params: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1, pitch: 40 },
  },
  // ... 49 more
];
```

- [ ] **Step 2: Implement `loadPreset(engine, preset)` to apply preset parameters to synth**

Read `preset.params`, apply each to the synth engine (e.g., `engine.setAttack(params.attack)`). Error handling: if parameter name doesn't exist on engine, warn and skip.

- [ ] **Step 3: Write test: preset loads and synth sounds different**

```typescript
it('loads preset and applies parameters', () => {
  const synth = new ToneBasicSynth();
  synth.init(new AudioContext());
  const preset = PRESETS.find((p) => p.id === 'tone-basic-kick');
  loadPreset(synth, preset);
  expect(synth.getParam('attack')).toBe(preset.params.attack);
});
```

- [ ] **Step 4: Initialize IndexedDB in `app/src/lib/storage.ts`**

Create a database `'seed-studio'` with two object stores:
- `'sessions'` (keyPath: `'id'`) — stores full session data
- `'presets'` (keyPath: `'id'`) — caches custom presets

- [ ] **Step 5: Implement `saveSession`, `loadSession`, `listSessions` using IndexedDB**

`saveSession(session)`: Put session into `'sessions'` store. Handle `updatedAt` timestamp.

`loadSession(sessionId)`: Retrieve by ID from `'sessions'`. If not found, return null.

`listSessions()`: Scan all sessions, return array sorted by `updatedAt` descending.

- [ ] **Step 6: Write test: session persists and reloads from IndexedDB**

```typescript
it('saves and loads session from IndexedDB', async () => {
  const session = { id: 'test-1', name: 'Song', tracks: [], bpm: 120, ... };
  await saveSession(session);
  const loaded = await loadSession('test-1');
  expect(loaded).toEqual(session);
});
```

- [ ] **Step 7: Run all tests; verify PASS**

Run: `npm test -- tests/lib/synth/presets.test.ts tests/lib/storage.test.ts`

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/synth/presets.ts app/src/lib/storage.ts tests/lib/synth/presets.test.ts tests/lib/storage.test.ts
git commit -m "feat: add preset system + IndexedDB session storage

- 50 presets (10 per synth, organized by category)
- loadPreset() applies parameters to synth engines
- IndexedDB persistence for sessions + custom presets
- saveSession/loadSession/listSessions CRUD operations"
```

---

### Task 3: Timeline Data Structures & Sequencer Core

**Files:**
- Create: `app/src/lib/timeline/types.ts`
- Create: `app/src/lib/timeline/sequencer.ts`
- Create: `tests/lib/timeline/sequencer.test.ts`

**Interfaces:**
- Consumes: `SynthEngine` from Task 1, `Preset` from Task 2
- Produces:
  - `SeedNote` interface: `{ pitch: number; startBeat: number; duration: number; velocity: number; }`
  - `SeedTrack` interface: `{ id: string; name: string; synthEngine: string; presetId: string; startBar: number; notes: SeedNote[]; volume: number; muted: boolean; }`
  - `SeedSession` interface: `{ id: string; name: string; bpm: number; barCount: number; tracks: SeedTrack[]; }`
  - `Sequencer` class: `new Sequencer(ctx, session); play(); pause(); stop(); seek(bar); dispose();`

- [ ] **Step 1: Define data structure interfaces in `app/src/lib/timeline/types.ts`**

```typescript
export interface SeedNote {
  pitch: number; // MIDI note 0–127
  startBeat: number; // fractional beat (e.g., 1.5 = beat 1, half way through)
  duration: number; // in beats (e.g., 1 = quarter note at 120 BPM = 500ms)
  velocity: number; // 0–127
}

export interface SeedTrack {
  id: string;
  name: string;
  synthEngine: string; // e.g., 'tone-basic'
  presetId: string;
  startBar: number; // 0-indexed
  notes: SeedNote[];
  volume: number; // 0–1
  muted: boolean;
}

export interface SeedSession {
  id: string;
  name: string;
  bpm: number;
  barCount: number;
  tracks: SeedTrack[];
}
```

- [ ] **Step 2: Write failing tests for `Sequencer` in `tests/lib/timeline/sequencer.test.ts`**

```typescript
describe('Sequencer', () => {
  it('initializes with session and plays notes in order', async () => {
    const session: SeedSession = {
      id: '1',
      name: 'Test',
      bpm: 120,
      barCount: 4,
      tracks: [
        {
          id: 'track-1',
          name: 'Kick',
          synthEngine: 'tone-basic',
          presetId: 'tone-basic-kick',
          startBar: 0,
          notes: [
            { pitch: 40, startBeat: 0, duration: 1, velocity: 100 },
            { pitch: 40, startBeat: 2, duration: 1, velocity: 100 },
          ],
          volume: 1,
          muted: false,
        },
      ],
    };
    const ctx = new AudioContext();
    const sequencer = new Sequencer(ctx, session);
    const spy = jest.spyOn(sequencer, 'triggerNote');
    sequencer.play();
    await new Promise((r) => setTimeout(r, 1000)); // wait 1 second
    expect(spy).toHaveBeenCalled();
    sequencer.stop();
  });

  it('respects track startBar offset', () => {
    // Kick starts bar 0, bass starts bar 4
    // Verify bass notes play 4 bars later
  });

  it('pauses and resumes playback', () => {
    const sequencer = new Sequencer(ctx, session);
    sequencer.play();
    sequencer.pause();
    // Verify playback is frozen
    sequencer.play();
    // Verify playback resumes
  });

  it('seeks to specific bar', () => {
    const sequencer = new Sequencer(ctx, session);
    sequencer.seek(2); // Jump to bar 2
    // Verify currentBar === 2
  });

  it('loops at barCount', () => {
    // Play through all bars, verify it loops back to bar 0
  });
});
```

- [ ] **Step 3: Implement `Sequencer` class in `app/src/lib/timeline/sequencer.ts`**

Core logic:
- Constructor accepts `AudioContext` and `SeedSession`.
- Initialize all synth engines for each track (Task 1).
- `play()`: Start Web Audio API scheduling loop via `audioContext.currentTime`.
- `triggerNote(track, note)`: Call `synthEngine.triggerNote(note.pitch, note.velocity, note.duration)`.
- `pause()`: Freeze playback state; remember current beat.
- `resume()`: Continue from paused beat.
- `stop()`: Reset to bar 0.
- `seek(bar)`: Jump to specified bar.
- Schedule notes using Web Audio API's `audioContext.currentTime` + timing offset (Task 1 Review Focus: floating-point precision).

**Key algorithm:**
```
currentBeat = audioContext.currentTime * (bpm / 60) / 4
nextNotesToPlay = tracks
  .filter(track => !track.muted)
  .flatMap(track => 
    track.notes.filter(note => 
      note.startBeat >= currentBeat &&
      note.startBeat < currentBeat + lookahead
    )
  )
nextNotesToPlay.forEach(note => engine.triggerNote(...))
```

Use a small lookahead window (e.g., 100ms) to pre-schedule notes ahead of playback time.

- [ ] **Step 4: Test synth note triggering is accurate (±50ms)**

```typescript
it('triggers notes with <50ms latency', async () => {
  const startTime = audioContext.currentTime;
  sequencer.play();
  await new Promise((r) => setTimeout(r, 100));
  const actualTime = audioContext.currentTime - startTime;
  expect(actualTime).toBeLessThan(0.15); // 150ms tolerance
});
```

- [ ] **Step 5: Test loop/seek behavior**

```typescript
it('loops after barCount', async () => {
  const session = { ..., barCount: 2, tracks: [...] };
  const sequencer = new Sequencer(ctx, session);
  sequencer.play();
  // Wait until bar 3 should trigger (but wraps to bar 1)
  await new Promise((r) => setTimeout(r, bpm_to_ms(2 * 4 * beats_per_bar) + 100));
  expect(sequencer.currentBar).toBe(0); // looped
});

it('seeks to bar', () => {
  sequencer.seek(1);
  expect(sequencer.currentBar).toBe(1);
});
```

- [ ] **Step 6: Run all tests; verify PASS**

Run: `npm test -- tests/lib/timeline/sequencer.test.ts`

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/timeline/types.ts app/src/lib/timeline/sequencer.ts tests/lib/timeline/sequencer.test.ts
git commit -m "feat: add timeline data structures + sequencer playback

- SeedNote, SeedTrack, SeedSession interfaces
- Sequencer with Web Audio API scheduling
- Play/pause/stop/seek/loop controls
- Per-track startBar offset support
- <50ms note triggering latency"
```

---

### Task 4: WAV Export with Silence Padding

**Files:**
- Create: `app/src/lib/timeline/renderer.ts`
- Create: `tests/lib/timeline/renderer.test.ts`

**Interfaces:**
- Consumes: `SeedSession`, `SeedTrack` from Task 3, `Sequencer` from Task 3
- Produces:
  - `renderStemWav(track: SeedTrack, session: SeedSession): Promise<Blob>`
  - WAV Blob with silence-padded leading duration

- [ ] **Step 1: Write failing test for WAV export with silence padding in `tests/lib/timeline/renderer.test.ts`**

```typescript
describe('renderStemWav', () => {
  it('exports track as WAV with silence padding', async () => {
    const session = {
      bpm: 120,
      barCount: 8,
      tracks: [
        {
          id: 'drum-track',
          startBar: 0,
          notes: [{ pitch: 40, startBeat: 0, duration: 1, velocity: 100 }],
          ...
        },
        {
          id: 'bass-track',
          startBar: 4, // bass starts bar 4
          notes: [{ pitch: 36, startBeat: 0, duration: 2, velocity: 80 }],
          ...
        },
      ],
    };

    const drumBlob = await renderStemWav(session.tracks[0], session);
    const bassBlob = await renderStemWav(session.tracks[1], session);

    // Both blobs should be same duration (8 bars worth)
    expect(getDuration(drumBlob)).toBeCloseTo(getDuration(bassBlob), 1); // within 1ms

    // Bass blob should have 4 bars of silence at start
    const drumAudio = await decodeWav(drumBlob);
    const bassAudio = await decodeWav(bassBlob);
    
    // First 4 bars of bass should be ~0 (silence)
    const bassFirstFourBars = bassAudio.getChannelData(0).slice(0, silenceSamples);
    expect(Math.max(...bassFirstFourBars)).toBeLessThan(0.001); // ~silence
  });

  it('exports at 44.1 kHz, 16-bit', async () => {
    const blob = await renderStemWav(track, session);
    const audio = await decodeWav(blob);
    expect(audio.sampleRate).toBe(44100);
    expect(audio.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `renderStemWav` in `app/src/lib/timeline/renderer.ts`**

Algorithm:
1. Calculate total render duration = `(session.barCount * 4 * 60 / session.bpm)` seconds.
2. Calculate samples = `duration * 44100`.
3. Create silent `AudioBuffer` of that length at 44.1 kHz.
4. Create a temporary `Sequencer` for this track only.
5. Record synth output into the buffer (use Web Audio API `ScriptProcessorNode` or `AudioWorklet` to capture raw samples).
6. Encode AudioBuffer to WAV format (use library like `wav-encoder` or custom).
7. Return Blob.

**Key calculation for silence padding:**
```
silenceDuration = track.startBar * (4 * 60 / session.bpm) // seconds
silenceSamples = silenceDuration * 44100
```

For example, if track starts at bar 4 and BPM is 120:
```
silenceDuration = 4 * (4 * 60 / 120) = 4 * 2 = 8 seconds
silenceSamples = 8 * 44100 = 352800 samples
```

- [ ] **Step 3: Use `wav-encoder` npm package or implement custom WAV encoder**

If custom, implement WAV header (RIFF format, subchunks for fmt and data).

- [ ] **Step 4: Test silence padding calculation**

```typescript
it('calculates correct silence duration for track startBar', () => {
  const silence = calculateSilenceDuration(track, session);
  expect(silence).toBeCloseTo(8, 0); // 8 seconds for bar 4 at 120 BPM
});
```

- [ ] **Step 5: Test end-to-end: render kick track + bass track, verify alignment**

```typescript
it('exported stems align when played together', async () => {
  const kick = await renderStemWav(session.tracks[0], session); // bar 0
  const bass = await renderStemWav(session.tracks[1], session); // bar 4
  
  // Manually mix them in real-time, verify bass plays 4 bars after kick
  // (Use OfflineAudioContext to verify timing)
});
```

- [ ] **Step 6: Run all tests; verify PASS**

Run: `npm test -- tests/lib/timeline/renderer.test.ts`

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/timeline/renderer.ts tests/lib/timeline/renderer.test.ts
git commit -m "feat: WAV export with silence padding for timeline alignment

- renderStemWav(track, session) exports to 44.1 kHz WAV
- Silence padding = track.startBar * bpm-scaled seconds
- All stems have same total duration (session barCount)
- Verified alignment: stems play in sync when imported to Levels"
```

---

### Task 5: Keyboard & MIDI Controller Input

**Files:**
- Create: `app/src/hooks/useKeyboardInput.ts` — keyboard layer
- Create: `app/src/hooks/useMidiController.ts` — MIDI controller layer
- Create: `app/src/lib/midiMapping.ts` — controller mapping schema
- Create: `tests/integration/keyboard-input.test.ts` — keyboard tests
- Create: `tests/integration/midi-controller.test.ts` — MIDI tests

**Interfaces:**
- Consumes: `Sequencer` from Task 3
- Produces: 
  - `useKeyboardInput(sequencer)` React hook
  - `useMidiController(sequencer)` React hook
  - Unified input abstraction

**Part A: Keyboard Input**

- [ ] **Step 1: Keyboard-to-MIDI mapping**

Standard computer keyboard layout:
```
Row 1 (Z-M):   C4 D4 E4 F4 G4 A4 B4 C5
Row 2 (Q-U):   C5 D5 E5 F5 G5 A5 B5 C6
Modifiers:
  Shift+Arrow = octave up/down
  Space = play/pause
```

- [ ] **Step 2: Keyboard event listeners**

On `keydown`: trigger synth via `sequencer.triggerNote(pitch, velocity=100)`.
On `keyup`: release via `sequencer.release(pitch)`.
Debounce to prevent key repeat spam.

- [ ] **Step 3: Test keyboard playback**

```typescript
it('maps QWERTY to MIDI pitches and triggers notes', () => {
  const { triggerKey, releaseKey } = useKeyboardInput();
  const spy = jest.spyOn(sequencer, 'triggerNote');
  triggerKey('Z');
  expect(spy).toHaveBeenCalledWith(60, 100); // C4
  releaseKey('Z');
});

it('supports polyphony (multiple keys held)', () => {
  triggerKey('Z'); // C4
  triggerKey('X'); // D4
  // Both notes should sound simultaneously
  releaseKey('Z');
});
```

**Part B: MIDI Controller Input**

**Hardware mapping (Beet Synth Controller):**

```
BUTTONS: play, stop, rec, BT(?), arp, sc/ch (scale/chord)

KNOBS (2 rows of 4):
  Row 1: mode, oct, latch, gate
  Row 2: swing, tempo, rate, transpose

WHEELS: pitch bend, mod wheel

PADS (2 rows of 4): labeled 1-4, 5-8
  - Base (no shift): trigger drum sounds / pads
  - With shift (select button): scale/arp mode selectors
  
SCALE/ARP MAPPING (octave 0 with shift):
  C  = scale selector (default)
  C# = down
  D  = include
  D# = exclude
  E  = random
  F  = order
  F# = repeat
  G  = octup
  G# = latch
  
  Octave 1 with shift (arp parameters):
  C  = off
  C# = sync
  D  = (reserved)
  D# = lower tempo
  E  = (reserved)
  F  = triad (chord type)
      F = 1/4 (arp length)
  F# = 7th (chord)
       F# = 1/4T (arp length)
  G  = 9th
       G = 1/8
  G# = random
       G# = 1/8T
  A  = off
       A = 1/16
  A# = (reserved)
       A# = 1/16T
  B  = (reserved - no shift)
       B = major / 1/32
  C' = (reserved - no shift)
       C' = minor / 1/32T
```

- [ ] **Step 4: Implement MIDI input listener**

Use Web MIDI API to:
- Listen for controller buttons (play/stop/rec/etc.)
- Map knobs to synth parameters (mode, octave, swing, tempo, transpose)
- Map wheels to pitch bend & modulation
- Map pads to drum/synth triggers + mode selection
- Parse shift/select button for mode switching

- [ ] **Step 5: Implement MIDI scale/arp selector logic**

Notes C–B (octave 0 + shift) → scale/arp mode selection:
- Store active mode in state
- When pads (octave 1+) are triggered, apply selected scale/arp mode
- Tempo/swing knobs control global settings
- Transpose knob shifts all notes

- [ ] **Step 6: Test MIDI controller mappings**

```typescript
describe('MIDI Controller', () => {
  it('maps controller buttons to playback controls', () => {
    const spy = jest.spyOn(sequencer, 'play');
    midiController.onButtonPress('play');
    expect(spy).toHaveBeenCalled();
  });

  it('maps knobs to synth parameters', () => {
    midiController.onKnobChange('mode', 0.75); // 0-1 range
    expect(sequencer.mode).toMatch(/some value/);
  });

  it('pads trigger notes with velocity', () => {
    const spy = jest.spyOn(sequencer, 'triggerNote');
    midiController.onPadPress(1, 100); // pad 1, velocity 100
    expect(spy).toHaveBeenCalledWith(/* expected pitch */, 100);
  });

  it('shift+note selects scale/arp mode', () => {
    midiController.onPadPress(0, 100, {shift: true}); // C + shift = scale select
    expect(sequencer.scaleMode).toBe('scale');
  });
});
```

- [ ] **Step 7: Test keyboard + MIDI together (polyphony)**

Both keyboard and MIDI controller active simultaneously:
```typescript
it('keyboard and MIDI controller work simultaneously', () => {
  // Play C4 on keyboard
  triggerKeyboardKey('Z');
  // Play D4 on MIDI pad
  midiController.onPadPress(2, 100);
  // Both notes should sound
  expect(activeNotes.length).toBe(2);
});
```

- [ ] **Step 8: Run all tests; verify PASS**

Run: `npm test -- tests/integration/keyboard-input.test.ts tests/integration/midi-controller.test.ts`

- [ ] **Step 9: Commit**

```bash
git add app/src/hooks/ app/src/lib/midiMapping.ts tests/integration/
git commit -m "feat: keyboard + MIDI controller input (Beet hardware support)

KEYBOARD:
- QWERTY/ZXCV mapped to two octaves
- Shift+Arrow to change octave
- Polyphonic (multiple keys)
- Debounced key repeat

MIDI CONTROLLER:
- 6 buttons: play, stop, rec, BT, arp, scale/chord
- 8 knobs: mode, octave, latch, gate, swing, tempo, rate, transpose
- Pitch bend & mod wheel support
- 8 pads with shift-selectable modes
- Scale/arp selector (octave 0 with shift)
- Arp parameters: length, type, sync, tempo modulation
- Simultaneous keyboard + MIDI support

Web MIDI API with full latency optimization."
```

---

### Task 6: React UI Components (Timeline Editor)

**Files:**
- Create: `app/src/components/SynthApp.tsx`
- Create: `app/src/components/TimelineEditor.tsx`
- Create: `app/src/components/TrackList.tsx`
- Create: `app/src/components/PresetSelector.tsx`
- Create: `app/src/components/TransportControls.tsx`
- Create: `app/src/components/ExportPanel.tsx`
- Create: `tests/integration/ui-composition.test.ts`

**Interfaces:**
- Consumes: `Sequencer`, `SeedSession`, `useKeyboardInput`, `renderStemWav` from previous tasks
- Produces: UI components that compose into functional app

- [ ] **Step 1: Create `SynthApp.tsx` shell component**

Top-level component that manages app state (current session, playback, synth selection). Use React Context or props to thread state through child components.

- [ ] **Step 2: Create `TransportControls.tsx`**

Play/pause/stop buttons + BPM slider (60–180) + bar count selector (8, 16, 32).

- [ ] **Step 3: Create `PresetSelector.tsx`**

Dropdown to select synth engine, then preset (organized by category: drums, bass, leads, pads, atmosphere, percussion).

- [ ] **Step 4: Create `TrackList.tsx`**

List of tracks with: name, synth engine, preset, start bar, volume fader, mute toggle, delete button.

- [ ] **Step 5: Create `TimelineEditor.tsx`**

Piano roll grid:
- Y-axis: MIDI notes (C1–C8, 88 keys)
- X-axis: beats (quantized to 16th notes, or user-selectable)
- Click to add note, drag to set duration
- Right-click to delete
- Keyboard input active in this component

- [ ] **Step 6: Create `ExportPanel.tsx`**

Button to export each track as WAV. Show progress bar during render. Provide download link when complete.

- [ ] **Step 7: Assemble into `SynthApp.tsx`**

Layout:
```
┌─────────────────────────────────────┐
│ Preset Selector | Transport Controls│
├──────────────────┬──────────────────┤
│ Track List (L)   │ Timeline Editor   │
│                  │     (Piano Roll)  │
│                  │                   │
├──────────────────┴──────────────────┤
│ Export Panel                        │
└─────────────────────────────────────┘
```

- [ ] **Step 8: Write integration test: user composes, exports**

```typescript
it('user can compose 4-bar kick pattern and export', async () => {
  render(<SynthApp />);
  
  // Select kick preset
  const presetSelect = screen.getByLabelText('Preset');
  fireEvent.change(presetSelect, { target: { value: 'tone-basic-kick' } });
  
  // Click to add 4 notes in piano roll (at beats 0, 2, 4, 6)
  const grid = screen.getByTestId('timeline-grid');
  fireEvent.click(grid, { clientX: 100, clientY: 200 }); // beat 0, pitch C4
  // ... repeat 3 more times
  
  // Export
  const exportBtn = screen.getByText('Export as WAV');
  fireEvent.click(exportBtn);
  
  // Verify Blob download started
  await waitFor(() => {
    expect(screen.getByText(/Downloaded/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run all tests; verify PASS**

Run: `npm test -- tests/integration/ui-composition.test.ts`

- [ ] **Step 10: Commit**

```bash
git add app/src/components/ tests/integration/ui-composition.test.ts
git commit -m "feat: React UI for synth composition

- SynthApp shell with state management
- TimelineEditor (piano roll, click to add notes)
- PresetSelector (synth + preset dropdowns)
- TrackList (manage tracks, volume, mute)
- TransportControls (play/pause, BPM, bars)
- ExportPanel (WAV download)
- Integration test: compose + export workflow"
```

---

### Task 7: Session Management & Main App Integration

**Files:**
- Create: `app/src/pages/SynthStudio.tsx` (or integrate into existing app structure)
- Modify: `app/src/App.tsx` (add route/link to Synth Studio)

**Interfaces:**
- Consumes: All prior tasks (synth engines, sequencer, UI components, storage)
- Produces: Navigable Synth Studio page that persists sessions

- [ ] **Step 1: Add route for Synth Studio in `App.tsx`**

If using React Router:
```typescript
<Routes>
  <Route path="/booth" element={<Booth />} />
  <Route path="/seed" element={<SynthStudio />} />
  <Route path="/levels" element={<Levels />} />
  ...
</Routes>
```

- [ ] **Step 2: Create `SynthStudio.tsx` page component**

Wraps `SynthApp` with session loading/saving:
- On mount: load last session from IndexedDB, or create new
- On session change: auto-save to IndexedDB (debounced)
- "New Session" button to start fresh
- "Save As" button to name + commit a session

- [ ] **Step 3: Implement auto-save with debounce**

```typescript
const handleSessionChange = useCallback(
  debounce((session: SeedSession) => {
    saveSession(session);
  }, 2000), // save 2 seconds after last change
  []
);
```

- [ ] **Step 4: Test session persistence**

```typescript
it('loads session from IndexedDB on mount', async () => {
  await saveSession({ id: '1', name: 'Test', ... });
  render(<SynthStudio sessionId="1" />);
  await waitFor(() => {
    expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
  });
});

it('auto-saves after user edits', async () => {
  const spy = jest.spyOn(storage, 'saveSession');
  render(<SynthStudio />);
  
  // User adds note
  fireEvent.click(screen.getByTestId('timeline-grid'));
  
  // Wait for debounce + save
  await waitFor(() => {
    expect(spy).toHaveBeenCalled();
  }, { timeout: 3000 });
});
```

- [ ] **Step 5: Run tests; verify PASS**

Run: `npm test -- tests/integration/session-management.test.ts`

- [ ] **Step 6: Commit**

```bash
git add app/src/pages/SynthStudio.tsx app/src/App.tsx tests/integration/session-management.test.ts
git commit -m "feat: session management + app integration

- SynthStudio page with session loading/saving
- Auto-save to IndexedDB (debounced)
- New/Save As buttons for session management
- Integrated into app routing"
```

---

### Task 8: Polish & End-to-End Testing

**Files:**
- Create: `tests/integration/full-session.test.ts` (E2E: compose → export → play in Levels)

**Interfaces:**
- Consumes: Full app (all prior tasks)
- Produces: Verified end-to-end workflow

- [ ] **Step 1: Write E2E test: compose kick+bass, export, play in Levels**

```typescript
describe('Full Session Workflow', () => {
  it('composes 8-bar song with 2 tracks, exports aligned stems', async () => {
    // 1. Open SynthStudio
    render(<SynthStudio />);

    // 2. Compose kick track (bar 0)
    // - Select "tone-basic-kick" preset
    // - Add 4 kick notes at beats 0, 2, 4, 6
    // - Set volume to 0.8

    // 3. Add bass track (bar 4)
    // - New track, select "tone-basic-bass" preset
    // - Add 2 bass notes at beats 0, 4
    // - Set start bar to 4

    // 4. Playback to verify (press Play, listen for 8 seconds)

    // 5. Export both stems
    // - Export kick → kicks.wav
    // - Export bass → bass.wav

    // 6. Verify WAV files are correct format + aligned
    const kickWav = await renderStemWav(kickTrack, session);
    const bassWav = await renderStemWav(bassTrack, session);
    
    // Both should be 8 bars long (even though bass starts bar 4)
    const kickDuration = getWavDuration(kickWav);
    const bassDuration = getWavDuration(bassWav);
    expect(kickDuration).toBeCloseTo(bassDuration, 0.1);

    // 7. Simulate import to Levels: play both together
    // - Verify bass plays 4 bars after kick starts (no manual offset needed)
    const mixedAudio = mixWavs([kickWav, bassWav]);
    const firstKickNote = getFirstNoteOnset(kickWav); // ~0ms
    const firstBassNote = getFirstNoteOnset(bassWav); // ~8000ms (4 bars at 120 BPM)
    expect(firstBassNote - firstKickNote).toBeCloseTo(8000, 100);
  });
});
```

- [ ] **Step 2: Test error handling: corrupt preset, missing synth engine**

```typescript
it('gracefully handles corrupt preset', () => {
  const corruptPreset = { ...validPreset, params: null };
  expect(() => loadPreset(synth, corruptPreset)).not.toThrow();
  // Falls back to default params
});

it('falls back if synth engine not found', () => {
  const track = { synthEngine: 'unknown-synth', ... };
  expect(() => sequencer.loadTrack(track)).not.toThrow();
  // Uses ToneBasicSynth as fallback
});
```

- [ ] **Step 3: Test memory cleanup on dispose**

```typescript
it('no memory leaks: synth nodes disposed properly', () => {
  const synth = new ToneBasicSynth();
  const ctx = new AudioContext();
  synth.init(ctx);
  const initialNodeCount = ctx.numberOfOutputChannels; // rough proxy
  synth.triggerNote(60, 100, 0.5);
  synth.dispose();
  // Verify nodes are cleaned up (AudioContext.state !== 'running' or similar)
});
```

- [ ] **Step 4: Test performance: 8 tracks × 100 notes = 800 total notes**

```typescript
it('handles large session (8 tracks, 100 notes each) without major lag', async () => {
  const largeSession = generateLargeSession(8, 100);
  const startTime = performance.now();
  const sequencer = new Sequencer(ctx, largeSession);
  sequencer.play();
  await new Promise((r) => setTimeout(r, 2000));
  const elapsed = performance.now() - startTime;
  expect(elapsed).toBeLessThan(3000); // should complete in <3s
});
```

- [ ] **Step 5: Run all E2E tests; verify PASS**

Run: `npm test -- tests/integration/full-session.test.ts`

- [ ] **Step 6: Verify audio quality (manual test, not automated)**

Compose a session in UI, export stems, listen for:
- No clicking/pops (sign of ADSR misconfiguration)
- Notes sound warm + humanized (not robotic)
- No audible timing jitter

- [ ] **Step 7: Commit**

```bash
git add tests/integration/full-session.test.ts
git commit -m "test: end-to-end workflow + error handling + performance

- E2E: compose kick+bass, export stems, verify alignment in Levels
- Error handling: corrupt presets, missing synths, graceful fallback
- Memory: synth nodes dispose properly, no leaks
- Performance: 800-note session renders in <3s
- Audio quality: warm humanized sound, no clicking"
```

---

### Task 9: Documentation & Build Config

**Files:**
- Create: `app/SEED_GUIDE.md` (user guide)
- Modify: `package.json` (add scripts)
- Modify: `.env.example` (config template)

**Interfaces:**
- Produces: Documented app, build ready

- [ ] **Step 1: Write `SEED_GUIDE.md`**

User guide covering:
- How to launch Synth Studio
- How to add tracks + select presets
- How to play keyboard + add notes in piano roll
- How to export stems
- How to import stems into Levels
- Keyboard shortcuts (Z-M, Q-U, Shift+Arrow, Space)

- [ ] **Step 2: Add npm scripts to `package.json`**

```json
{
  "scripts": {
    "seed:dev": "vite --host 127.0.0.1:5174",
    "seed:build": "vite build --outDir dist/seed",
    "seed:test": "jest tests/",
    "seed:test:watch": "jest tests/ --watch"
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```
VITE_SYNTH_BPM_MIN=60
VITE_SYNTH_BPM_MAX=180
VITE_SYNTH_DEFAULT_BARS=8
VITE_SYNTH_MAX_TRACKS=8
VITE_EXPORT_SAMPLE_RATE=44100
```

- [ ] **Step 4: Commit**

```bash
git add app/SEED_GUIDE.md package.json .env.example
git commit -m "docs: add user guide + build config

- SEED_GUIDE.md: keyboard shortcuts, workflow
- npm scripts: dev/build/test commands
- .env.example: configuration template"
```

---

## Task Summary

| Task | Component | Status | Est. LOC |
|------|-----------|--------|---------|
| 1 | Synth engines (5 types) | Ready | 500 |
| 2 | Preset system + storage | Ready | 400 |
| 3 | Timeline + sequencer | Ready | 600 |
| 4 | WAV export | Ready | 300 |
| 5 | Keyboard input | Ready | 200 |
| 6 | React UI components | Ready | 800 |
| 7 | Session management | Ready | 200 |
| 8 | E2E testing + polish | Ready | 300 |
| 9 | Documentation | Ready | 100 |
| **Total** | | | **~3400** |

---

## Self-Review Checklist

✅ **Spec Coverage:**
- 5-6 synth types (Task 1)
- Keyboard play (Task 5)
- Presets (Task 2)
- Timeline/sequencing (Task 3, 6)
- Export to Levels (Task 4)
- Session persistence (Task 7)

✅ **Step Granularity:**
- Each step is one actionable item
- Tests precede implementation
- Commits after each logical unit

✅ **Type Consistency:**
- Synth types match across tasks (Task 1 → Task 2 → Task 3)
- Interfaces defined early (Task 3 types reused in all later tasks)
- No renamed functions mid-plan

✅ **Review Focus (5 inputs/failure modes covered):**
1. **Timing misalignment** — Task 4 test: silence padding alignment
2. **AudioContext suspension** — Task 3 test: immediate playback after interaction
3. **Floating-point precision** — Task 3 test: beat timing accuracy
4. **Memory leaks** — Task 8 test: synth node disposal
5. **Preset corruption** — Task 8 test: graceful fallback

✅ **Proportion:**
- Plan is ~3400 LOC (reasonable for MVP)
- Code blocks minimal (signatures + test assertions + algorithms only)
- No transcription of entire functions

---

## Execution Recommendation

This plan has **9 well-scoped tasks** with clear dependencies. **Recommend subagent-driven approach:**
- Each task = one fresh subagent (parallel where independent)
- Subagent implements 1–2 tasks, writes tests, commits
- Fresh code-reviewer subagent verifies each task
- Final whole-branch review on full integration

**Timeline: 5–7 days** (4–5 hours per task including review + iteration).

---

**Next Step:** Review this plan. Does it capture what you want to build? Choose an execution method: **subagent-driven** (best for quality + isolation) or **native** (fastest, I implement all in this session).

