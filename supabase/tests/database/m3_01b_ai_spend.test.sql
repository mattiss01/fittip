begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

-- Structure and privilege, asserted before any behaviour. M3-01B decision 8
-- turns on the ability of an authenticated owner to alter their own spend, so
-- the privilege matrix is the test rather than a precondition of it.

select has_function(
  'public',
  'reserve_ai_spend',
  array['text', 'bigint', 'text', 'text'],
  'the spend reservation function exists'
);
select has_function(
  'public',
  'settle_ai_spend',
  array['uuid', 'bigint'],
  'the spend settlement function exists'
);
select ok(
  (
    select prosecdef and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.reserve_ai_spend(text,bigint,text,text)'::regprocedure
  ),
  'reserve is security definer with an empty search path'
);
select ok(
  (
    select prosecdef and proconfig = array['search_path=""']
    from pg_proc
    where oid = 'public.settle_ai_spend(uuid,bigint)'::regprocedure
  ),
  'settle is security definer with an empty search path'
);
-- The owner is derived from auth.uid() and is never a parameter, so no
-- argument of either function may name a user.
select is(
  (
    select count(*)::bigint
    from pg_proc
    cross join lateral unnest(coalesce(proargnames, array[]::text[])) as argument
    where oid in (
      'public.reserve_ai_spend(text,bigint,text,text)'::regprocedure,
      'public.settle_ai_spend(uuid,bigint)'::regprocedure
    )
      and argument ilike '%user%'
  ),
  0::bigint,
  'neither spend function accepts the owner as a parameter'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.reserve_ai_spend(text,bigint,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.settle_ai_spend(uuid,bigint)',
    'EXECUTE'
  ),
  'authenticated users can execute both spend functions'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.reserve_ai_spend(text,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.settle_ai_spend(uuid,bigint)',
    'EXECUTE'
  ),
  'anonymous users cannot execute either spend function'
);
select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(coalesce(proacl, acldefault('f', proowner)))
    where oid in (
      'public.reserve_ai_spend(text,bigint,text,text)'::regprocedure,
      'public.settle_ai_spend(uuid,bigint)'::regprocedure
    )
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute either spend function'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.ai_spend_reservations'::regclass
  ),
  'the spend table has row level security enabled'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.ai_spend_reservations', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.ai_spend_reservations', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.ai_spend_reservations', 'DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.ai_spend_reservations', 'TRUNCATE'
  ),
  'authenticated users hold no direct write privilege on spend'
);
-- The column-level grant is the whole point of the settlement token: an owner
-- may audit every figure in their own spend and still cannot obtain the
-- capability that settles a reservation.
select ok(
  has_column_privilege(
    'authenticated',
    'public.ai_spend_reservations',
    'reserved_micro_usd',
    'SELECT'
  )
  and has_column_privilege(
    'authenticated', 'public.ai_spend_reservations', 'charged_micro_usd', 'SELECT'
  ),
  'an owner can read their own spend figures'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.ai_spend_reservations',
    'settlement_token',
    'SELECT'
  ),
  'no authenticated user may read a settlement token'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_spend_reservations'
      and cmd <> 'SELECT'
  ),
  'the spend table carries no insert, update, or delete policy'
);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('60000000-0000-4000-8000-000000000001', 'm3-01b-a@example.test', '{}', '{}'),
  ('60000000-0000-4000-8000-000000000002', 'm3-01b-b@example.test', '{}', '{}'),
  ('60000000-0000-4000-8000-000000000003', 'm3-01b-c@example.test', '{}', '{}'),
  ('60000000-0000-4000-8000-000000000004', 'm3-01b-d@example.test', '{}', '{}'),
  ('60000000-0000-4000-8000-000000000005', 'm3-01b-e@example.test', '{}', '{}');

insert into public.profiles (user_id)
values
  ('60000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000005');

-- Owner C sits just under the daily ceiling: one live reservation and one
-- settled charge, 1,995,000 of 2,000,000 micro-USD.
insert into public.ai_spend_reservations (
  user_id, operation, spend_day, reserved_micro_usd, charged_micro_usd,
  rate_card_version, currency, expires_at, settled_at, created_at
)
values
  (
    '60000000-0000-4000-8000-000000000003', 'create_roadmap',
    (now() at time zone 'utc')::date, 1000000, null,
    'seed-v1', 'USD', now() + interval '10 minutes', null, now()
  ),
  (
    '60000000-0000-4000-8000-000000000003', 'create_roadmap',
    (now() at time zone 'utc')::date, 1000000, 995000,
    'seed-v1', 'USD', now() + interval '10 minutes', now(), now()
  );

-- Owner D holds the same 1,995,000 plus an expired, never-settled reservation
-- of a further 1,000,000. If expiry did not release the hold, owner D would be
-- 995,000 over the ceiling and permanently locked out — the exact failure the
-- expiry exists to prevent.
insert into public.ai_spend_reservations (
  user_id, operation, spend_day, reserved_micro_usd, charged_micro_usd,
  rate_card_version, currency, expires_at, settled_at, created_at
)
values
  (
    '60000000-0000-4000-8000-000000000004', 'create_roadmap',
    (now() at time zone 'utc')::date, 1000000, null,
    'seed-v1', 'USD', now() + interval '10 minutes', null, now()
  ),
  (
    '60000000-0000-4000-8000-000000000004', 'create_roadmap',
    (now() at time zone 'utc')::date, 1000000, 995000,
    'seed-v1', 'USD', now() + interval '10 minutes', now(), now()
  ),
  (
    '60000000-0000-4000-8000-000000000004', 'create_seven_day_plan',
    (now() at time zone 'utc')::date, 1000000, null,
    'seed-v1', 'USD', now() - interval '1 hour', null, now() - interval '2 hours'
  );

-- Owner E is at the lifetime ceiling, spread across earlier days so the daily
-- ceiling is not what refuses them.
insert into public.ai_spend_reservations (
  user_id, operation, spend_day, reserved_micro_usd, charged_micro_usd,
  rate_card_version, currency, expires_at, settled_at, created_at
)
select
  '60000000-0000-4000-8000-000000000005',
  'create_roadmap',
  ((now() at time zone 'utc')::date - day_offset),
  1000000,
  1000000,
  'seed-v1',
  'USD',
  now() + interval '10 minutes',
  now(),
  now()
from generate_series(1, 20) as day_offset;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select set_config(
    'test.token',
    (public.reserve_ai_spend('create_roadmap', 5200, 'luna-v1', 'USD')
    ).settlement_token::text,
    true
  )$$,
  'an owner can reserve spend for an allowed operation'
);
select is(
  (select count(*)::bigint from public.ai_spend_reservations),
  1::bigint,
  'reserving writes exactly one owned row'
);
select is(
  (select reserved_micro_usd from public.ai_spend_reservations),
  5200::bigint,
  'the reservation records the amount reserved'
);
select is(
  (select charged_micro_usd from public.ai_spend_reservations),
  null::bigint,
  'a fresh reservation is not yet charged'
);
select ok(
  (
    select expires_at > created_at + interval '10 minutes'
      and expires_at < created_at + interval '1 day'
    from public.ai_spend_reservations
  ),
  'a reservation expires well after the request deadline and well within the day'
);

-- Every route by which an owner might reset, lower, or remove their own spend.
select throws_ok(
  $$select settlement_token from public.ai_spend_reservations$$,
  '42501',
  'permission denied for table ai_spend_reservations',
  'an owner cannot read their own settlement token'
);
select throws_ok(
  $$insert into public.ai_spend_reservations (
    user_id, operation, spend_day, reserved_micro_usd, rate_card_version,
    currency, expires_at
  ) values (
    '60000000-0000-4000-8000-000000000001', 'create_roadmap',
    (now() at time zone 'utc')::date, 1, 'forged', 'USD',
    now() + interval '1 minute'
  )$$,
  '42501',
  'permission denied for table ai_spend_reservations',
  'an owner cannot insert their own spend row'
);
select throws_ok(
  $$update public.ai_spend_reservations set reserved_micro_usd = 0$$,
  '42501',
  'permission denied for table ai_spend_reservations',
  'an owner cannot lower their own reservation'
);
select throws_ok(
  $$update public.ai_spend_reservations
    set charged_micro_usd = 0, settled_at = now()$$,
  '42501',
  'permission denied for table ai_spend_reservations',
  'an owner cannot settle their own spend by direct update'
);
select throws_ok(
  $$delete from public.ai_spend_reservations$$,
  '42501',
  'permission denied for table ai_spend_reservations',
  'an owner cannot delete their own spend'
);
select throws_ok(
  $$truncate public.ai_spend_reservations$$,
  '42501',
  'permission denied for table ai_spend_reservations',
  'an owner cannot truncate the spend table'
);
select is(
  (
    select reserved_micro_usd || ':' || coalesce(charged_micro_usd::text, 'open')
    from public.ai_spend_reservations
  ),
  '5200:open',
  'the reservation is unchanged after every direct write attempt'
);

select lives_ok(
  $$select public.settle_ai_spend(current_setting('test.token')::uuid, 2400)$$,
  'the holder of the settlement token can settle the reservation'
);
select is(
  (select charged_micro_usd from public.ai_spend_reservations),
  2400::bigint,
  'settlement records the reconciled charge'
);
select ok(
  (select settled_at is not null from public.ai_spend_reservations),
  'settlement marks the reservation closed'
);
select throws_ok(
  $$select public.settle_ai_spend(current_setting('test.token')::uuid, 0)$$,
  'PT409',
  'That coaching spend reservation is not open.',
  'a reservation settles once and only once'
);
select is(
  (select charged_micro_usd from public.ai_spend_reservations),
  2400::bigint,
  'a refused second settlement does not lower the recorded charge'
);
select throws_ok(
  $$select public.settle_ai_spend(
    '00000000-0000-4000-8000-0000000000ff'::uuid, 0
  )$$,
  'PT409',
  'That coaching spend reservation is not open.',
  'settling an unknown token is refused'
);
select throws_ok(
  $$select public.settle_ai_spend(current_setting('test.token')::uuid, -1)$$,
  '22023',
  'Invalid coaching spend settlement.',
  'a negative charge is refused'
);

-- Input validation on the reserve path.
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 9000, 'luna-v1', 'USD')$$,
  'PT402',
  'Coaching spend ceiling reached.',
  'a reservation above the per-request ceiling is refused'
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 0, 'luna-v1', 'USD')$$,
  '22023',
  'Invalid coaching spend reservation.',
  'a zero-cost reservation is refused'
);
select throws_ok(
  $$select public.reserve_ai_spend('rewrite_history', 100, 'luna-v1', 'USD')$$,
  '22023',
  'Invalid coaching spend reservation.',
  'an unknown operation is refused'
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 100, 'luna-v1', 'EUR')$$,
  '22023',
  'Invalid coaching spend reservation.',
  'a currency other than USD is refused'
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 100, '   ', 'USD')$$,
  '22023',
  'Invalid coaching spend reservation.',
  'a blank rate card version is refused'
);
select is(
  (select count(*)::bigint from public.ai_spend_reservations),
  1::bigint,
  'every refused reservation leaves no row behind'
);

-- Owner B: another owner's spend is neither visible nor settleable. Owner A
-- opens a second reservation first so there is a live one to attack.
select set_config(
  'test.open_token',
  (
    public.reserve_ai_spend('create_seven_day_plan', 5200, 'luna-v1', 'USD')
  ).settlement_token::text,
  true
);

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::bigint from public.ai_spend_reservations),
  0::bigint,
  'row level security hides one owner spend from another'
);
select throws_ok(
  $$select public.settle_ai_spend(
    current_setting('test.open_token')::uuid, 0
  )$$,
  'PT409',
  'That coaching spend reservation is not open.',
  'an owner cannot settle another owner live reservation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::bigint
    from public.ai_spend_reservations
    where settled_at is null
  ),
  1::bigint,
  'the attacked reservation is still open and still charged to its owner'
);

-- Owner C: the daily ceiling.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 8000, 'luna-v1', 'USD')$$,
  'PT402',
  'Coaching spend ceiling reached.',
  'a reservation crossing the daily ceiling is refused'
);
select is(
  (select count(*)::bigint from public.ai_spend_reservations),
  2::bigint,
  'a refused ceiling check writes nothing'
);
select lives_ok(
  $$select public.reserve_ai_spend('create_roadmap', 5000, 'luna-v1', 'USD')$$,
  'a reservation that exactly fills the remaining daily budget is admitted'
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 1, 'luna-v1', 'USD')$$,
  'PT402',
  'Coaching spend ceiling reached.',
  'nothing more is admitted once the daily ceiling is reached'
);

-- Owner D: an expired reservation releases its hold, so a crashed call does
-- not consume the ceiling for the rest of the day.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.reserve_ai_spend('create_roadmap', 5000, 'luna-v1', 'USD')$$,
  'an expired reservation no longer holds budget'
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 1, 'luna-v1', 'USD')$$,
  'PT402',
  'Coaching spend ceiling reached.',
  'live and settled rows still hold budget alongside the expired one'
);

-- Owner E: the lifetime ceiling, with every charge on an earlier day.
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 1, 'luna-v1', 'USD')$$,
  'PT402',
  'Coaching spend ceiling reached.',
  'the lifetime ceiling refuses a request the daily ceiling would allow'
);

-- An authenticated session with no subject claim has no owner to charge.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 100, 'luna-v1', 'USD')$$,
  '42501',
  'An authenticated FitTip user is required.',
  'a session without a verified subject cannot reserve'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.reserve_ai_spend('create_roadmap', 100, 'luna-v1', 'USD')$$,
  '42501',
  'permission denied for function reserve_ai_spend',
  'anonymous reservations are denied'
);
select throws_ok(
  $$select public.settle_ai_spend(
    '00000000-0000-4000-8000-0000000000ff'::uuid, 0
  )$$,
  '42501',
  'permission denied for function settle_ai_spend',
  'anonymous settlements are denied'
);

select * from finish();
rollback;
