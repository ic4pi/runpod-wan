# Grocery Ecosystem Integration Guide

## Current product boundaries

- **Grocery:** real-audio beat catalog, non-exclusive leases, and licensed beat downloads.
- **Sprouts:** vocal recording and vocal exports.
- **Pastry:** mixing and mastering.
- **Beet:** existing synth/drum code retained; its addition is delayed, not deleted.

Do not move vocal recording into Grocery. Do not use Grocery's old, unused synthesizer files to create catalog inventory.

## Current handoff

```text
Grocery
  previews a real beat recording
  sells a non-exclusive lease through Stripe
  downloads the original beat + license ZIP
        ↓
Sprouts
  imports the licensed beat
  records and exports vocals
        ↓
Pastry
  imports the beat and vocal audio
  mixes, masters, and exports the finished song
```

The handoff is file-based. Grocery links to `/sprouts/`; it does not silently create a Sprouts session or claim an automatic import that is not implemented.

## Licensed beat ZIP

After the buyer's license is returned by `api/beat-license.ts`, Grocery creates:

```text
<beat-slug>.<original-audio-extension>
LICENSE.txt
purchase.json
READ-ME.txt
```

`purchase.json` contains the database-backed license record: license ID, beat ID and title, producer, licensee, grant time, and terms version. `READ-ME.txt` directs the buyer to record vocals in Sprouts.

The original beat remains producer-owned. The buyer's new lyrics and vocal performance remain the buyer's. The included license wording must be reviewed before commercial use.

## Catalog activation

Catalog entries live in `lib/beats.ts`. A slot becomes previewable and sellable only when it has a non-empty `audioUrl` pointing to a real recording.

```ts
{
  id: 'backseat-gospel',
  // ...title, producer, genre, bpm, key, priceCents, art
  audioUrl: '/beats/backseat-gospel.mp3'
}
```

Place that file at `grocery/public/beats/backseat-gospel.mp3`. Missing files fail honestly; the app does not render replacement audio.

## Payment and ownership boundary

- `api/beat-checkout.ts` reads the price and sellability from the server catalog.
- `api/stripe-webhook.ts` verifies the Stripe signature and paid session before writing a lease.
- `grocery_beat_licenses` is separate from module entitlements.
- Buyer reads use the buyer token and row-level security.
- Lease writes use the service-role key on the server only.
- Duplicate buyer/beat pairs are idempotent, so webhook retries are safe.
- Missing configuration or verification fails closed.

## Audio delivery

The current store uses the catalog `audioUrl` for both the 30-second preview and the licensed original-file download. If full recordings must not be publicly reachable, split these into:

1. A public, limited preview file.
2. A private original file delivered through an authorized server endpoint or short-lived signed URL after license verification.

Do not describe private delivery as implemented until that endpoint and its authorization tests exist.

## Module formats

Sprouts, Pastry, and Beet retain their existing audio/session formats and module-specific documentation. This store refactor does not redesign those modules or change their recorder, mixer, MIDI, or session code.
