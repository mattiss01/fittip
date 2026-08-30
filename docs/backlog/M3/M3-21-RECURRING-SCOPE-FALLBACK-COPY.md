# M3-21: The recurring scope controls explain their absence wrongly

**Status:** proposed — not approved for implementation. Raised by the M3-19
independent reviewer on 30 August 2026 as finding F7, outside M3-19's approved
scope and therefore deliberately left alone rather than fixed opportunistically.

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P2

**Tier:** 3 — copy only. No component structure, route, server, schema, or
authorization change. Subject to the product owner confirming that reading, and
to the tier rule that a change turning out to touch behavior stops and is
re-dispatched.

**Depends on:** nothing. It is independent of the M3-15 chain and of
[M3-20](M3-20-REACTIVATE-A-CANCELLED-SESSION.md), and could be taken at any
time.

**Blocks:** nothing.

**Source:** [M3-14B](M3-14B-RECURRING-SERIES-SURFACE.md) shipped both strings.
M3-19 did not introduce the defect; it made it visible, because M3-19 round 3
extracted the predicate that decides whether the control is shown and found
that the predicate and the copy disagree.

## The defect

`src/app/home/plan/recurring-session-controls.tsx` shows the two
whole-series scope controls — "Change this and future sessions" in edit mode
and "Remove this and all future sessions" in remove mode — only when
`canChangeFuture` holds. Since M3-19 round 3 (`f2f7108`) that is one shared
predicate, `occurrenceHasFutureRuleDate`, which requires all three of:

- the occurrence's rule date is on or after the series start date,
- the series has no end date, or the rule date is on or before it,
- **the rule date is on or after today.**

When the predicate fails, each mode renders a sentence explaining why. Both
sentences name the second condition only.

| Line | Copy | Wrong when |
| --- | --- | --- |
| ~191 | "This occurrence is outside the active dates of its ended series. Only this session can be changed." | The series has not ended and the occurrence is inside its dates. The rule date has merely fallen behind today. |
| ~255 | "This locked session outlived the series end date. The bulk removal would change nothing, so only this session can be cancelled." | The same case — and additionally whenever the session is not locked, which the branch does not require. |

The second string is the worse of the two. It asserts two facts, *locked* and
*outlived the series end date*, and the condition that reaches it implies
neither. It sits in the `else` of `canChangeFuture` in remove mode, which any
occurrence with a past rule date reaches, locked or not.

## How the state is reached

Move a recurring occurrence forward and wait a day. The occurrence keeps its
original rule date — that is what makes it an occurrence of the rule rather
than a one-off — and once that date is behind today the predicate fails while
the series is still perfectly active. M3-19's validation record documents the
same state from the delete side, as the `settled-occurrence` scope.

This is an ordinary consequence of the M3-14 move semantics, not an edge case
that needs contrivance to produce.

## Why it is worth a ticket

The strings are not merely vague. They tell the owner that their series has
ended when it has not, which invites them to go looking for a series they will
find alive, and in the remove case tells them a session is locked when it may
not be. A control that withholds itself should say the true reason or say
nothing; saying a false one is worse than either.

## Scope boundaries

- Copy only. Do not change `occurrenceHasFutureRuleDate`, which of the three
  conditions gates the controls, or when the controls render.
- Do not merge the two strings into one shared component. The edit and remove
  modes say different things about what remains possible, and that difference
  is correct.
- Preserve the serious-coach tone, the 390px path, and the existing
  `styles.consequence` treatment.

## Acceptance signals to write into the brief on approval

- Each string is true in every state that reaches it, or the branch is split so
  that each string is true in the state it names.
- The remove-mode string no longer asserts that the session is locked unless
  the branch that renders it requires that.
- No change to which controls render in which state, demonstrated by the
  existing M3-14B browser flow staying green without modification.
