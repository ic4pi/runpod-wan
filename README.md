# Grocery Ecosystem

Grocery is a modular music platform built with React, TypeScript, Vite, and Web Audio.

## Product lanes

- **Grocery** — real-audio beat store. Preview recordings, buy a non-exclusive lease, and download the beat with its license.
- **Sprouts** — vocal recording, layered takes, effects, and vocal exports.
- **Pastry** — mixing and mastering.
- **Beet** — existing synth/drum module retained in the repository. Its addition is delayed, not deleted.
- **Diced** — planned sampler/loop module; not for sale.

Grocery does not duplicate Sprouts' recorder and does not use synthesized or procedurally generated fallback audio as store inventory.

## Grocery buyer flow

1. Browse ten catalog slots.
2. Preview an available recording for up to 30 seconds.
3. Sign in only to lease or download.
4. Pay through server-created Stripe Checkout.
5. A signature-verified Stripe webhook grants the lease in Supabase.
6. Download the original audio, `LICENSE.txt`, `purchase.json`, and `READ-ME.txt` as a ZIP.
7. Record vocals in Sprouts and finish the song in Pastry.

Every slot currently requires a real `audioUrl` before it becomes available. Empty slots say **Coming soon** and cannot be previewed or sold.

### Activate a catalog slot

1. Add the real recording under `grocery/public/beats/`.
2. Set its `audioUrl` in `lib/beats.ts`, for example:

   ```ts
   audioUrl: '/beats/backseat-gospel.mp3'
   ```

3. Verify its title, producer credit, BPM, key, and server-side price.
4. Run all tests and the production build.

The current implementation uses the same public URL for preview and licensed download. Before commercial launch, add separate public previews and private full-file delivery if raw catalog URLs must be protected.

## Project structure

```text
grocery/       Beat store at /
sprouts/       Vocal recording at /sprouts/
pastry/        Mixing and mastering at /pastry/
beet/          Retained module at /beet/; addition delayed
account/       Account and module checkout at /account/
api/           Auth, Stripe Checkout, webhooks, and license endpoints
lib/           Server-authoritative catalog, module, and access logic
supabase/      Entitlement and beat-license migrations
scripts/       Multi-app production build
```

## Development

Use Node 22, matching CI.

```bash
npm ci
npm run typecheck
npm test
npm --prefix grocery ci
npm --prefix grocery test
npm run build
```

The root build assembles all four Vite apps plus Account into `dist/` for one Vercel deployment.

| Address | App |
|---|---|
| `/` | Grocery beat store |
| `/sprouts/` | Sprouts vocal recording |
| `/pastry/` | Pastry mixing and mastering |
| `/beet/` | Retained Beet module |
| `/account/` | Sign in and module purchases |

`middleware.ts` protects paid module routes and fails closed when authentication or configuration is unclear. Beat leases use a separate `grocery_beat_licenses` table; buying a beat does not unlock a module, and buying a module does not grant a beat lease.

## Accounts and payments

See `docs/ACCOUNTS_SETUP.md`. In short:

- Run `supabase/run-this-once.sql` in Supabase.
- Configure Supabase Auth and the server environment variables in Vercel.
- Configure Stripe and the signature-verified `checkout.session.completed` webhook.
- Test the complete purchase and verified-license download before using live keys.

Never paste secrets into chat or commit them. Purchases are granted only by the verified webhook, never by the browser.

## Integration

See `GROCERY_INTEGRATION.md` for the current handoff between the beat store, Sprouts, and Pastry.

## Before real beat sales

- Add the owner's real recordings and activate their `audioUrl` values.
- Run the beat-license SQL migration.
- Complete a Stripe test purchase and webhook verification.
- Review producer credit and the plain-English license with the owner and qualified legal counsel.
- Decide whether full audio files need private delivery.

The included license text is an implementation draft, not legal advice.
