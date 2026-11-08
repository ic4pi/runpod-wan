# Seed: Synth Composition App — Design Spec

**Date:** 2026-11-07  
**Project:** Produce Ecosystem (Seed + Levels Studio + Education Coach)  
**Status:** Design Review

---

## Executive Summary

**Seed** is a web-based synthesizer composition app that integrates with Levels Studio for mixing. Users compose music using 5-6 open-source synth engines, arrange tracks on a timeline, and export as both audio stems (WAV) and MIDI for maximum flexibility. Auto-applied humanization and effects ensure professional-sounding output without manual tweaking.

---

## 1. Core Vision

### Purpose
Democratize music composition by providing professional-grade synthesis in the browser, seamlessly integrated with Levels Studio's mixing capabilities.

### User Journey
1. **Compose:** Pick a synth engine (Seed), create sounds on a timeline
2. **Arrange:** Set track start times (drums bar 1, bass bar 5, etc.)
3. **Export:** Get both audio stems (ready to mix) + MIDI (for tweaking)
4. **Mix in Levels:** Import stems into Levels Studio, mix/process
5. **Learn:** Coach layer provides contextual guidance throughout

### Success Criteria
- User composes a 16-bar song with 3-4 synth tracks in <30 minutes
- Exported stems align perfectly in Levels Studio (no manual timing adjustments)
- Output sounds professional (warm, analog-feeling, not synthetic)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────┐
│         Seed (Synth App)            │
├─────────────────────────────────────┤
│ • Synth Engine Selector             │
│ • Timeline Editor (BPM, bars)       │
│ • Keyboard Input / Piano Roll       │
│ • Preset Manager                    │
│ • Audio Preview & Effects           │
│ • Export (WAV stems + MIDI)         │
└─────────────────────────────────────┘
           ↓↓↓ (stems)
┌─────────────────────────────────────┐
│    Levels Studio (Mixer)            │
├─────────────────────────────────────┤
│ • Stem Import (audio + MIDI)        │
│ • Multi-track Mix/EQ/Compression    │
│ • Master Processing                 │
│ • Recording & Export                │
└─────────────────────────────────────┘
           ↑↑↑
┌─────────────────────────────────────┐
│  Education Coach (Guidance Layer)   │
├─────────────────────────────────────┤
│ • Contextual Tips (composition)     │
│ • Music Theory Hints                │
│ • Song Structure Suggestions        │
│ • Mixing Best Practices             │
└─────────────────────────────────────┘
```

---

## 3. Feature Specification

### 3.1 Synth Engine Integration

**Selected Open-Source Synths** (5-6 modules):
1. **Surge XT** — analog-modeling, versatile (bass, leads, pads)
2. **Vital** — wavetable synth, high-quality (leads, arps, bells)
3. **Helm** — polyphonic synth, warm (pads, strings, atmospheres)
4. **Tone.js Custom** — simple oscillator-based (drums, simple tones)
5. **Web Audio API Native** — basic synth for fallback
6. **Chiptune Synth** — retro/chip sounds (percussion, arps)

**Implementation Strategy:**
- Use Tone.js as the primary Web Audio wrapper
- Integrate open-source presets (JSON-based synth parameters)
- Each synth engine stores presets categorized by sound type:
  - Drums (kicks, snares, hi-hats)
  - Bass (subs, basses, deep tones)
  - Leads (melodic, cutting, bright)
  - Pads (ambient, strings, textures)
  - Atmosphere (reverb-rich, evolving)
  - Percussion (hits, strikes, effects)

### 3.2 Timeline & Composition

**Timeline Structure:**
- **BPM Selector:** 60–180 BPM (default 120)
- **Bar Count:** 8, 16, or 32 bars (user selectable)
- **Tracks:** Up to 8 simultaneous synth tracks
- **Per-Track Settings:**
  - Start bar (drum track starts bar 1, bass bar 5, lead bar 9, etc.)
  - Synth engine choice
  - Preset selection
  - Volume/pan (basic mixing before export)
  - Mute/solo

**Visual Layout:**
- Piano roll grid (bars × beats)
- Drag-and-drop note entry or keyboard input
- Horizontal timeline scrubber for playback
- Track list on left (collapse/expand)

### 3.3 Input Methods

**Keyboard Input:**
- Computer keyboard acts as piano (Z=C4, X=D4, C=E4, etc.)
- QWERTY row = octave up, ASDF row = octave down
- Space = play/pause
- Shift+Arrow = adjust octave

**Piano Roll (Mouse/Touch):**
- Click to add note, drag to set duration
- Adjust velocity via vertical position
- Right-click to delete

**MIDI Input (Hardware):**
- Connect USB/wireless MIDI keyboard
- Notes trigger synth in real-time
- Velocity → dynamics mapping

### 3.4 Auto-Processing (Built-In)

Every synth track runs through this chain **by default** (transparent to user):

**Humanization:**
- Timing offset: ±10–30ms random per note (adjustable via slider)
- Velocity variation: ±5–15% random (adjustable)
- Note length variation: ±50–100ms (adjustable)

**Effects Chain (per track):**
1. **Saturation** (warmth) — simulates analog tape, adds harmonics
2. **Compression** — glues notes, controls dynamics
3. **EQ** — slight bass boost (warmth), treble cut (softness)
4. **Convolution Reverb** — small room space (10–30% wet)

**Layering (Drums Only):**
- Kick drum auto-layered with sub bass (80–120Hz layer)
- Snare auto-layered with transient enhancer
- Creates perceived "thickness"

**User Controls:**
- Master "Warmth" slider (humanization + saturation amount)
- Master "Space" slider (reverb amount)
- Master "Glue" slider (compression amount)
- Per-track override toggles (optional fine-tuning)

### 3.5 Presets & Patching

**Preset System:**
- Each synth engine has 20–50 presets (curated from open-source packs)
- Organized by category: drums, bass, leads, pads, atmosphere, percussion
- User can create/save custom presets (stored in IndexedDB)
- Preset name + description shown on hover

**Patch Management:**
- Save "Sessions" (full arrangements with all tracks + settings)
- Load session → restore all synth choices, presets, timeline
- Sessions stored in IndexedDB (browser local storage)

### 3.6 Export

**Export Options:**

**Option A: Audio Stems (WAV)**
- One WAV file per track
- **Silence/Padding:** Each stem includes leading silence to preserve timeline alignment
  - Example: Bass track starts bar 5 → 4 bars of silence + audio
  - Result: All stems are same length; auto-align in Levels
- 44.1 kHz, 16-bit, stereo
- Auto-apply humanization + effects during render

**Option B: MIDI Stems**
- One MIDI file per track
- Contains: note on/off, velocity, timing
- Preserves: start bar offset (via MIDI delay/CC data or metadata)
- User can re-synthesize or edit in Levels/another DAW

**Option C: Combined Export**
- ZIP file with all stems (both WAV + MIDI for each track)
- Metadata file (JSON) with BPM, bar count, track names, synth choices

---

## 4. Integration with Levels Studio

### Data Flow
```
Seed Export (stems + metadata)
    ↓
Levels Import Panel
    ↓
    ├─ Read stems (auto-detect alignment via metadata)
    ├─ Read MIDI (for re-synthesis if desired)
    └─ Load into Stems/Mixdown section
    ↓
Levels Mixing (EQ, compression, master processing)
    ↓
Export mixed audio
```

### Levels Modifications (Minor)
- **Stems Import:** Accept MIDI files in addition to audio
- **Metadata Panel:** Show BPM, track names, synth source (informational)
- **MIDI Re-synthesis:** Optional; users can re-render MIDI with Levels' own synths if available

---

## 5. Education Coach Layer (Future MVP+)

**Scope:** Contextual guidance while using Seed and Levels.

**Triggers & Content:**
- **Seed Composing:** "You've placed 3 tracks. Consider adding a pad for atmosphere."
- **Track Start Times:** "Drums at bar 1, bass at bar 5, lead at bar 9 = classic song structure."
- **Mixing in Levels:** "Bass and kick are fighting at 80Hz. Try EQ cuts."
- **Song Structure Tips:** "Verse (bars 1–8) → Chorus (bars 9–16) = solid arrangement."
- **Composition Theory:** "You're in C major. These notes fit."

**Stored as:** Text snippets + occasional video tips in a sidebar or tooltip system. Requires a content database (scope TBD for MVP+).

---

## 6. Technical Stack

### Frontend
- **Framework:** React 19 + TypeScript (match Levels Studio)
- **Web Audio:** Tone.js (abstraction) + custom Web Audio API for synths
- **State:** React Context (similar to Levels) + IndexedDB for persistence
- **UI Components:** shadcn/ui (match Levels design system)
- **Styling:** Tailwind CSS (match Levels)

### Synth Engines
- **Tone.js Synth:** Primary (polyphonic, easy to control)
- **Web Audio API oscillators:** Manual synth implementation for variety
- **Preset Format:** JSON (parameters like frequency, envelope, filter cutoff)

### Export
- **WAV Encoding:** Custom WAV writer (or use `wavesurfer.js` library)
- **MIDI Encoding:** Use `jsmidgen` or `Tone.js` MIDI export
- **Padding Calculation:** (track start time) × (samples per beat) = leading silence

### Storage
- **IndexedDB:** Sessions, custom presets, auto-save drafts
- **LocalStorage:** UI preferences (zoom, last opened session)

---

## 7. MVP Scope (Phase 1)

**In Scope:**
- 3 synth engines (Tone.js basic, Tone.js wavetable, custom oscillator)
- Timeline editor (8–16 bars, up to 8 tracks)
- Keyboard + piano roll input
- 10–15 presets per synth (curated)
- Auto-humanization + effects (all baked in)
- WAV stem export (with silence padding)
- MIDI export (basic)
- Session save/load (IndexedDB)
- Integration with Levels (import stems)

**Out of Scope (Phase 2+):**
- Hardware MIDI input (add later)
- Full open-source synth module compilation (stick with Tone.js for MVP)
- Coach education layer (defer to post-launch)
- VST plugin wrapper (desktop integration)
- Cloud sync (sessions stay local-only for MVP)

---

## 8. Data Model

### Session (IndexedDB)
```typescript
interface SeedSession {
  id: string;
  name: string;
  bpm: number;
  barCount: number;
  createdAt: number;
  updatedAt: number;
  tracks: SeedTrack[];
}

interface SeedTrack {
  id: string;
  name: string;
  synthEngine: 'tone-basic' | 'tone-wavetable' | 'custom-osc';
  presetId: string;
  startBar: number;
  notes: SeedNote[];
  volume: number;
  pan: number;
  muted: boolean;
}

interface SeedNote {
  pitch: number; // MIDI note number (0–127)
  startBeat: number;
  duration: number;
  velocity: number; // 0–127
}
```

### Export Metadata
```typescript
interface ExportMetadata {
  sessionName: string;
  bpm: number;
  barCount: number;
  exportedAt: number;
  tracks: {
    name: string;
    synthEngine: string;
    presetName: string;
    startBar: number;
    duration: number; // in seconds
  }[];
}
```

---

## 9. Testing Strategy

### Unit Tests
- Humanization calculations (timing offsets, velocity variation)
- WAV silence padding (correct duration + alignment)
- MIDI export (note timing, velocity mapping)
- Preset loading and parameter application

### Integration Tests
- Synth engine initialization and audio output
- Timeline playback (seek, pause, loop)
- Session save/load from IndexedDB
- Export → re-import into Levels

### Manual Testing (UAT)
- Compose 16-bar song with 3 tracks
- Export WAV stems → import into Levels → verify alignment (no manual adjustment needed)
- Export MIDI → verify playback in Levels or DAW
- Verify humanization is audible (notes don't sound robotic)
- Verify effects (warmth, space, glue) improve audio quality

---

## 10. Success Metrics (Post-Launch)

- Users compose sessions averaging 8+ bars
- Export success rate > 95% (no corrupted stems)
- Average session length increasing over time (users extend beyond 16 bars)
- User retention: >40% return after first session
- Levels integration: >30% of Seed exports imported into Levels

---

## 11. Open Questions & Decisions Needed

1. **Coach Education:** Text-only hints or include video tutorials? (Scope impact)
2. **Synth Module Count:** Start with 3 (Tone.js variants) or stretch to 5-6 open-source engines?
3. **Preset Curation:** Do we source presets from open-source packs or create our own?
4. **Hardware MIDI:** MVP without, or include basic MIDI input support?
5. **Naming:** Confirm "Seed" or choose from brainstorming angles?
6. **Color/Theming:** Match Levels Studio (dark mode, teal accents) or distinct branding?

---

## 12. Timeline Estimate

- **Design Refinement:** 1 week (post-approval)
- **Core Implementation:** 4–5 weeks
  - Synth engine setup (1 week)
  - Timeline UI + editing (1.5 weeks)
  - Export pipeline (1 week)
  - Effects/humanization (1 week)
  - Testing + polish (0.5 weeks)
- **Integration with Levels:** 1 week
- **Buffer:** 1 week

**Total MVP:** ~7–8 weeks

---

## Appendix: Open-Source Synth Resources

- **Tone.js:** https://tonejs.org (polyphonic, presets available)
- **Surge XT Presets:** https://github.com/surge-synthesizer (JSON export)
- **Vital Presets:** https://github.com/tytel/vital (wavetable bank)
- **Free Drum Kits:** Loopmasters, XLN Audio, 99 Sounds (licensing varies)

---

**Next Step:** User review + approval. Then proceed to implementation planning.
