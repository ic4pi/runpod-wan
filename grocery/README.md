# Grocery beat store

Grocery sells non-exclusive leases for real beat recordings. It does not record vocals or generate catalog audio.

## Buyer flow

1. Preview an available recording for up to 30 seconds.
2. Sign in only to lease or download.
3. Pay through server-created Stripe Checkout.
4. After the signature-verified Stripe webhook grants the lease, download a ZIP containing the original audio, `LICENSE.txt`, `purchase.json`, and `READ-ME.txt`.
5. Record vocals in Sprouts; mix and master in Pastry.

A catalog slot without an `audioUrl` says **Coming soon**. Its preview, checkout, and download controls stay disabled. There is no synthesized or procedural-audio fallback.

## Add a real beat

1. Put the mastered file in `grocery/public/beats/`, for example `grocery/public/beats/backseat-gospel.mp3`.
2. In `lib/beats.ts`, add `audioUrl: '/beats/backseat-gospel.mp3'` to the matching slot.
3. Confirm the title, producer credit, BPM, key, and price.
4. Run the tests and production build before publishing.

The current catalog uses public audio URLs for preview and buyer download. Before commercial launch, use separate public preview files and private full-file delivery if the original files must not be publicly reachable.

## Run

```bash
npm ci
npm run dev
npm test
npm run build
```

The repository root build assembles Grocery, Sprouts, Pastry, the retained Beet module, and Account into one deployment. Beet's addition is delayed; its code is not deleted.

See `docs/ACCOUNTS_SETUP.md` for Supabase, Stripe, webhook, and license-migration setup. The license text is an implementation draft and needs owner/legal review before real sales.
