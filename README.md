# 🍠 Produce Ecosystem

**Beet** — A browser-based synthesizer & composition tool for creating multi-track music.

Part of the **Produce** suite: a collection of interconnected music creation apps built on open-source tools and web standards.

---

## 🎵 Beet Synth

**Beet** is a real-time polyphonic synthesizer that lets you compose music using 5 distinct synth engines, arrange tracks on a timeline, and export stems for mixing.

### Features

- **5 Synth Engines**
  - **Tone Basic** — Warm, smooth polyphonic synth (ADSR)
  - **Tone Wavetable** — Bright FM synthesis (bell-like tones)
  - **Custom OSC** — Analog-style oscillator with dynamic filters
  - **Chiptune** — 8-bit retro/game sounds
  - **Noise Perc** — Percussion hits & textural noise

- **Timeline Composition**
  - Arrange 8 simultaneous tracks
  - 8–32 bars, BPM 60–180
  - Per-track start times (drums bar 1, bass bar 5, etc.)

- **Real-Time Playback**
  - Keyboard input (QWERTY/ZXCV → piano keys)
  - Polyphonic (multiple notes at once)
  - Auto-humanization (timing variation, velocity modulation)

- **Presets & Sessions**
  - 50+ curated sounds (drums, bass, leads, pads, atmosphere, percussion)
  - Save/load sessions to browser storage (IndexedDB)

- **WAV Export**
  - Export each track as 44.1 kHz WAV
  - Automatic silence padding for timeline alignment
  - Ready to import into **Levels** mixer

### Quick Start

```bash
git clone https://github.com/ic4pi/produce.git
cd produce/app
npm install
npm run dev
```

Navigate to `http://localhost:5173` and start composing.

### Tech Stack

- **React 19** + TypeScript
- **Tone.js** (Web Audio API abstraction)
- **Web Audio API** (native synthesis)
- **IndexedDB** (session persistence)
- **shadcn/ui** (UI components)
- **Tailwind CSS** (styling)

### Project Status

**MVP Phase 1 — Core Synth Engine Complete** ✅

- [x] Task 1: 5 synth engines with Tone.js (52 tests, all passing)
- [ ] Task 2: Preset system + IndexedDB storage
- [ ] Task 3: Timeline & sequencer
- [ ] Task 4: WAV export with silence padding
- [ ] Task 5: Keyboard input handling
- [ ] Task 6: React UI (timeline editor, controls)
- [ ] Task 7: Session management
- [ ] Task 8: End-to-end testing
- [ ] Task 9: Documentation

### Integration with Aged/Processed Cheese

Beet exports stems (audio files) that are pre-aligned for import into **Aged/Processed Cheese** — our mixing & mastering app. No manual timing adjustments needed. Layer Beet synth tracks with Sprouts vocals, then mix & master in Aged/Processed Cheese.

### Future Roadmap

- **Bluetooth MIDI** support (lowest-latency controller mapping)
- **AI sound generation** (describe sounds, Beet generates synth parameters)
- **Preset sharing** (community sound library)
- **Advanced effects** (reverb, delay, compression per-track)

### Development

Run tests:
```bash
cd app
npm test
```

Build for production:
```bash
npm run build
```

### License

Open source. See LICENSE file.

### Contributing

Beet is built as an open-source project. Contributions welcome — see CONTRIBUTING.md.

---

## Produce Ecosystem

**Beet** is the synthesis & composition layer of Produce:

- 🍠 **Beet** — Synth engines + drum patterns/loops (you are here)
- 🌱 **Sprouts** — Vocal recording + sound effects
- 🧀 **Aged/Processed Cheese** — Multi-track mixing + mastering

All apps are browser-based, free, and offline-capable.

---

**Questions?** Check `app/SEED_GUIDE.md` for keyboard shortcuts and workflow.

Made with ❤️ and Web Audio API.
