# Produce Ecosystem Integration Guide

**For builders of Sprouts (vocals) and Processed/Preserved (mixer)**

---

## Overview

**Produce** is a three-app music creation suite:

- 🍠 **Beet** — Synth + drum composition (done)
- 🌱 **Sprouts** — Vocal recording + SFX (in development)
- 🧀 **Processed/Preserved** — Multi-track mixing + mastering (in development)

All apps work together seamlessly. This guide explains the data formats, APIs, and integration points.

---

## Data Flow

```
Beet (synth)
  ↓ exports stems (WAV) + metadata
Processed/Preserved (mixer)
  ↓ imports stems + MIDI data
Processed/Preserved (mixer)
  ↓ combines with Sprouts recordings
  ↓ exports master mix
Final Output (MP3 / WAV)
```

---

## Stem Export Format (Beet → Processed/Preserved)

**File:** `.wav` (44.1 kHz, 16-bit, stereo)

**Metadata:** Each stem includes timing information:

```json
{
  "sessionName": "Song 1",
  "bpm": 120,
  "barCount": 8,
  "exportedAt": 1699446789,
  "tracks": [
    {
      "id": "track-1",
      "name": "Kick",
      "synthEngine": "tone-basic",
      "presetName": "Deep Kick",
      "startBar": 0,
      "duration": 16.0,  // seconds (8 bars at 120 BPM)
      "offsetSeconds": 0.0
    },
    {
      "id": "track-2",
      "name": "Bass",
      "synthEngine": "tone-basic",
      "presetName": "Sub Bass",
      "startBar": 4,
      "duration": 16.0,
      "offsetSeconds": 8.0  // 4 bars * 2 seconds/bar at 120 BPM
    }
  ]
}
```

**Key points:**
- All stems are **same total duration** (barCount * seconds_per_bar)
- `offsetSeconds` = (startBar * 60 / BPM / 4) — silence padding at start
- No manual timing adjustments needed in Processed/Preserved
- Stems are pre-aligned and ready to layer

---

## MIDI Export Format (Beet → Processed/Preserved)

**File:** `.mid` (Standard MIDI format)

**Per-track MIDI:**
- Note on/off with velocity
- Timing preserved from timeline
- `offsetSeconds` encoded as delay before first note

**Use case:** Re-synthesize or edit synth notes in Processed/Preserved.

---

## Vocal Recording Format (Sprouts → Processed/Preserved)

**Expected inputs from Sprouts:**

```json
{
  "vocal_tracks": [
    {
      "id": "vocal-1",
      "name": "Lead Vocal",
      "file": "lead_vocal.wav",
      "startBar": 0,
      "offsetSeconds": 0.0,
      "duration": 16.0,
      "metadata": {
        "recordedAt": 1699446800,
        "sampleRate": 44100,
        "channels": 2,
        "effects": ["reverb", "compression"]  // optional
      }
    }
  ]
}
```

**Format:** 44.1 kHz, 16-bit WAV (same as Beet stems for consistency)

---

## Processed/Preserved Integration Points

**Input:**
1. Import Beet stems (WAV + metadata JSON)
2. Import Sprouts recordings (WAV + metadata JSON)
3. Layer them on a timeline (all pre-aligned, no manual sync needed)

**Processing:**
- Apply EQ, compression, reverb per track
- Master bus processing
- Export final mix

**Output:**
- Master mix (WAV or MP3)
- Optional: bounced stems (for re-import to Beet for re-mixing)

**Key requirement:** All input stems must have **same duration** and **offsetSeconds** for automatic alignment.

---

## Timing Synchronization

**Rule:** All stems across all apps use the same BPM + bar count.

**Example (120 BPM, 8 bars):**
- 1 bar = 2 seconds
- 8 bars = 16 seconds total
- All stems (Beet, Sprouts) = 16 seconds duration
- Track starting at bar 4 = 8 seconds of silence + 8 seconds of audio

**Processed/Preserved automatically aligns** using `offsetSeconds` from metadata. No manual adjustment needed.

---

## MIDI Controller Support

**Beet supports:**
- 6 buttons, 8 knobs, 2 wheels, 8 pads
- Scale/arp selectors (octave 0 with shift)
- Full hardware control

**Sprouts should consider:**
- Bluetooth MIDI input (if recording from hardware)
- Same hardware controller mapping (for consistency across suite)

**Processed/Preserved should consider:**
- Knobs for real-time mixing (faders, gain, pan)
- Pads for quick access to presets/scenes
- Same controller protocol for unified workflow

---

## File Organization

**Recommended directory structure:**

```
produce/
├── beet/              # Synth app (live)
│   ├── app/
│   ├── docs/
│   └── README.md
├── sprouts/           # Vocal recording app (in dev)
│   ├── app/
│   ├── docs/
│   └── README.md
├── aged-preserved/    # Mixer app (in dev)
│   ├── app/
│   ├── docs/
│   └── README.md
├── PRODUCE_INTEGRATION.md  # this file
└── README.md          # umbrella guide
```

---

## Data Persistence

**IndexedDB Naming Convention:**

- Beet: database `'beet-studio'`
- Sprouts: database `'sprouts-studio'`
- Processed/Preserved: database `'aged-preserved-studio'`

**Cross-app linking:**
- Store session IDs in metadata so Processed/Preserved can reference Beet session
- Example: `{ "source_beet_session": "abc123", ... }`

---

## Browser Compatibility

**All apps require:**
- Chrome 90+, Firefox 88+, Safari 14+
- Web Audio API support
- IndexedDB support
- (Optional) Web MIDI API for hardware controllers

---

## Future Roadmap

- **Grocer** (education app) — hints + music theory guidance (listens to all apps)
- **Bluetooth MIDI** latency optimization across all apps
- **Cloud sync** — optional save/share (future, optional)
- **AI sound generation** — "describe a sound" → synth params (future)

---

## Questions?

Contact the Beet team or see `PRODUCE_INTEGRATION.md` in the main produce/ repo.

Happy building! 🍠🌱🧀

