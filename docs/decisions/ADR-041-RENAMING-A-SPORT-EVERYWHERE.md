# ADR-041: Renaming a sport everywhere

**Status:** accepted. The product owner decided it on 6 November 2026.

**Date:** 6 November 2026

**Ticket:** "Sport colours: one colour per sport, everywhere" in
[`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-031](ADR-031-DELETING-A-LOG.md) (nothing is removed as a side effect)
and [ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md) (records are written by their
own transactions). It is recorded because it adds a `SECURITY DEFINER` function that
writes the owner's completed logs and past sessions, which no write outside their own
change functions did before.

## Context

A sport is free text on every record: plan sessions and their activities, series, the
session library, personal activities, live workouts, logs and their activities, and
goals. Until 6 November 2026 the owner's list of sports was an array on the profile, and
Plan and Progress each coloured sports by a position in a list of their own, so one
sport could wear two colours.

The owner asked for one colour per sport, set in Settings, and for a Settings list of
their own sports that they can add to, rename, recolour and delete. A sport's records
match it by name. Renaming only the list entry would therefore leave every past session
and log under the old name, in grey, apart from the sport it was meant to be.

## Decision

1. **The owner's sports are a table**, `public.sports`, one row per sport with a name
   (unique per owner whatever the case), one of twelve swatches, and a place. The owner
   reads it, adds to it, recolours, reorders and deletes directly, under owner-only RLS.
   `profiles.sports` was copied into it and dropped. A new sport takes the swatch fewest
   of the owner's sports wear, chosen in a trigger under the profile row's lock.
2. **A rename renames everything of the owner's that names the sport** (owner's choice
   over renaming the list entry alone). `public.rename_sport(p_sport_id, p_name)` is
   `SECURITY DEFINER` with an empty search path, executable by `authenticated` only, and
   acts on `auth.uid()` alone. In one transaction it renames the row and rewrites the
   `sport` of every owned session, activity, series, saved session, personal activity,
   live workout, log and logged activity that matches the old name by trimmed,
   case-insensitive comparison, and replaces it in each goal's `sports`. The owner holds
   no update grant on those tables, which is why it is a definer.
3. **Renaming onto a sport the owner already has merges the two** (owner's choice). The
   renamed row is deleted, and the records take the other sport's name, colour and place.
   The application asks before it merges.
4. **What a rename never touches:** a log's `planned_snapshot`, which a trigger keeps as
   what the log was measured against; the coach's own proposals and goal suggestions,
   which are its output, not the owner's records; and text inside JSON. A log written
   before logs had a sport of their own reads its plan's, so one whose plan named the old
   sport is given the new one, and it still reads as that sport.
5. **Deleting a sport removes its list entry and nothing else** (ADR-031, owner's
   choice). Its records keep their sport and are drawn grey. Typing it again brings it
   back with a colour.

## Consequences

- A completed log's sport can now change after the fact, but only by the owner's own
  rename in Settings. Nothing else renames a sport, and no plan or coach path calls the
  function.
- A rename does not move the plan's revision. A proposal or edit form opened before a
  rename can still apply the old name, which then joins the list as a sport of its own,
  grey until recoloured and mergeable in Settings. Moving the revision without a change
  set would break the plan's change history, which pairs each revision with one.
- Accepting a coach plan now adds the sports of the sessions accepted to the list, as
  typing one does (`keep_sports`).
- `supabase/tests/database/sports_with_colours.test.sql` proves the table's grants and
  policies, the swatch and limit rules, the rename across tables and owners, the merge,
  and that a delete leaves records alone.
