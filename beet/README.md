# Beet — synth and drums

Make beats in the browser. Step grid, 5 sound engines, drum kits, 19 presets, up to 8 tracks.

- **Engines:** Warm, FM Bell, Analog, Chiptune, Drum Kit (plain Web Audio, no Tone.js)
- **Tracks:** volume, pan, mute, solo, per-track sound. Bars: 1, 2, 4, 8 or 16. BPM 60 to 180.
- **Input:** tap the grid, or play from the computer keyboard (A to L, Z/X octave, Space play). Rec records keys into the loop.
- **Export:** Mixdown WAV, or a Produce session zip (`stems/*.wav` + `session.json`) that Bakery imports.
- Playback and export share one code path, so stems line up with what you heard.
- The session autosaves on this device (one project).

`npm ci && npm run dev` · `npm run build`
