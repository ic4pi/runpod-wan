# Accounts, beat leases, and paywall: setup

One deployment serves Grocery at `/`, Sprouts at `/sprouts/`, Pastry at `/pastry/`, the retained Beet module at `/beet/`, and Account at `/account/`.

Grocery is the real-audio beat store. Sprouts handles vocal recording. Pastry handles mixing and mastering. Beet's addition is delayed; its code remains in the repository.

Paid module routes are locked by `middleware.ts`: before any file is served, the visitor must be signed in and own that module. Anything unclear—missing settings, Supabase down, or a bad cookie—means locked. Purchases are granted only by the signature-verified Stripe webhook (`api/stripe-webhook.ts`), never by the browser.

Module prices are set in `lib/modules.ts`. Beat prices and availability are set separately in `lib/beats.ts`; the server is authoritative for both.

## 1. Database (Supabase project `autobuild`)

Easiest: paste `supabase/run-this-once.sql` into the Supabase SQL Editor and press Run. It is safe to repeat.

The combined script creates:

- `produce_entitlements` — who owns which module; customers can read only their own rows.
- `produce_stripe_events` — idempotent Stripe event processing.
- `grocery_beat_licenses` — verified non-exclusive beat leases; customers can read only their own rows.

The equivalent individual migrations are:

1. `supabase/migrations/20261111000000_produce_entitlements.sql`
2. `supabase/migrations/20261112000000_rename_bakery_to_pastry.sql`
3. `supabase/migrations/20261113000000_beat_licenses.sql`

Supabase logins are shared across the whole project, so Grocery customers are also users of `autobuild`.

## 2. Add real beat recordings

No real recordings are activated by default. Empty slots say **Coming soon** and cannot be previewed, purchased, or downloaded.

For each beat:

1. Add the mastered file under `grocery/public/beats/`.
2. Add its `audioUrl` to the matching entry in `lib/beats.ts`, for example `audioUrl: '/beats/backseat-gospel.mp3'`.
3. Verify title, producer credit, price, and license wording.
4. Test preview, checkout, webhook grant, and licensed ZIP download.

The current code uses the same public URL for preview and licensed download. Add separate public previews and private full-file delivery before launch if the original recordings must not be publicly reachable.

## 3. Supabase sign-in settings

- Authentication > Providers > Email: keep **Confirm email** on so customers confirm before first sign-in.
- Authentication > URL Configuration: set Site URL to the production address.
- Supabase's built-in email sender is rate limited; add an SMTP provider for a real launch.

## 4. Environment variables (Vercel > project `grocery` > Settings > Environment Variables)

Add these in the Vercel dashboard. Never paste secrets into chat or commit them.

| Name | Where to find it | Secret? |
|---|---|---|
| `SUPABASE_URL` | Supabase > Project Settings > API > Project URL | no |
| `SUPABASE_ANON_KEY` | same page, the `anon` / publishable key | no |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` key | YES, server only |
| `SESSION_SECRET` | make one: `openssl rand -base64 48` | YES |
| `STRIPE_SECRET_KEY` | Stripe > Developers > API keys; start with `sk_test_` | YES |
| `STRIPE_WEBHOOK_SECRET` | Stripe > Developers > Webhooks > endpoint > Signing secret | YES |
| `SITE_URL` (optional) | public address, for example `https://yourdomain.com` | no |

Until `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SESSION_SECRET` are set, paid modules stay locked. Until the Stripe keys and service-role key are set, checkout stays unavailable. Beat downloads also require a database-backed verified license.

## 5. Stripe

Create an endpoint at `https://<your-site>/api/stripe-webhook` listening for `checkout.session.completed`.

Use test mode first. Test both flows separately:

1. A module purchase unlocks only that module.
2. An available beat purchase grants only that beat's lease, then enables its licensed ZIP download.

The webhook must verify the signature, paid status, catalog item, amount, user, and session before granting anything. Retried events must not create duplicate ownership rows.

Switch to live keys only after the complete test purchase, webhook grant, buyer-only license read, and download all pass.

## 6. Going live

1. Add the real beat recordings and activate their `audioUrl` values.
2. Run the SQL setup, including the beat-license table.
3. Add the environment variables and redeploy.
4. Complete Stripe test verification.
5. Review producer credit and license wording with the owner and qualified legal counsel.
6. Decide whether private full-file delivery is required.

The included license text is an implementation draft, not legal advice.
