# Grocery Ecosystem Integration Guide

## Current product boundaries

- **Grocery:** real-audio beat catalog, non-exclusive leases, and licensed beat downloads.
- **Sprouts:** vocal recording and vocal exports.
- **Pastry:** mixing and mastering.
- **Beet:** existing synth/drum code retained; its addition is delayed, not deleted.

Do not move vocal recording into Grocery. Do not use Grocery's old, unused synthesizer files to create catalog inventory.

## Current handoffs

```text
Grocery
  previews a real beat recording with audible Capi Capi producer tags
  sells a non-exclusive lease through Stripe
  downloads the original beat + license ZIP after verified ownership
        ↓  Use in Sprouts (on-device handoff)
Sprouts
  receives the selected tagged trial beat or verified clean leased beat
  also accepts another instrumental or up to 8 independent music stems
  records lead vocals, automatic doubles, backups, and ad-libs
        ↓  Open in Pastry (on-device handoff) or Session ZIP
Pastry
  receives every music stem and vocal layer with alignment, template, and levels
  mixes, masters, and exports the finished song
```

**Use in Sprouts** renders the selected beat to WAV, stages it in the `grocery-sprouts-handoffs` IndexedDB database, and opens `/sprouts/` with a one-time handoff ID. Sprouts consumes and deletes that record after import, restores the catalog BPM, and shows whether the beat is tagged or clean. Records expire after one hour.

Store previews are always tagged. An unleased **Use in Sprouts** transfer also contains the tags rendered into the audio itself, so they survive recording, Session ZIP export, Pastry import, and Pastry WAV export. Tags begin at 4 seconds and repeat every 24 seconds; recordings shorter than 6 seconds receive one tag near the start. The spoken tag is level-normalized so it remains audible.

Clean audio is selected only when `api/beat-license.ts` returns a database-backed lease. Signed-out, missing, failed, or unclear license checks fail closed to tagged audio. The browser cannot grant a lease.

After recording, **Open in Pastry** stages the session ZIP in the existing `produce-suite-handoffs` IndexedDB database and opens `/pastry/` with another one-time, one-hour handoff ID. Both transfers are same-origin, on-device browser storage, not cloud persistence. **Session ZIP** remains the manual fallback and works across devices.

The current spoken tag in `grocery/src/lib/mvp/capiTag.ts` is a generated production placeholder, not the user's own voice. Replace it with the desired recorded “Capi Capi” tag before commercial launch if needed.

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

The Sprouts session ZIP contains `session.json` plus 44.1 kHz, 16-bit, stereo WAV stems. Pastry reads the same bundle through its file importer, so the direct handoff and manual ZIP path share one format. Beet remains delayed and its code is retained.
