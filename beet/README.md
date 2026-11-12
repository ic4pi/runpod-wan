# Beet — synth and drums

Make beats in the browser. 5 sound engines, 51 presets, up to 8 tracks.

- **Sound:** Warm, FM Bell, Analog, Chiptune and a Drum Kit engine (plain Web Audio). Presets are level-matched.
- **Tracks:** volume, pan, mute, solo, reverb, delay, "Feel" (human timing), and an "Enters at bar" setting. Bars: 1, 2, 4, 8 or 16. BPM 60 to 180.
- **Editing:** draw on the grid, or use Edit notes to change a note's length and velocity. Copy a bar onto another, duplicate a track, undo and redo (Ctrl/Cmd+Z).
- **Input:** tap the grid, the computer keyboard (A to L, Z/X octave, Space play), or a MIDI keyboard or pad (Web MIDI). Rec records into the loop.
- **Export:** Mixdown WAV, MIDI file (.mid), or a Grocery session zip (`stems/*.wav` + `session.json`) that Pastry imports.
- Live play and export share one code path, so stems line up with what you heard.
- The session autosaves on this device (one project).

`npm ci && npm run dev` · `npm test` · `npm run build`
