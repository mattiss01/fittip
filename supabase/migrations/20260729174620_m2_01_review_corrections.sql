alter table public.goals
drop constraint goals_activity_areas_check;

alter table public.goals
add constraint goals_activity_areas_check check (
  cardinality(activity_areas) <= 10
  and array_position(activity_areas, null) is null
  and char_length(array_to_string(activity_areas, '')) <= 600
);

create index goal_lifecycle_events_goal_owner_idx
on public.goal_lifecycle_events (goal_id, user_id);
