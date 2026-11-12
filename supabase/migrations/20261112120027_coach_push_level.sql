-- How hard the coach pushes (owner, 12 Nov 2026; ADR-023 amended).
--
-- One setting of five, in words: gentle, steady, balanced, ambitious, all_in.
-- Asked in guided setup right after goals and changed on Settings. Every
-- account has a level: `balanced` until the owner picks another, which is
-- also what the coach is given for an account that never chose.
--
-- The coach reads it as `trainingSetup.pushLevel`, and it selects one fixed
-- paragraph of FitTip's own instructions per level and call. It never
-- outranks the safety rules, a recorded signal or a planning note.
--
-- Writes follow the training setup's precedent (20261006103205): direct,
-- owner-only, column-scoped. One column, no multi-row invariant, so no change
-- function and no new privileged boundary. The existing owner policies on
-- `profiles` already confine the row.

alter table public.profiles
  add column coach_push_level text not null default 'balanced',
  add constraint profiles_coach_push_level_check check (
    coach_push_level in ('gentle', 'steady', 'balanced', 'ambitious', 'all_in')
  );

grant update (coach_push_level) on table public.profiles to authenticated;
