-- Sprouts is now called Bakery. Safe to run whether or not any purchases exist.
alter table public.produce_entitlements drop constraint if exists produce_entitlements_module_check;
update public.produce_entitlements set module = 'bakery' where module = 'sprouts';
alter table public.produce_entitlements
  add constraint produce_entitlements_module_check
  check (module in ('pastry', 'beet', 'bakery', 'diced'));
