-- A5: one name per activity in an owner's library.
--
-- The picker leads with a definition's name, and A9 will follow an exercise
-- through its logs by the definition it came from, so two active definitions
-- called the same thing would be ambiguous to pick and would split one
-- exercise's history in two. The owner chose unique names over blocking only
-- exact copies, and chose to have the database hold it rather than the
-- application alone (27 Sep 2026).
--
-- Names are compared as a person reads them: case-insensitively, with outer
-- whitespace trimmed and inner runs collapsed to one space, so "Rudern",
-- "rudern " and "Rudern" typed with a double space are one name. The
-- application's `activityNameKey` in `src/lib/training/activity-name.ts`
-- applies the same normalization so the editor can say a name is taken before
-- a save is tried, and must not drift from this expression.
--
-- Partial on `archived_at is null`. A removed definition frees its name,
-- because the only way back after "Remove from library" is to save the
-- activity again from a session, and that is almost always under its old name.
--
-- Scoped by `user_id`: two owners may use the same name, and nothing here lets
-- one learn another's. The index adds no privilege and no policy; the table's
-- owner-only grants and RLS from M1-01 are unchanged.
--
-- The build fails if an owner already holds two active definitions under one
-- name. None can have been written by the application, which had no writer for
-- this table before A5, so a failure means a hand-made row to resolve by name
-- before re-applying, never by weakening the index.

create unique index personal_activities_active_name_key
  on public.personal_activities (
    user_id,
    pg_catalog.lower(
      pg_catalog.btrim(pg_catalog.regexp_replace(name, '\s+', ' ', 'g'))
    )
  )
  where archived_at is null;
