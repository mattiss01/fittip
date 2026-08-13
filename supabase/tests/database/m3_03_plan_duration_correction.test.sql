begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

create function pg_temp.session(p_minutes numeric)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'date', '2026-08-12',
    'title', 'Long expedition',
    'sport', 'Hiking',
    'focus', 'Sustained time outside.',
    'intent', 'Steady and self-supported.',
    'durationMinutes', p_minutes,
    'primaryGoalId', '81000000-0000-4000-8000-000000000001',
    'secondaryGoalIds', jsonb_build_array(),
    'alternatives', jsonb_build_array(),
    'rationale', 'The selected goal calls for a long continuous day.'
  );
$$;

create function pg_temp.plan(p_minutes numeric)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'schemaVersion', 'fittip.seven-day-plan.v2',
    'weekDescription', 'One deliberately long session inside the selected horizon.',
    'startDate', '2026-08-12',
    'endDate', '2026-08-12',
    'sessions', jsonb_build_array(pg_temp.session(p_minutes))
  );
$$;

select ok(
  public.plan_content_is_valid(
    pg_temp.plan(900),
    '2026-08-12'::date,
    '2026-08-12'::date
  ),
  'a very long positive integer session has no database minutes cap'
);

select ok(
  public.plan_content_is_valid(
    pg_temp.plan(1),
    '2026-08-12'::date,
    '2026-08-12'::date
  ),
  'one positive minute remains valid'
);

select ok(
  not public.plan_content_is_valid(
    pg_temp.plan(0),
    '2026-08-12'::date,
    '2026-08-12'::date
  ),
  'zero minutes is rejected'
);

select ok(
  not public.plan_content_is_valid(
    pg_temp.plan(-1),
    '2026-08-12'::date,
    '2026-08-12'::date
  ),
  'negative minutes are rejected'
);

select ok(
  not public.plan_content_is_valid(
    pg_temp.plan(1.5),
    '2026-08-12'::date,
    '2026-08-12'::date
  ),
  'fractional minutes are rejected'
);

select * from finish();
rollback;
