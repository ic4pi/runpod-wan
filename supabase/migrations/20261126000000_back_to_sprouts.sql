-- The vocal module keeps the name Sprouts (the short-lived rename to Bakery is undone).
alter table public.produce_entitlements drop constraint if exists produce_entitlements_module_check;
update public.produce_entitlements set module = 'sprouts' where module = 'bakery';
alter table public.produce_entitlements
  add constraint produce_entitlements_module_check
  check (module in ('pastry', 'beet', 'sprouts', 'diced'));
