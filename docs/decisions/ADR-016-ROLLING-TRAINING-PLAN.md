# ADR-016: One rolling training plan with session-level history

**Status:** proposed — not approved

**Date proposed:** 14 August 2026

**Feature brief:**
[F-005](../product/F-005-ROLLING-TRAINING-PLAN.md)

**Would supersede for new planning writes:**
[ADR-008](ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md)

## Context

ADR-008 and accepted M1 store one current immutable detailed plan version for
an owner-selected 1–7-day horizon. A planned session belongs to that version,
so adding or changing one session means saving another whole-plan version. The
same horizon shape became the expected destination for accepted M3 proposals.

The product direction now separates manual plan storage from AI request scope.
An owner should see one continuous plan, add sessions on arbitrary eligible
future dates, and define recurring sessions. Only an AI planning operation is
bounded to 1–7 days. The design must improve that mental model without losing
authorization, concurrency, planned-versus-actual separation, proposal review,
or immutable history after the replacement model is activated.

Repeated manual training also needs reuse without introducing the global
exercise library the product deliberately excludes.

## Proposed decision

Use one stable owner-scoped rolling training plan. Do not snapshot the complete
plan on every save and do not make it an unversioned mutable calendar.

Store each planned session under a stable identity in one directly readable
current row. In one server-controlled transaction, update current state, append
an immutable plan change set with before/after entries and provenance, and
advance one monotonic owner plan revision. A cancellation marks current state
cancelled and records the change; it is not a destructive delete. Completed
sessions remain separate factual records and retain immutable planned
snapshots.

Represent recurrence as constrained, effective-dated recurring session series
plus explicit occurrence exceptions. Expand a series only for a caller's
bounded owner-local date slice; never pre-create an infinite future. A
this-and-future change closes the prior effective series segment and creates a
successor, preserving earlier meaning.

Give every owner a private saved-session library. A saved session is one
editable current template record, distinct from a personal activity and from a
dated planned session. An explicit owner action may save an eligible session or
Coach suggestion without adding or accepting it in the Plan. Reuse copies the
template's current fields into a new one-off session or recurring-series
template; it never creates a live link. Editing or deleting the library entry
therefore changes no planned or completed training. V1 has no saved-session
revision chain, archive state, automatic duplicate detection, or merging.

Treat the accepted M3 1–7-day output as an immutable proposal for changes to a
rolling-plan slice. Per-item **Proposed**, **Will be added**, and **Rejected**
choices are reversible review input and do not write the Plan. **Finish review**
revalidates the staged selection and atomically creates one owner-derived plan
change set containing only **Will be added** items. Rejected or still-proposed
items never enter the Plan. **Recovery day** is a day-level label rather than a
session. It may coexist with sessions, does not count toward the daily session
limit, and is not inferred from an empty date or from session changes. An
explicit AI recovery recommendation is reviewed as an independent proposal item
before the label is added. FitTip does not automatically judge whether a session
contradicts it. Finishing requires a choice for every proposal item. A separate
discard action adds nothing and, when any item is staged **Will be added**,
requires explicit confirmation that those sessions or labels will not enter the
Plan.

Regeneration creates a new charged request for the same horizon. Carry
**Will be added** items into the successor unchanged, remove rejected items from
the new review, and let the AI keep or revise still-proposed items. Per-session
feedback is optional and unavailable for accepted items. Require overall
feedback unless at least one rejected item has feedback. Supply only the
immediate predecessor and retain the three-round cap. Feedback remains request
context and never becomes memory automatically.

Build proposal review as a composition of the current bounded rolling-plan
slice and the immutable proposal, not by copying existing sessions into the
proposal. Show both record sets together under their horizon dates with explicit
**Already planned** and **Coach suggestion** labels. Only proposal items have
proposal decisions. An **Already planned** session may open the normal Plan
editor within this review surface. Saving uses the ordinary Plan transaction and
history immediately; it refreshes the current layer, preserves the immutable
proposal and all staged choices, and survives proposal discard. Show a
non-blocking warning that the suggestions predate the change and offer
regeneration, but do not require it solely because the Plan changed. **Finish
review** revalidates selected suggestions against current Plan state and surfaces
actual conflicts explicitly.

Make a one-time clean cutover with no backfill or compatibility archive. Delete
all pre-cutover detailed-plan versions and heads, planned sessions and
activities, plan-generation requests and proposals, proposal sources and
decisions, completed sessions and activities, completion heads, and correction
revisions. Initialize the rolling plan empty. Preserve profiles, goals, memory,
onboarding, roadmaps, personal activities, spend/accounting, and security/audit
records. Accepted governance and validation documents remain historical facts;
the deleted runtime records do not remain available in the application.

This is a product-owner-chosen, one-time exception for founder/test data, not a
general deletion rule. All rolling-plan proposals, plan changes, planned
snapshots, completions, and corrections created after activation are permanent
under the normal invariants.

Complete and accept every replacement path, including AI proposal application
and regeneration, before that destructive activation. Founder-app availability
and legacy planning continuity are not requirements during the replacement, so
the environment may show maintenance or be temporarily unavailable. Do not add
dual writes, compatibility synchronization, or an interim manual-only release.
Activate the complete rolling-plan experience together after the cutover.

The final cutover uses a dedicated approved runbook. Prove the exact migration
locally from clean and seeded old-model databases, require exact-commit
independent review and green CI, and verify a Vercel maintenance Preview plus
non-destructive hosted preflights without applying the migration to founder
data. Record row counts and preserved-domain checks without creating a manual
backup or training-data export. This cutover alone receives a narrow exception
to the ordinary pre-acceptance hosted-migration rule. After an explicit **Run
the destructive cutover** confirmation, apply the exact migration, reconcile
remote migration history, deploy the complete replacement, and immediately
verify authentication, empty Plan initialization, preserved domains,
schema/RLS/privileges/advisors, authenticated owner and denied cross-owner
paths, and the main mobile flows.

Put recurrence expansion, change logging, conflict detection, ownership, and
atomic persistence behind one rolling-plan module interface. UI and AI callers
request bounded slices and submit change sets; they do not construct owners,
split current-state writes from history, or write plan tables directly.

Every new owned record, including saved sessions, carries immutable owner scope.
Same-owner composite references, explicit privileges, RLS, owner-derived
transactions, bounded lock waits, idempotency, and stale-plan-revision checks
remain mandatory. No service-role application client is introduced.

## Considered options

### Keep bounded immutable plan versions

Rejected for future planning. It preserves history well but makes a continuous
calendar and recurring sessions behave like repeated short-plan replacement.
The 1–7-day limit belongs to the AI operation, not manual plan identity.

### Use mutable session rows without first-class history

Rejected. It gives the simplest interface but erases what was planned, weakens
planned-versus-actual evidence, and lets retries, conflicts, or AI changes
silently rewrite history.

### Snapshot the entire endless plan after every change

Rejected. It retains the current versioning idea but copies an ever-growing
calendar for a one-session edit, makes open-ended recurrence snapshots
artificial, and produces history that is harder for the owner to understand.

### Preserve and backfill the old runtime records

Rejected. It would carry the short-plan mental model and unwanted founder/test
history into the replacement. The owner chose an empty operational start.

### Use current session rows with an atomic append-only change log

Proposed. It keeps ordinary plan reads simple while preserving granular history
after activation. One transaction owns the current update, before/after change
entries, grouped provenance, and plan-revision increment, so callers cannot
create drift. It avoids session-revision chains, current-head pointers,
whole-plan snapshots, and full event-sourcing infrastructure.

## Consequences

- Manual planning no longer uses a day-count selector or whole-plan save.
- Owners can reuse their own saved sessions without FitTip shipping or exposing
  a global/shared template library.
- Old-model plan, plan-proposal, and completion data is absent after cutover;
  there is no in-app legacy reader, backfill, or recovery path.
- Plan, Today, Progress, completion lookup, training-history context, AI
  proposal acceptance, replanning, and mobile tests must be ready to move to the
  rolling plan when the destructive activation occurs.
- The founder environment may be unavailable during replacement delivery;
  preserving a usable legacy or interim manual-only experience is not part of
  the migration contract.
- Current plan reads use direct session rows. History uses the append-only
  before/after change log, while a monotonic plan revision provides owner-level
  stale-write protection and grouped atomic changes.
- Recurrence becomes a first-class source of planned sessions and requires
  explicit occurrence identity, exception, DST, query-bound, and edit-scope
  rules.
- M3-03 generation remains reusable. M3-03B and later acceptance/replanning
  tickets require replacement scopes and cannot be dispatched against the old
  whole-plan destination.
- Proposal review needs a composed bounded read model so existing sessions and
  suggestions share one day timeline without losing their distinct identities,
  provenance, mutability, or authorization rules.
- The migration is Tier 1 and cannot be treated as a refactor. It changes
  schema, authorization, RLS, concurrency, accepted data routing, and the
  meaning of current planned state.
- The destructive transaction is reversible only before commit. Provider
  backups may retain deleted bytes under their own retention rules.
- Preserved roadmap records may carry minimized references to deleted plan or
  completion sources. Such undecided proposals expire and cannot be accepted;
  accepted roadmap content remains unchanged.

## Approval boundary

The product owner approved F-005 and selected the clean-cutover data boundary,
delivery ordering, and destructive deployment protocol on 14 August 2026; this
ADR as a whole remains proposed. F-005 approval does not authorize a migration,
remote database change, implementation ticket, provider call, spend, or wider
use. The destructive founder cutover requires its own approved runbook, exact
reviewed commit, and explicit final confirmation. The working agreement also
needs a separately authorized, one-cutover amendment before implementation.
