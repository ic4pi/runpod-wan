# 🍠 Produce Ecosystem

**Produce** is a modular music creation platform built on web standards. Free hub with paid composition, recording, and mastering modules.

---

## Quick Overview

**Produce** (FREE) — 6-track mixer
- Record basic vocals (no effects)
- Upload 5 backing tracks
- Volume + pan mixing
- Save + download

**Paid Modules** (one-time purchase):
- 🎹 **Beet** — Synth composition (5 engines, timeline, patterns)
- 🎤 **Sprouts** — Advanced vocal recording (effects, templates, layers)
- 🎛️ **Bakery** — Mixing + mastering (EQ, compression, master processing)
- 🎰 **Diced** — Sampler + loops (one-time now → subscription later with sound packs)

**Grocer** — Education layer (integrated guidance + tutorials across all modules)

---

## Development

### Project Structure

```
produce/           (FREE hub — main app)
sprouts/           (PAID module — advanced vocals)
beet/              (PAID module — synths, in progress)
bakery/            (PAID module — mixing/mastering, planned)
diced/             (PAID module — sampler/loops, planned)
```

### Quick Start

```bash
# Install dependencies for all modules
npm install

# Run Produce hub in dev mode
cd produce
npm run dev

# Build for production
npm run build
```

### Tech Stack

- **React 19** + TypeScript
- **Vite** (build tool)
- **Tone.js** (Web Audio API synthesis)
- **Web Audio API** (native audio processing)
- **IndexedDB** (local session storage)
- **shadcn/ui** + **Tailwind CSS** (UI)

---

## Module Details

### Produce (Free Hub)
- 1 vocal recording track (plain, no effects/templates)
- 5 backing track slots (upload or import from Beet)
- Volume + pan per track
- Drag-to-arrange, cut/copy/paste
- Save sessions locally
- Download final mix as WAV

### Sprouts (Paid)
- Advanced vocal recording with effects
- Multiple takes and layers (lead, double, backup, ad-lib)
- Effect inserts (reverb, compression, EQ)
- Vocal templates for different genres
- MIDI controller support
- Export integration with Produce hub

### Beet (Paid)
- 5 synth engines (Tone Basic, Wavetable, Custom OSC, Chiptune, Noise Perc)
- Timeline sequencer (8-32 bars, 60-180 BPM)
- 8 simultaneous tracks
- 50+ presets (drums, bass, leads, pads, atmosphere, percussion)
- MIDI keyboard + controller support
- WAV + MIDI export (ready for Bakery)

### Bakery (Paid)
- Multi-track mixing
- Per-track EQ, compression, effects
- Master bus processing
- Stem export + bouncing
- WAV + MP3 export

### Diced (Paid, One-Time → Subscription)
- User sample upload + library
- Trim, stretch, pitch, loop manipulation
- Sound pack subscriptions (future)
- Project saving in cloud

---

## Deployment

**Production:** Vercel monorepo deployment
- Produce hub serves at `/` (primary app)
- Modules accessible via routing/UI
- Free tier data stored in IndexedDB (on-device)
- Paid modules gated by licensing logic

```bash
# Deploy to production
git push github main
```

Vercel auto-deploys on main branch push. See `vercel.json` for build config.

---

## Pricing Model

**Free Tier:**
- Produce hub forever
- 6 tracks, basic mixing, save locally

**Paid Modules:**
- One-time purchase: $3.99–$5.99 each (pricing TBD)
- Unlock full feature sets (effects, templates, advanced editing)

**Future Subscription (Diced):**
- Pro sound packs
- Cloud project saving
- Premium presets + templates

---

## Documentation

- **Produce Hub:** See `produce/README.md`
- **Sprouts:** See `sprouts/README.md`
- **Integration Guide:** See `PRODUCE_INTEGRATION.md`

---

## Architecture

Each module is a self-contained React app with:
- Its own `package.json` + build config
- Local IndexedDB database (module-namespaced)
- Produce session export format (Produce-compatible metadata)
- Vercel deployment config

Modules communicate via:
- Export/import of WAV + metadata files
- Shared `Produce` session format (44.1 kHz, 16-bit, stereo)
- No cross-module real-time communication

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- (Web Audio API + IndexedDB required)

---

**Made with ❤️ and Web Audio API.**

For issues or contributions, see GitHub: https://github.com/ic4pi/runpod-wan
