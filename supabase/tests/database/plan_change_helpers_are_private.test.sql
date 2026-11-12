-- The plan's change function, split by operation (owner, 10 Nov 2026).
--
-- Proved here: the operation helpers exist in `private`, no API role can call
-- them or reach their schema, none is a definer function or carries dynamic
-- SQL, each pins its search path, and the dispatcher kept its own grant. That
-- the split changed no behaviour is proved by every other suite that calls
-- `apply_rolling_plan_change_set`, unedited.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

create temporary view plan_change_helper as
select procedure.oid::regprocedure as signature, procedure.prosrc,
  procedure.prosecdef, procedure.proconfig
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'private' and procedure.proname like 'plan\_change\_%';

select is(
  (select count(*)::integer from plan_change_helper),
  17,
  'the dispatcher has its seventeen helpers in private'
);
select is(
  (
    select count(*)::integer from plan_change_helper helper
    cross join (values ('anon'), ('authenticated'), ('service_role')) api(role_name)
    where pg_catalog.has_function_privilege(api.role_name, helper.signature, 'EXECUTE')
  ),
  0,
  'no API role may call a helper'
);
select ok(
  not pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
  and not pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')
  and not pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE'),
  'no API role may reach the private schema'
);
select ok(
  not pg_catalog.has_type_privilege('authenticated', 'private.plan_change_outcome', 'USAGE')
  and not pg_catalog.has_type_privilege('anon', 'private.plan_change_outcome', 'USAGE'),
  'no API role may use the outcome type'
);
select is(
  (select count(*)::integer from plan_change_helper where prosecdef),
  0,
  'every helper runs with its caller''s rights'
);
select is(
  (
    select count(*)::integer from plan_change_helper
    where proconfig is null or not ('search_path=""' = any(proconfig))
  ),
  0,
  'every helper pins an empty search path'
);
select is(
  (
    select count(*)::integer from plan_change_helper
    where prosrc ~* '\mexecute\M'
  ),
  0,
  'no helper contains dynamic SQL'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon', 'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role', 'public.apply_rolling_plan_change_set(bigint,uuid,text,jsonb)', 'EXECUTE'
  ),
  'the dispatcher kept its grant to the signed-in owner alone'
);

select * from finish();
rollback;
