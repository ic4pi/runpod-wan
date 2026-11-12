-- Bakery is now called Pastry. Safe to run whether or not any purchases exist yet,
-- and safe to run twice.
alter table public.produce_entitlements drop constraint if exists produce_entitlements_module_check;

update public.produce_entitlements set module = 'pastry' where module = 'bakery';

alter table public.produce_entitlements
  add constraint produce_entitlements_module_check
  check (module in ('pastry', 'beet', 'sprouts', 'diced'));
