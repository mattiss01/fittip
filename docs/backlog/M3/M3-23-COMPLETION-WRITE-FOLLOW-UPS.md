# M3-23: Completion write follow-ups

**Status:** proposed — filed by the lead agent on 31 August 2026 from two
findings that M3-15B could not resolve inside its own tier, and extended the
same day with a third item the product owner asked for when accepting M3-15B.
Items 2 and 3 are wanted; item 1 is not yet decided. Not approved for dispatch.
It gains an `## Agent brief` when the product owner approves it.

**Triage:** needs-decision

**Milestone:** M3

**Priority:** P2 — raised from the lead's initial filing because the product
owner named items 2 and 3 as wanted changes when accepting M3-15B.

**Tier:** 1 — every item changes the accepted privileged function
`apply_completion_change` and needs a forward migration.

**Depends on:** [M3-15B](M3-15B-TODAY-AND-LOGGING.md) accepted and merged. The
items are only reachable once completions can actually be written, and item 2
only exists because M3-15B started writing an activity.

## Why this ticket exists

Three things that the logging surface cannot fix from where it stands. Items 1
and 2 were found by working on M3-15B and deliberately left rather than
smuggled into a Tier 2 ticket. Item 3 is a product rule the owner stated on
accepting it.

### 1. A duplicate log is refused with the wrong reason

Log a planned session on a day other than its planned date, return to its
planned day, and log it again. It is correctly refused — the unique index holds
— but the owner is told to "Check the outcome, the date, and the numbers", when
none of those is wrong. The real reason is that this session already has a
completion.

The message cannot be recovered in the surface. `apply_completion_change`
raises `22023` for the duplicate, and
`src/server/repositories/completion-log-repository.ts:105` collapses every
`22023` to `CompletionValidationError`, which carries no detail. Nor can the
action check first: `CompletionLog.list` is bounded by `actual_local_date` and
there is no by-session accessor, so the surface cannot see a completion written
on a different day than the one it is looking at.

M3-15A already records the racing half of this as its limitation 6. The serial
case is the one an owner actually meets.

**Shape, not yet approved.** A distinct errcode from the duplicate branch,
mapped to a new `CompletionDuplicateError`, plus a by-session read on the
adapter so the form can say so before the write rather than after it. Whether
both halves are needed is part of the decision.

### 2. An unplanned log's title and sport cannot be corrected

M3-15B gives unplanned training a title and a sport, written as one
`completion_activities` row at create time. The edit path refuses an
`activities` key by design — its allowed-key list omits it, and the M3-15A
comment beneath it says an edit "carries neither, because the planned link is
immutable and no activity editor exists yet."

So a typo in the title of an unplanned log is permanent. M3-15B renders both as
read-only text on an edit rather than offering inputs that would silently
discard what the owner typed, which is honest but not satisfying.

**Wanted.** On accepting M3-15B on 31 August 2026 the product owner said "The
Title and Sport should be changeable." That settles decision 1 below: the Tier
1 migration is worth it.

**Shape, not yet approved.** Admit an `activities` key on the edit branch for a
completion whose `plan_session_id` is null, replacing the list wholesale. The
planned-link immutability that the original comment protects is a separate
concern and stays. This is deliberately narrower than the general activity
editor that M3-15A limitation 4 describes, and it must not become one by
accident.

### 3. Training can be logged for a day that has not happened

The product owner, accepting M3-15B on 31 August 2026: "A unplanned session
should not be able to be logged for future dates."

Nothing refuses it today. `apply_completion_change` validates that
`actualLocalDate` is a date and no more, and the surface offers a bare
`<input type="date">`. M3-15A recorded the absence as its limitation 5 — "No
future-date rule" — deliberately, because inventing one would have been an
unapproved product decision. The decision has now been taken.

**Shape, not yet approved.** Refuse an `actualLocalDate` after the owner-local
today in the write function, with its own errcode and owner-visible copy,
mirroring how `PT422` already refuses a past-dated plan operation. The rule
belongs in the write function rather than only in the form, for the same reason
every other completion rule does: a check the surface performs alone is a
courtesy, not a constraint. Add a `max` on the date input as well, so the owner
is stopped before the round trip rather than after it.

**Open, and part of the decision below.** The owner named *unplanned* training.
The same argument applies to a planned session — you cannot have completed
tomorrow's run either — but that is a wider rule than was asked for, and it
would refuse writes the accepted M3-15A function currently permits. The rule
also has to be anchored in the owner's own zone, because "today" differs by
zone and each completion already stores the zone it was written in.

## Decisions the product owner owns

1. ~~Whether item 2 is worth a Tier 1 migration at all.~~ **Settled 31 August
   2026: it is.** The product owner asked for it directly.
2. Whether item 1 needs the by-session read as well as the distinct errcode, or
   whether a correct message after the refusal is enough.
3. **Item 3's reach.** Does the future-date rule apply to unplanned training
   only, as the owner literally said, or to every completion? The lead's view
   is that it should apply to all of them, because the argument does not depend
   on whether the session was planned — but that refuses writes the accepted
   M3-15A function permits today, so it is the product owner's call.
4. Whether the three ship together. They touch the same function and would
   share one migration, which argues for one ticket; they are otherwise
   unrelated, which argues against. Items 2 and 3 are both wanted, so those two
   at least belong together.

## Related

- [M3-15A validation record](../../validation/M3/M3-15A-VALIDATION.md), known
  limitations 4, 5 and 6. Limitation 5 is item 3's starting point.
- [M3-15B validation record](../../validation/M3/M3-15B-VALIDATION.md), which
  records items 1 and 2 as limitations of the shipped surface.
