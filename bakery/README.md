# Levels — Pocket Studio

A mobile-first PWA recording studio for artists without a studio. Record vocals
on a phone, pick a sound template, and get a mixed, limited master back —
entirely on-device via the Web Audio API. No servers, no accounts, no AI
generation.

## Sections
- **Booth** — mic capture (dry), live light-chain monitoring, reactive halo
  visualizer, auto-mix on stop, dry/mixed A/B, keep/share/WAV export.
- **Mixdown** — stem upload (up to 8), filename-based role detection
  (vocal/beat/bass), per-role buses, glue + limiter master, WAV out.
- **Vault** — takes persisted on-device in IndexedDB; play/share/download/delete.

## Tech
React + TypeScript + Vite + Tailwind. Audio: Web Audio API (live chain +
OfflineAudioContext render: HPF, template EQ, analysis-scaled de-ess, dynamics,
tanh saturation, convolver space, glue comp, limiter, peak normalization to
template ceiling). PWA: vite-plugin-pwa (network-first HTML, precached assets,
cache-first fonts), wake lock during recording, Web Share API with download
fallback.

## Run
npm run dev — develop · npm run build && npm run preview — production
