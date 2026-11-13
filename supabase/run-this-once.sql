-- Grocery accounts: paste this whole file into Supabase > SQL Editor and press Run.
-- Safe to run more than once, and safe whether or not the older files were run.

create table if not exists public.produce_entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  source text not null default 'stripe' check (source in ('stripe', 'manual')),
  stripe_session_id text unique,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, module)
);

-- Bakery is now Pastry: fix any old value, then lock the allowed names.
alter table public.produce_entitlements drop constraint if exists produce_entitlements_module_check;
update public.produce_entitlements set module = 'pastry' where module = 'bakery';
alter table public.produce_entitlements
  add constraint produce_entitlements_module_check
  check (module in ('pastry', 'beet', 'sprouts', 'diced'));

alter table public.produce_entitlements enable row level security;

drop policy if exists "customers read their own entitlements" on public.produce_entitlements;
create policy "customers read their own entitlements"
  on public.produce_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Stripe retries payment notices; this makes each one count once.
create table if not exists public.produce_stripe_events (
  id text primary key,
  received_at timestamptz not null default now()
);
alter table public.produce_stripe_events enable row level security;
-- no policies: only the server can touch it.

create index if not exists produce_entitlements_user_id_idx on public.produce_entitlements (user_id);


-- Beat-store MVP: verified non-exclusive leases, separate from module ownership.
create table if not exists public.grocery_beat_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  beat_id text not null,
  beat_title text not null,
  producer text not null,
  stripe_session_id text unique,
  amount_cents integer not null check (amount_cents >= 0),
  license_version text not null,
  created_at timestamptz not null default now(),
  unique (user_id, beat_id)
);

alter table public.grocery_beat_licenses enable row level security;

drop policy if exists "customers read their own beat licenses" on public.grocery_beat_licenses;
create policy "customers read their own beat licenses"
  on public.grocery_beat_licenses
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists grocery_beat_licenses_user_id_idx on public.grocery_beat_licenses (user_id);
