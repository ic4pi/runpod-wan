-- Verified non-exclusive beat leases. Customers read only their own rows.
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
