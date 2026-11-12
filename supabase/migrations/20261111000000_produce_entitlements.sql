-- Produce suite: who owns which paid module.
-- Customers can READ their own rows. Only the server (service role) can write.
create table public.produce_entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('bakery', 'beet', 'sprouts', 'diced')),
  source text not null default 'stripe' check (source in ('stripe', 'manual')),
  stripe_session_id text unique,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, module)
);

alter table public.produce_entitlements enable row level security;

create policy "customers read their own entitlements"
  on public.produce_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Stripe retries webhooks; this makes each event count once.
create table public.produce_stripe_events (
  id text primary key,
  received_at timestamptz not null default now()
);

alter table public.produce_stripe_events enable row level security;
-- no policies: nobody but the service role can touch it.

create index produce_entitlements_user_id_idx on public.produce_entitlements (user_id);
