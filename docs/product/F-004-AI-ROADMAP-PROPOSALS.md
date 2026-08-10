# F-004: AI roadmap proposals

**Status:** approved — approved by the product owner on 10 August 2026;
implementation remains separately gated

**Date approved:** 10 August 2026

**Milestone:** M3

**Delivery ticket:**
[M3-02](../backlog/M3/M3-02-ROADMAP-PROPOSAL.md)

## User problem

An owner can record goals, memory, planned sessions, and completed training, but
FitTip cannot yet turn that accepted context into a coherent direction for the
next several weeks or months. A detailed calendar is too specific for this job,
and raw AI prose would be neither bounded nor safely reviewable.

## Intended outcome

The authenticated owner can compose, generate, inspect, regenerate with
feedback, edit, decline, and explicitly accept a structured, sport-agnostic
roadmap proposal. The roadmap shows phases, observable milestones, ordinal
attention across active goals, assumptions, uncertainties, and review points.
It remains a proposal until the owner accepts it, and every accepted roadmap is
a new immutable version rather than a rewrite of history.

This feature is strategic direction, not a detailed training plan.

## Owner journey

1. Under **Plan → Roadmap**, the owner sees either the current accepted roadmap
   or an honest empty state.
2. **Create roadmap** or **Propose a new roadmap** opens **Shape your roadmap**;
   opening the screen does not generate or spend.
3. The owner chooses an end date within the approved 4-to-52-week horizon,
   reviews a collapsed disclosure of the exact eligible context, and may add a
   planning note of at most 1,000 characters.
4. **Generate roadmap proposal** makes one bounded request. The current roadmap
   remains unchanged while it is pending or if it fails.
5. The proposal is reviewed on one mobile roadmap spine at `390x844`, including
   phases, milestones, goal attention, assumptions, uncertainties, review
   points, rationale, and any required static safety copy.
6. Extracted **Possible memory updates** remain separate `proposed` items. Each
   can be accepted, edited and accepted, or declined independently of the
   roadmap.
7. The owner chooses **Accept roadmap**, **Edit proposal**, or **Decline
   proposal**. Editing creates another proposal. Acceptance creates a new
   immutable current roadmap version and preserves the prior version.
8. After declining, **Regenerate proposal** opens the compose screen with the
   same dates and a prefilled, editable planning note. A separate **What should
   the coach change?** field starts empty and is required, up to 500 characters.
   The immediately previous proposal travels as context; no earlier chain does.

## Product rules

- The response contract is `fittip.roadmap.v2` and follows the bounded shape
  approved in M3-02 decisions 1-6 and 8.
- Relative goal attention is ordinal (`primary`, `secondary`, `maintenance`,
  or `deferred`), never a percentage. `deferred` changes no goal state.
- The interface presents uncertainty as actionable language and says
  **Direction, not a promise.** It shows no model confidence score.
- Proposals, proposal decisions, and accepted roadmap versions are distinct
  permanent records. Edits and supersession never rewrite earlier content.
- Only eligible, owner-scoped, current source records may travel. The context
  disclosure names omissions caused by an approved count or byte limit.
- The planning note is provider-bound owner text under ADR-014. It has no
  authority over dates, schema, context eligibility, safety, limits, writes, or
  acceptance.
- Regeneration is a new request and provider charge, not a retry. It preserves
  the original horizon, carries only the immediately previous proposal, and is
  capped at three regenerations per horizon. Changing the dates starts a fresh
  request instead. At the cap, the owner is directed to deterministic editing.
- Regeneration feedback is mandatory, starts empty on every round, is stored
  with its proposal, and never produces a memory candidate. The prefilled
  planning note remains the only owner-text source for memory extraction.
- A response may return at most four memory candidates. Each identifies a
  memory type and an exact excerpt of at most 200 characters from the planning
  note; that excerpt becomes the proposed memory text. The server rejects the
  whole memory section if an excerpt is absent from the note, so feedback cannot
  silently become memory. The roadmap section remains independently valid.
- No pain, illness, injury, or severe-fatigue flag automatically blocks roadmap
  generation. A present flag requires the approved static non-diagnostic copy,
  conservative direction, at least one safety consideration, and a relevant
  review point. Unsafe output is rejected; there is no timer, keyword
  classifier, inferred recovery, or waiver.
- The live composition root binds the configured model and its price as one
  approved model/rate-card pair and refuses a mismatch.
- Generation and acceptance are separate owner-derived transaction boundaries
  under the separately approved M3-02 transaction ADR.
- Owner/synthetic local and founder-hosted use only. The founder environment is
  not a public or commercial launch.

## Acceptance criteria

1. The complete compose, pending, proposal, decline, regenerate, edit, conflict,
   safe-error, accept, current, and superseded-history paths work at `390x844`
   with keyboard focus, reduced-motion support, and honest empty states.
2. Only accepted active goals and memory, ADR-013 training history, current plan
   commitments, and the bounded planning note enter the request; owner and
   source versions are revalidated server-side.
3. Planning-note and regeneration-feedback injection fixtures prove that owner
   text cannot change the horizon, output schema, eligibility rules, safety
   rules, limits, or write behavior.
4. The structured candidate satisfies all v2 bounds. Unknown, malformed,
   unsafe, business-invalid, or source-invalid output creates no proposal and
   no active roadmap.
5. Extracted memory candidates are `inferred_proposed` / `proposed`, never enter
  coaching context before explicit review, and do not share a decision with
  the roadmap. Every candidate is an exact bounded planning-note excerpt;
  feedback-only text is rejected. Invalid or failed candidate persistence does
  not invalidate a valid roadmap.
6. Same-key retries do not make a second provider call or duplicate a proposal.
   Each regeneration has a new key, request, reservation, and charge; it carries
   only the immediately previous proposal, keeps the horizon, requires bounded
   feedback, and cannot exceed three rounds. Proposal persistence,
   memory-candidate persistence, edits, declines, and acceptance are idempotent
   at their stated boundaries.
7. Acceptance rechecks proposal ownership, source currency, and the expected
   current-roadmap revision in one transaction. A stale or competing write
   returns a visible conflict and no partial version or pointer change.
8. Anonymous and cross-owner reads and mutations are denied by grants, RLS,
   server ownership checks, and database tests.
9. Prompts, provider bodies, planning-note/source duplication, credentials, and
   raw errors do not enter telemetry, logs, URLs, screenshots, snapshots, or
   client bundles.
10. The exact ticket commit has green CI, independent review, a `READY` Vercel
    Preview, exact hosted migration/RLS/privilege/read-path evidence, and the
    product owner's explicit mobile acceptance before merge.

## Non-goals

- Detailed dated sessions, a selected-horizon plan, replanning, logging,
  progress metrics, notifications, or automatic roadmap mutation.
- A global activity or exercise library, sport-specific capability pack,
  unbounded chat, diagnosis, treatment, or medical clearance.
- Friends' data, public registration, commercial use, analytics, a new remote
  resource, another provider/model, or spend beyond the accepted M3 controls.
- Per-proposal deletion or automatic expiry. Account-level export/deletion and
  the commercial retention policy remain later privacy work.

## Approval boundary

This brief approves the user-visible M3-02 behavior above. ADR-015 was approved
separately on 10 August 2026. Neither approval dispatches implementation,
approves M3-03, or authorizes wider external use. The product owner explicitly
paused M3-02 dispatch after approving both documents.
