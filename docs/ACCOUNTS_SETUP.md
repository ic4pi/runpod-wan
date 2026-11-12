# Accounts and paywall: setup

How it works: one site. Grocery is free at `/`. Pastry, Beet and Sprouts live at `/pastry/`, `/beet/`, `/sprouts/`
and are locked by `middleware.ts`: before any file is served, the visitor must be signed in AND own that module.
Anything unclear (missing settings, Supabase down, bad cookie) means locked. Purchases are granted only by a
signature-verified Stripe webhook (`api/stripe-webhook.ts`), never by the browser.

Prices follow contribution to Grocery: Pastry $5.99, Beet $4.99, Sprouts $3.99. Diced is not for sale yet.
Change them in `lib/modules.ts` (the server is the only source of prices).

## 1. Database (Supabase project `autobuild`)
Easiest: paste `supabase/run-this-once.sql` into the Supabase SQL Editor and press Run. It does everything below in one go and is safe to repeat. (The two numbered files below are the same thing split in two.)

Run `supabase/migrations/20261111000000_produce_entitlements.sql` once in the Supabase SQL editor.
Then run `supabase/migrations/20261112000000_rename_bakery_to_pastry.sql` (it renames the Bakery value to Pastry; run both files, in order).
The first file adds two tables: `produce_entitlements` (who owns what; customers can only read their own rows) and
`produce_stripe_events` (so a retried payment counts once). Nothing existing is changed.

Note: Supabase logins are shared across the whole project, so Grocery customers are also users of `autobuild`.

## 2. Supabase sign-in settings
Authentication > Providers > Email: keep "Confirm email" on (customers confirm before first sign-in).
Authentication > URL Configuration: set Site URL to your production address.
Supabase's built-in email sender is rate limited; for real launch add your own SMTP provider.

## 3. Environment variables (Vercel > project `grocery` > Settings > Environment Variables)
Add these yourself in the Vercel dashboard. Never paste secrets into chat or commit them.

| Name | Where to find it | Secret? |
|---|---|---|
| `SUPABASE_URL` | Supabase > Project Settings > API > Project URL | no |
| `SUPABASE_ANON_KEY` | same page, the `anon` / publishable key | no |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` key | YES, server only |
| `SESSION_SECRET` | make one: `openssl rand -base64 48` | YES |
| `STRIPE_SECRET_KEY` | Stripe > Developers > API keys (start with the `sk_test_` key) | YES |
| `STRIPE_WEBHOOK_SECRET` | Stripe > Developers > Webhooks > your endpoint > Signing secret | YES |
| `SITE_URL` (optional) | your public address, e.g. `https://yourdomain.com` | no |

Until `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SESSION_SECRET` are set, all paid modules stay locked.
Until the Stripe keys and service-role key are set, the Buy buttons say "Payments open soon".

## 4. Stripe
Create an endpoint at `https://<your-site>/api/stripe-webhook` listening for `checkout.session.completed`.
Use test mode first (card 4242 4242 4242 4242). Switch to live keys only after a full test purchase unlocks a module.

## 5. Going live
There is one Vercel project (`grocery`). Add the settings above to it and redeploy. Until they are set, paid apps stay locked and `/account/` says paid modules are coming soon.
