# ADR-027: A review after every phase

**Status:** accepted — the product owner decided it on 13 October 2026.

**Date:** 13 October 2026

**Ticket:** "Review points that show" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md), which
this replaces.

**Builds on:** [ADR-025](ADR-025-WHAT-A-ROADMAP-HOLDS.md) (what a roadmap holds; it amends
that list again) and [ADR-026](ADR-026-WHETHER-A-MILESTONE-WAS-REACHED.md) (a record beside
an accepted version, written through one function). It changes what the coach is asked to
write, and adds one table and one `SECURITY DEFINER` function.

## Context

A roadmap carried one to four review points the coach wrote: a title, a question, and a
date or a condition. They were shown and did nothing. A date passed silently, and a
condition could not be checked by anything. The first plan was to make the dated ones
show; the owner replaced it with something simpler.

## Decision

1. **Reviews are the app's.** There is one as each phase of the roadmap in force ends,
   the last of them being the end of the roadmap. Nobody writes them, neither the coach
   nor the owner.
2. **A roadmap no longer holds review points.** This is `fittip.roadmap.v4`: title,
   summary, start and end, and one to six phases with their goals and milestones. What is
   lost is a review on a condition ("when the long run reaches 90 minutes").
3. **A review is due from the phase's last day**, by the owner's own calendar.
4. **Only the latest ended phase asks.** A review is of the roadmap as it stands, so
   there is never a backlog. "Reviewed" clears everything up to today, and so does
   accepting a new roadmap, since a review belongs to the roadmap in force.
5. **It shows in two places:** a dot on the Plan's "Roadmap" button, and a card above the
   roadmap on its page with "Reviewed". No line on the Plan itself, and no notification
   outside the app.
6. **Nothing replans and no coach is asked.** "Change with Coach" will be offered from a
   due review once it exists; that is its own item.
7. **Nothing stored has to survive.** The owner said so the same day. Rows written under
   v2 or v3 are neither rewritten nor deleted; the application reads from them only what
   v4 holds. So the review points of an earlier roadmap, and the assumptions,
   uncertainties, safety sentences and attention reasons kept readable since ADR-025, are
   no longer shown, and the code that showed them is gone.

## How it is held

- **Which review is due is arithmetic**, not a record: the accepted version's phase end
  dates against the owner's today (`roadmapReviewDue` in
  `src/server/roadmap/roadmap-reviews.ts`). The page, the Plan's dot and the tests ask
  the same function.
- **That the owner looked is a record**, `roadmap_review_marks`: one row for an accepted
  version, holding the latest phase marked reviewed and the owner's local day. Read by
  its owner; written by nobody directly.
- **`set_roadmap_reviewed(version, phase)`** is the one way to write it. Owner from
  `auth.uid()`, day from the confirmed time zone. It refuses a version that is not the
  caller's roadmap in force and a phase that has not ended, reading the end date from the
  stored version itself, with one refusal for every reason. It only moves forward, so a
  repeat or an older page changes nothing. There is no taking it back: the mark hides a
  reminder and nothing else.
- **The validator and the provider's response schema** name the v4 fields and refuse any
  other, so a coach that still writes `reviewPoints` produces a refused result.
  `roadmap_content_is_valid` checks the same names independently, and
  `finish_roadmap_generation` accepts a result only as v4.

## Consequences

- The roadmap prompt is shorter again, and the roadmap editor loses its review point
  fields. "Write a roadmap yourself" has one section fewer to build.
- One more `authenticated_security_definer_function_executable` warning on the hosted
  project's security advisors.
- A due review cannot be produced in a browser flow: the coach starts a roadmap today, so
  no phase has ended. It is proved in unit and database tests, and was looked at on a
  local database with a phase moved into the past by hand.
- The prompt was verified against the built-in example coach only, as with v3.
