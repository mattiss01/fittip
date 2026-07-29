# F-003: Goals, editable coaching context, and guided onboarding

**Status:** draft - product direction approved 29 July 2026; detailed
field, privacy, safety, UX, and architecture decisions remain unapproved

**Milestone:** M2

**Tickets:** [M2-01 goals](../backlog/M2/M2-01-GOAL-MODEL-VALIDATION.md),
[M2-02 editable coaching context](../backlog/M2/M2-02-MEMORY-MODEL-MANAGEMENT.md),
[M2-03 guided onboarding](../backlog/M2/M2-03-INTAKE-FACT-REVIEW.md), and
[M2-04 targeted closeout](../backlog/M2/M2-04-M2-VALIDATION-SLICE.md)

## User problem

FitTip cannot create trustworthy personalized plans or act as a serious coach
without explicit knowledge of the user's goals, training background,
possibilities, preferences, and constraints. Collecting that context only
inside a future AI conversation would make it difficult to inspect, correct,
delete, or distinguish confirmed facts from inference.

## Intended outcome

After account verification and first sign-in, FitTip offers a guided,
sport-agnostic onboarding that helps the user:

1. define and prioritize goals, including core and supporting goals;
2. describe the current training baseline and relevant experience;
3. record availability, time limits, equipment, locations, and other
   possibilities;
4. record preferences, dislikes, and coaching-style preferences;
5. optionally record approved constraints and health-adjacent limitations;
6. review, edit, accept, or reject every proposed goal and context item; and
7. inspect and edit the resulting records later in **You**.

M2 creates trusted context but makes no AI provider call. Later AI features
may use only active, explicitly accepted goal and memory records.

## Recommended user journey

1. A verified user signs in and receives a first-run invitation to set up
   coaching context. Authentication/profile creation succeeds independently of
   onboarding.
2. Existing users can start, resume, or revisit onboarding from **You**.
3. The user adds and orders goal cards with the accepted M2-01 fields.
4. The user completes short structured steps for training background,
   availability, possibilities, preferences, and optional constraints.
5. FitTip maps the structured answers deterministically to separate candidate
   goals and memory items.
6. A review screen shows the destination, value, and onboarding provenance of
   every candidate. Nothing is preaccepted.
7. The user accepts, edits and accepts, or rejects each candidate and resolves
   duplicates, contradictions, and goal-priority conflicts.
8. One explicit final action publishes the selected accepted records.
9. Completion links to **You -> Goals** and **You -> Coach context**. No plan
   or coaching response is generated in M2.

The onboarding is resumable and may be skipped without blocking the accepted
manual M1 features. The exact minimum context required before a future
AI-generated plan remains an open M2/M3 product and safety decision.

## Affected data and rules

- Goals are permanent owner-scoped records governed by M2-01, including the
  maximum of three active core goals and separate supporting goals.
- Coaching context is stored as explicit owner-scoped memory governed by
  M2-02, with type, status, provenance, history, and approved expiry behavior.
- Onboarding drafts and candidates remain separate from active goals and
  memory until explicit publication through M2-03.
- Onboarding provenance is visibly distinguishable from user-created,
  imported, or future inferred-proposed content.
- Draft, pending, rejected, disabled, archived, and expired records never
  enter active planning or coaching context.
- Editing onboarding-created records later uses the ordinary goal or memory
  domain operation; onboarding is not a privileged overwrite path.
- No onboarding operation changes accepted plans, completed training, or
  historical snapshots.
- Sensitive content is excluded from logs, analytics, URLs, screenshots,
  committed fixtures, and external requests.

## Approved product direction

The product owner approved these directions in chat on 29 July 2026:

1. Guided onboarding belongs in M2 rather than a separate milestone.
2. Goals are a central onboarding step.
3. Accepted onboarding data is visible and editable in **You**.
4. Onboarding runs after verified account creation/sign-in rather than inside
   the authentication transaction.
5. The flow is structured, progressive, resumable, and skippable.
6. M2 performs deterministic mapping only and makes no production AI call.
7. Future AI context may include only active, explicitly accepted records.
8. M2-04 should be a minimal targeted closeout that reuses the evidence from
   M2-01 through M2-03.

## Open decisions requiring product-owner approval

- Exact onboarding steps, fields, order, labels, help text, limits, and
  required-versus-optional behavior.
- The minimum accepted context required before future roadmap, plan, or coach
  generation can run.
- Training-background and current-baseline representation across arbitrary
  sports without misleading universal experience levels.
- Whether timezone and unit preferences are confirmed system suggestions,
  required answers, or editable defaults.
- Draft persistence, cross-device resume, expiry, cancellation, deletion,
  access/export, and retention.
- Existing-user invitation, deferral/reminder behavior, completion state, and
  whether onboarding can be restarted.
- Sensitive limitation fields, optionality, privacy classification, static
  non-diagnostic safety copy, and escalation/blocking behavior.
- Duplicate/contradiction handling and the transaction used to publish goals
  and memory atomically.
- The final **You** labels and information architecture, including whether the
  visible destination is named **Memory**, **Coach context**, or another term.

## Non-goals

- Public registration, external-user release, analytics, or a production
  claim.
- AI extraction from narrative text, a general "tell us everything" box,
  provider calls, plan generation, chat, or coaching output.
- Medical diagnosis, rehabilitation advice, treatment recommendations, or
  automatic interpretation of health-adjacent content.
- Silent acceptance, silent merging, inferred facts treated as confirmed, or
  onboarding drafts used as AI context.
- Rewriting accepted plans, completed training, or historical goal/memory
  revisions.

## Acceptance criteria

1. At `390x844`, an authenticated user can start, skip, resume, complete, and
   revisit the approved onboarding flow.
2. Goals are created only through explicit reviewed acceptance and preserve
   core/supporting and rank rules.
3. Every accepted context item is visible and editable under **You**, with
   status and onboarding provenance.
4. Draft, pending, rejected, disabled, archived, or expired content is absent
   from the active context selector.
5. Another user and an anonymous caller cannot read or mutate onboarding,
   goal, or memory records.
6. Retry, stale state, duplicate records, contradictions, and fourth-core
   conflicts fail safely without partial or silent publication.
7. Skipping onboarding does not block manual M1 planning and logging.
8. No AI provider, generated plan, diagnostic behavior, analytics sink,
   public signup, or external-user capability is added.

## Validation plan

- Independently implement, review, deploy, and accept M2-01, M2-02, and M2-03
  under their exact ticket contracts.
- Reuse those records for exhaustive schema, RLS, concurrency, history,
  accessibility, privacy, and failure-state evidence.
- Close M2 with the minimal M2-04 targeted hosted walkthrough and current
  deployment/migration/RLS/advisor evidence rather than repeating the complete
  suites.

## Approval boundary

This brief records the approved M2 onboarding direction. M2-01 was separately
approved for implementation on 29 July 2026 and is in development. M2-02 and
M2-03 remain proposed until their open product, privacy, safety, UX, and
architecture decisions are approved. Public or external-user onboarding
additionally remains blocked by the M0 recovery, privacy implementation,
instrumentation, and hosted-quality gates.
