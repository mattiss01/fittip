-- R3b-2: recurring sessions are written thirteen weeks ahead instead of
-- fourteen days.
--
-- The owner decided on 29 September 2026 that a series keeps being written
-- ahead as real sessions (ADR-017's option, unchanged) and that the window is
-- about three months. ADR-017 is amended beside this migration and says what
-- that costs.
--
-- One function is replaced and nothing else changes: no table, column, type,
-- policy, grant or signature. `materialize_rolling_plan_series` is re-emitted
-- verbatim from M3-20 with the window's last day moved from `today + 13` to
-- `today + 90`; the two lines marked R3b-2 are the whole difference.
--
-- Nothing here limits how far ahead a session may sit. No function ever did:
-- `apply_rolling_plan_change_set` refuses a date before owner-local today and
-- nothing after it, so the fourteen-day limit on a one-off session was the
-- application's own and moves there.
--
-- What this function still guarantees, because every line that does it is
-- carried over: the owner comes from `auth.uid()` alone, the window from the
-- stored zone alone, a rule date already covered or skipped is never
-- revisited, a date holding ten active sessions is skipped rather than
-- refused, and nothing is written and no revision is consumed when nothing is
-- missing.

create or replace function public.materialize_rolling_plan_series(
  p_expected_plan_revision bigint,
  p_idempotency_key uuid
)
returns public.rolling_plan_materialization_receipt
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_timezone text;
  v_today date;
  v_window_end date;
  v_plan public.rolling_plans;
  v_series public.rolling_plan_series;
  v_date date;
  v_key text;
  v_count integer;
  v_position integer;
  v_counts jsonb;
  v_positions jsonb;
  v_activities jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_receipt public.rolling_plan_change_receipt;
begin
  if v_user_id is null then
    raise exception using errcode = '42501',
      message = 'An authenticated FitTip user is required.';
  end if;
  if p_expected_plan_revision is null or p_expected_plan_revision < 0
    or p_idempotency_key is null
  then
    raise exception using errcode = '22023',
      message = 'Invalid rolling plan materialization.';
  end if;

  select profile.timezone_name into v_timezone
  from public.profiles profile where profile.user_id = v_user_id;
  if v_timezone is null then
    raise exception using errcode = 'PT428',
      message = 'Confirm your time zone before changing your plan.';
  end if;
  -- The window is owner-local and comes from the stored zone alone. A caller
  -- cannot name a date, so it cannot widen what gets written.
  -- R3b-2: today plus ninety days, thirteen weeks in all. It was `+ 13`.
  v_today := (pg_catalog.timezone(v_timezone, v_now))::date;
  v_window_end := v_today + 90;

  select * into v_plan from public.rolling_plans where user_id = v_user_id;
  if not found then
    return (null, 0::bigint, null, 'unchanged', 0, '[]'::jsonb)
      ::public.rolling_plan_materialization_receipt;
  end if;

  select coalesce(pg_catalog.jsonb_object_agg(dated.local_date::text, dated.total), '{}'::jsonb)
  into v_counts
  from (
    select session.local_date, pg_catalog.count(*)::integer as total
    from public.rolling_plan_sessions session
    where session.user_id = v_user_id and session.status = 'active'
      and session.local_date between v_today and v_window_end
    group by session.local_date
  ) as dated;

  select coalesce(pg_catalog.jsonb_object_agg(dated.local_date::text, dated.highest), '{}'::jsonb)
  into v_positions
  from (
    select session.local_date, pg_catalog.max(session.position)::integer as highest
    from public.rolling_plan_sessions session
    where session.user_id = v_user_id and session.status = 'active'
      and session.local_date between v_today and v_window_end
    group by session.local_date
  ) as dated;

  for v_series in
    select series.* from public.rolling_plan_series series
    where series.user_id = v_user_id
      and series.start_date <= v_window_end
      and (series.end_date is null or series.end_date >= v_today)
    order by series.created_at, series.id
  loop
    v_activities := coalesce((
      select pg_catalog.jsonb_agg(ordered.item order by ordered.position)
      from (
        select
          activity.position,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'personalActivityId', activity.personal_activity_id,
            'position', activity.position,
            'name', activity.name,
            'sport', activity.sport,
            'instructions', activity.instructions,
            'measurementMode', activity.measurement_mode,
            'target', activity.target
          )) || pg_catalog.jsonb_build_object('isLocked', false) as item
        from public.rolling_plan_series_activities activity
        where activity.user_id = v_user_id and activity.series_id = v_series.id
      ) as ordered
    ), '[]'::jsonb);

    for v_date in
      select rule_date from public.rolling_plan_series_dates(
        v_series.frequency, v_series.interval_count, v_series.weekdays,
        v_series.start_date, v_series.end_date, v_today, v_window_end
      ) as rule_date
    loop
      -- A date the series already covers is never revisited, whether the
      -- occurrence is untouched, diverged, or cancelled.
      if exists (
        select 1 from public.rolling_plan_sessions occurrence
        where occurrence.series_id = v_series.id
          and occurrence.occurrence_date = v_date
      ) then continue; end if;
      -- M3-20: nor is a date the owner deleted this series' occurrence from.
      if v_date = any(v_series.skipped_occurrence_dates) then continue; end if;

      v_key := v_date::text;
      v_count := coalesce((v_counts->>v_key)::integer, 0);
      if v_count >= 10 then
        v_skipped := v_skipped || pg_catalog.jsonb_build_object(
          'seriesId', v_series.id,
          'occurrenceDate', v_key,
          'reason', 'daily_session_limit'
        );
        continue;
      end if;
      -- `apply_rolling_plan_change_set` accepts at most one hundred changes, so
      -- a very full window is finished by the next call rather than refused.
      -- R3b-2: at ninety-one days two daily series already exceed that on a
      -- first fill, so the application now calls again while this is reported.
      if pg_catalog.jsonb_array_length(v_changes) >= 100 then
        v_skipped := v_skipped || pg_catalog.jsonb_build_object(
          'seriesId', v_series.id,
          'occurrenceDate', v_key,
          'reason', 'change_set_limit'
        );
        continue;
      end if;

      v_position := coalesce((v_positions->>v_key)::integer, -1) + 1;
      v_changes := v_changes || pg_catalog.jsonb_build_object(
        'operation', 'add',
        'sessionId', public.rolling_plan_occurrence_id(v_series.id, v_date),
        'session', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'localDate', v_key,
          'title', v_series.title,
          'sport', v_series.sport,
          'intent', v_series.intent,
          'expectedDurationMinutes', v_series.expected_duration_minutes,
          'note', v_series.note,
          'seriesId', v_series.id,
          'occurrenceDate', v_key
        )) || pg_catalog.jsonb_build_object(
          'position', v_position,
          'isLocked', false,
          'activities', v_activities
        )
      );
      v_counts := v_counts || pg_catalog.jsonb_build_object(v_key, v_count + 1);
      v_positions := v_positions || pg_catalog.jsonb_build_object(v_key, v_position);
    end loop;
  end loop;

  if pg_catalog.jsonb_array_length(v_changes) = 0 then
    return (
      v_plan.id, v_plan.revision, null, 'unchanged', 0, v_skipped
    )::public.rolling_plan_materialization_receipt;
  end if;

  v_receipt := public.apply_rolling_plan_change_set(
    p_expected_plan_revision, p_idempotency_key, 'series_expansion', v_changes
  );
  return (
    v_receipt.plan_id, v_receipt.plan_revision, v_receipt.change_set_id,
    v_receipt.result, pg_catalog.jsonb_array_length(v_changes), v_skipped
  )::public.rolling_plan_materialization_receipt;
end;
$$;

revoke all privileges on function public.materialize_rolling_plan_series(bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.materialize_rolling_plan_series(bigint, uuid)
  to authenticated;
