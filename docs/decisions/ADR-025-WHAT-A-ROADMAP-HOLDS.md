# ADR-025: What a roadmap holds

**Status:** accepted — the product owner decided it on 10 October 2026.

**Date:** 10 October 2026

**Ticket:** "Roadmap: a slimmer shape" in [`docs/backlog/NEXT.md`](../backlog/NEXT.md)

**Builds on:** [ADR-015](ADR-015-M3-ROADMAP-TRANSACTIONS.md) (how a roadmap proposal is
stored, edited and accepted) and [ADR-023](ADR-023-WHAT-THE-COACH-IS-GIVEN.md) (what each
coach call reads). It amends the list of what a roadmap's content holds, and the rule of
20 September 2026 for what a plan call reads of the phase its week falls in.

## Context

A roadmap held more than anyone used. The owner went through it part by part on
10 October 2026, as with goals, before the work of writing a roadmap by hand: a form for
the shape as it stood would have had about twenty required fields for three phases.

Three of the parts reached no coach call and were read only by the owner: assumptions,
uncertainties and the coach's safety sentences. A fourth, the written reason beside each
goal's attention level, reached the plan call for the phase being planned and nothing else.
Every phase had to have a milestone, which asks a coach to invent one for a phase that has
no honest checkpoint.

## Decision

1. **A roadmap is its direction and when to look again.** Title, summary, start and end;
   one to six phases, each with a title, a focus, dates, and one to four goals at a level
   of attention; milestones; one to four review points. This is `fittip.roadmap.v3`.
2. **Assumptions and uncertainties go.** What could change the direction is a review
   point with a condition, which the roadmap already has.
3. **The reason beside an attention level goes.** A level is `primary`, `secondary`,
   `maintenance` or `deferred` and nothing more. A phase says what it is for in its focus.
   The plan call therefore no longer reads a reason, for a roadmap stored under v2 either.
   The owner decided this knowing the plan call had read it.
4. **The coach's safety sentences go, entirely.** The owner chose this over keeping a rule
   that a roadmap written with a flag present must carry a review point about it. From v3,
   nothing checks that a roadmap written after a reported pain, illness, injury or severe
   fatigue acknowledges it. What is unchanged: the roadmap call is sent the flag and the
   safety rules of the shared prompt; clinical wording is still refused in every field
   that remains; the Roadmap still shows the application's own fixed notice while a recent
   log carries a flag; and the plan and the fill, which decide actual sessions, still must
   acknowledge a flag or be refused.
5. **A phase may have no milestone.** Zero to three.
6. **Nothing stored is rewritten.** Proposals and accepted versions are permanent records.
   One made under v2 keeps its content and its version, is shown with the sections it
   holds, and can still be accepted or declined. Nothing can be written as v2 any more: an
   edit of a v2 proposal is saved as a v3 proposal beside it, without what v3 dropped.

## How it is held

- The application's validator and the response schema sent to the provider name the v3
  fields and refuse any other, so a coach that still returns a removed field produces a
  refused result and not a stored one.
- The database checks the same names independently (`roadmap_content_is_valid`), including
  the keys of an attention entry, and `finish_roadmap_generation` accepts a result only as
  v3. `roadmap_proposals.schema_version` may be v2 or v3.
- `apply_roadmap_proposal_change` stores an edit under the version of the content it was
  given. The prompt and provider codes are still copied from the proposal edited, so an
  edit of an example stays labelled an example.

## Consequences

- The roadmap prompt is 326 characters shorter and the plan call's roadmap part smaller,
  so one step of its reduction ladder (emptying reasons) no longer exists.
- A roadmap screen shows less: the phases, their goals and milestones, and the review
  points. The older sections appear only on records made before this.
- The prompt was verified against the built-in example coach only. There is no provider
  key, so the first live roadmap under v3 is untested until there is one.

## Not decided here

Whether a milestone was reached, review points that show when their date arrives, and
writing a roadmap by hand are separate items in `NEXT.md`, decided by the owner the same
day and built after this.
