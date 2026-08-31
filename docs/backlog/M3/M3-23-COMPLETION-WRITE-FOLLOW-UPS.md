# M3-23: Completion write follow-ups

**Status:** proposed — filed by the lead agent on 31 August 2026 from two
findings that M3-15B could not resolve inside its own tier. Not approved for
dispatch. It gains an `## Agent brief` when the product owner approves it.

**Triage:** needs-decision

**Milestone:** M3

**Priority:** P2

**Tier:** 1 — both items change the accepted privileged function
`apply_completion_change` and need a forward migration.

**Depends on:** [M3-15B](M3-15B-TODAY-AND-LOGGING.md) accepted and merged. Both
items are only reachable once completions can actually be written, and the
second one only exists because M3-15B started writing an activity.

## Why this ticket exists

Two things that the logging surface cannot fix from where it stands. Both were
found by working on M3-15B, and both were deliberately left rather than
smuggled into a Tier 2 ticket.

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

**Shape, not yet approved.** Admit an `activities` key on the edit branch for a
completion whose `plan_session_id` is null, replacing the list wholesale. The
planned-link immutability that the original comment protects is a separate
concern and stays. This is deliberately narrower than the general activity
editor that M3-15A limitation 4 describes, and it must not become one by
accident.

## Decisions the product owner owns

1. Whether item 2 is worth a Tier 1 migration at all, or whether an
   uncorrectable unplanned title is acceptable for the founder environment.
2. Whether item 1 needs the by-session read as well as the distinct errcode, or
   whether a correct message after the refusal is enough.
3. Whether the two ship together. They touch the same function and the same
   migration, which argues for one ticket; they are otherwise unrelated, which
   argues against.

## Related

- [M3-15A validation record](../../validation/M3/M3-15A-VALIDATION.md), known
  limitations 4 and 6.
- [M3-15B validation record](../../validation/M3/M3-15B-VALIDATION.md), which
  records both as limitations of the shipped surface.
