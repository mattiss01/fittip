# M3-15D validation: bounded AI completion context

**Ticket:** [M3-15D](../../backlog/M3/M3-15D-AI-COMPLETION-CONTEXT.md)
**Status:** builder handoff complete. Independent exact-commit review, the
continuous-integration run for the reviewed SHA, the Vercel Preview, and
product-owner acceptance are all outstanding.
**Tier:** 1
**Branch:** `ticket/m3-15d-ai-completion-context`
**Base:** `9b66e4c2356b8d58bdaab875513810ef83acd175`
**Implementation review target:**
`2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c` — the last source commit. The
record commit that adds this file changes no application file (the
evidence-commit exception in `AGENTS.md`).
**Review range:**
`git diff 9b66e4c2356b8d58bdaab875513810ef83acd175..2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c`

Implementation commits, in order:

| Commit | Purpose |
| --- | --- |
| `3d9b9f4b61ecc90cd0abd68c4d6717587ce94e05` | `correctionReason` and its truncation constant are deleted from the allowlist, the contract, and the two dependants. |
| `f38a5eee711ffd76ae6e2e7c6172771b4e324259` | The history selection now returns the input records it actually transmitted. |
| `1514db8b7859b4cb12fd3c7bd045c6526753f471` | The production context source, and the composition root's fallback to it. |
| `2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c` | Its tests, including the out-of-allowlist field proof. |

## Delivered behavior

No user-visible behavior changes. This ticket builds the server seam a later
surface needs.

Before it, `CoachAIContextSource` had no production implementation at all: M3-11
deleted the legacy database adapter, and every implementation of the interface
was a test stub or a fixture. `OwnedRecordsCoachAIContextSource` is the first
one that reads a real owner's records. Given a verified `CoachAIOwner` it:

- reads the owner's stored IANA zone from the profile and derives owner-local
  today from it, or refuses;
- reads goals and memory through their repositories, with their collection
  revisions, which is what the idempotency fingerprint is built from;
- reads the completion log over the accepted 56 owner-local days ending today;
- tops the plan window up and then reads one slice spanning the same 56 days
  back and 180 days forward, so the miss list and every locked commitment
  ADR-013 decision 5 admits are both covered by one read;
- reduces each completion to the ADR-013 allowlist field by field, and reports
  which planned sessions are cancelled, completed, or missed;
- records as the proposal's sources only the completions a trim actually
  transmits.

The composition root now falls back to it, so a request that injects no context
source is served by the owner's real records rather than by whichever stub was
wired in last.

`correctionReason` and `CORRECTION_REASON_MAX_LENGTH` are gone from `src/`. They
described a column the replacement completion schema does not have, per the 29
August 2026 ADR-013 amendment, which the ADR already records.

## Mobile demo path

**There is none, and that is the ticket's scope rather than an omission.** The
change is server-only: no route, no component, no Server Action, no copy, and
nothing that renders at 390x844. The roadmap surface that will exercise this
source is M3-15E and proposal application is M3-16.

The Vercel Preview for the reviewed commit is still required, as evidence that
the branch builds and deploys and that no existing surface regressed. Every
`/home` surface should behave exactly as it does on `master`; a difference is a
finding.

## Changed files

```
 src/server/ai/composition.test.ts                  |  37 ++
 src/server/ai/composition.ts                       |  19 +-
 src/server/ai/context-source.ts                    |  11 +-
 src/server/ai/context.test.ts                      |   4 -
 src/server/ai/contracts.ts                         |   1 -
 src/server/ai/fixtures/fixture-corpus.ts           |   1 -
 src/server/context/coach-ai-context-source.test.ts | 494 +++++++++++++++++++++
 src/server/context/coach-ai-context-source.ts      | 273 ++++++++++++
 src/server/training/training-history-context.ts    |  20 +-
 9 files changed, 844 insertions(+), 16 deletions(-)
```

Nothing was deleted or renamed. `src/server/context/` is a new directory holding
one module and its test.

Files whose purpose is not evident from the path and diff:

- `src/server/context/coach-ai-context-source.ts` — the production
  `CoachAIContextSource`. It lives outside `src/server/ai` deliberately:
  `src/architecture/server-boundary.test.ts` holds `src/server/ai/owner.ts` as
  the only file in that module permitted to import a repository, so that no
  adapter, prompt, or validator can widen the context past what the domain
  service authorized. Placing a repository-reading module there would have meant
  weakening that invariant in the one ticket whose subject is the data boundary.
  It sits beside the AI's other data-shaping modules instead —
  `training/training-history-context`, `goals/goal-records`,
  `memory/memory-records` — none of which are in `src/server/ai` either. The
  module's own header states this.
- `src/server/training/training-history-context.ts` — beyond the
  `correctionReason` deletion, `TrainingHistorySelection` gains
  `includedCompletions`: the input records the selection transmitted, as the
  caller's own object identities. It exists so the source can name the exact
  transmitted set without `TrainingHistoryCompletion` gaining an id that
  `toCompletionReference` could copy. Nothing serializes it; only `history`
  crosses the boundary.
- `src/server/ai/composition.ts` — `contextSource` becomes optional and defaults
  to the production source, constructed with the operation the root is already
  building. This is the ticket's reading of acceptance criterion 1, and it is an
  interpretation rather than a literal instruction: no production caller of
  `createRoadmapCoachAIService` exists yet, so "what the composition root
  receives for a real request" was made true by making the production source the
  default rather than by wiring a route that M3-15E owns.
- `src/server/ai/composition.test.ts` — the two new assertions reach past the
  service's TypeScript-private `deps` bag. Which context source a real request
  is served by is not otherwise observable, and it is the one thing this wiring
  decides about owner data.

## Data, migration, API, privacy, and security effects

**Schema, migrations, RPCs, generated types, packages: none.** No file under
`supabase/` and no `package.json` entry is touched. Nothing in this ticket
needed a grant, a policy, or a privileged function; had it, the instruction was
to stop and re-dispatch against M3-15A.

**Ownership and authorization.** The source accepts no owner id from a caller.
It reads only through `createProfileRepository`, `createGoalRepository`,
`createMemoryRepository`, `createCompletionLog`, and `createRollingPlan`, each
of which derives identity from verified Auth claims and repeats the `user_id`
predicate over RLS. There is no SQL, no Supabase client, and no `verified-user`
import in the new module. `load(owner)` takes the branded `CoachAIOwner` only so
`CoachAIService` can compare `records.ownerId` against the owner it asked about,
which it already does.

**What can now leave for an external provider.** Exactly the fields ADR-013
decision 4 enumerates and the product owner re-approved on 14 September 2026,
for up to 20 completions from the last 56 owner-local days: `localDate`,
`status`, `title`, `sport`, `durationMinutes`, `perceivedEffort`, `feeling`, the
four health booleans, `note` truncated to 400 characters,
`replacementDescription` truncated to 240, and `activityNames`. Every one is
copied individually in `toTrainingHistoryCompletion`; no `Completion` is spread
and none is passed through. The record's `id`, `planSessionId`, `timezoneName`,
`revision`, `updatedAt`, `actualStartedAt`, planned snapshot, and per-activity
measurements stay behind. `actualStartedAt` stays out by the 14 September 2026
decision and is asserted out by name in the tests.

Goals and memory are handed to assembly as the repositories return them, which
is what `CoachAIGoalRecord` and `MemoryItemView` were accepted as. Both are
reduced by `toGoalReference` and `toMemoryReference` — field-by-field allowlists
inside `context.ts` — before anything is serialized. Completions have no such
second gate, which is why they are reduced in the source instead.

**The write side effect.** `readPlanWindowToppedUp` materializes missing series
occurrences, and the source calls it exactly once, in `load`, before reading the
slice. That is ADR-017 consequence 3 and approval-boundary decision 4: a coach
reading an untopped window plans around sessions the owner does have. It is
deliberately the opposite of M3-15C, where viewing history must not materialize
future training. A top-up failure never fails the read; the slice is returned
with `toppedUp: false`.

**No provider call was made, and none can be made by this change.** Every check
ran in fixture mode. No `FITTIP_AI_*` variable was set, no credential was read,
and no network request was issued to any provider. `src/server/context/` holds
no network primitive; `src/architecture/coach-ai-network-gate.test.ts` still
passes with `openai-adapter.ts` as the one module that can reach the network.

**Browser storage:** unchanged; nothing client-side is touched.

## Tests and final results

**Continuous integration: not yet run.** The branch is local at the time of
writing, so there is no run URL for `2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c`
to cite. The lead pushes the branch and records the run URL and conclusion here
before independent review. A red or absent run for that SHA is a delivery
blocker.

Tests added or changed:

- `src/server/context/coach-ai-context-source.test.ts` — new, 10 tests. It mocks
  the five repository factories and asserts: the refusal for an owner with no
  confirmed zone and for one with no profile row, and that nothing else is read
  in that case; the owner-local derivation of today and of both window ends;
  that the plan window is topped up with the revision the slice reported, once;
  the field-by-field completion mapping; the out-of-allowlist proof below;
  unplanned completions reporting a null title and sport; cancelled planned
  sessions appearing as neither commitment nor miss; and that `sources` names
  only the completions each operation's own limits transmit.
- `src/server/ai/composition.test.ts` — two assertions that a composition with
  no injected source gets `OwnedRecordsCoachAIContextSource`, and that an
  injected stub still wins.
- `src/server/ai/context.test.ts` — four `correctionReason: null` lines removed.
  Nothing else in that file moved; no assertion changed.

**Acceptance criterion 2, specifically.** The test `copies only allowlisted
completion fields, whatever else the record carries` adds three fields to a real
`Completion` — `actualStartedAt` with a real value, plus `clinicalNote` and
`heartRateAverage` standing in for whatever the schema gains next — then runs
`buildCoachAIContext` and asserts that neither the keys nor their values, nor
the completion's id, `timezoneName`, `planSessionId`, `updatedAt`, or
`plannedSnapshot`, appear anywhere in the serialized payload.

| Command or check | Result |
| --- | --- |
| `npm.cmd run test:run -- src/server src/architecture` | 38 files, 585 tests passed |
| `npm.cmd run typecheck` | passed |
| `npm.cmd run lint` | passed |
| `npm.cmd run build` | passed; all 21 routes compiled |
| `git diff --check 9b66e4c..HEAD` | clean |
| `npx.cmd prettier --write` on each changed file, then `git diff` | no content change |

These are the narrow checks a builder runs while implementing. They are not a
substitute for the CI run on the reviewed SHA, and the database and browser
matrices were not run locally at all.

## Known limitations

1. **Never exercised against a real provider.** Approval-boundary decision 2,
   accepted in advance: this ships fixture-only. Whether `gpt-5.6-luna` holds
   the contract against a real owner's context stays open, exactly as it does
   for M3-02 limitation 3.
2. **Never exercised against a real database.** Every test here mocks the five
   repository factories. No hosted or local Supabase read was performed, so the
   claim that the plan slice, completion window, goal collection, and memory
   collection compose correctly against real rows is unverified. Nothing in this
   ticket runs on a Preview either, because no surface calls it. M3-15E is where
   this source first meets real data, and that is a genuine gap this ticket
   cannot close.
3. **`sources` is exact by construction, not by compilation.** Assembly is what
   trims, and it runs after the source. So the source runs
   `selectTrainingHistoryContext` itself with the same accepted limits, which is
   exact only because the completion side of that selection depends on nothing
   but `today`, the records, the session cap, and the completion byte sub-budget
   — never on the horizon or the plan-commitment limits assembly also passes. If
   that ever stops being true the source over-reports, and no type error will
   say so. It is stated in the module and repeated here rather than left to be
   rediscovered. A test asserts the two agree for both operations.
4. **An unplanned completion carries no title and no sport.** They come from the
   planned snapshot, and an unplanned completion has none. Reporting null is
   honest; deriving a sport from the logged activities would invent a session
   the owner never planned. The coach still sees the status, the duration, the
   effort, and the activity names.
5. **The miss list can misread a completion logged outside the window.** A
   planned session inside the 56-day window whose completion has an
   `actualLocalDate` outside it is not in the completion read, so the session is
   reported as missed. This needs a completion recorded against a session more
   than eight weeks from its planned date, so it is rare, but it is a real way
   the adherence signal can be wrong.
6. **The forward plan read is 180 days wide.** Nothing bounds a
   `get_rolling_plan_slice` window, and series materialization only fills 14
   days forward, so in practice the far end returns only manually created
   sessions. It has not been measured against an owner with a large hand-built
   future plan.
7. **`sources` records completions only.** Goal and memory provenance already
   travels as `assembled.references`; plan provenance is recorded nowhere. M3-16
   owns proposal application and is where that gap has to be closed or
   explicitly accepted.
8. **`horizonEndDate` on the records the source returns is `today`.** `load` is
   not given the compose input and must not invent a horizon; assembly replaces
   the value with the one the owner actually composed against. It is inert, but
   a reader of `CoachAIOwnedRecords` in isolation could misread it.
9. **The composition default is an interpretation.** See the note on
   `composition.ts` under changed files. If the product owner reads acceptance
   criterion 1 as requiring a production caller rather than a production
   default, that caller belongs to M3-15E and this ticket does not deliver it.

## Independent reviewer checklist

Review `2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c` on
`ticket/m3-15d-ai-completion-context`. The range is `git diff
9b66e4c2356b8d58bdaab875513810ef83acd175..2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c`.
Confirm the CI run for that exact SHA is green; do not re-run lint, typecheck,
the Vitest suite, the build, or the browser flows.

The judgment this needs:

1. **The allowlist as a security boundary.** Read `toTrainingHistoryCompletion`
   against `TrainingHistoryCompletion` and against ADR-013 decision 4. Confirm
   every field is copied individually, that nothing spreads or passes through a
   `Completion`, and that the allowlist was not widened — `actualStartedAt` in
   particular must be absent, per the 14 September 2026 decision.
2. **That the proof actually proves it.** The out-of-allowlist test asserts
   against `buildCoachAIContext(...).serialized`, which is the payload, not the
   intermediate record. Check that it would fail if the mapping spread the
   source record.
3. **The `includedCompletions` addition.** It is a change to the file that *is*
   the boundary. Confirm it carries no identity into `toCompletionReference`,
   that nothing serializes it, and that the object-identity map in the source is
   sound — in particular that a duplicate or reused entry cannot mislabel a
   source.
4. **The exactness argument for `sources`**, and limitation 3. Decide whether
   running the selection twice is acceptable, or whether the transmitted set
   should instead be returned from assembly to the service.
5. **The zone refusal.**
   `CoachAIContextBelowMinimumError(["resolved_timezone"])` is thrown for both
   operations, not just for `create_seven_day_plan`. Confirm that is right — the
   source cannot derive any owner-local window without a zone — and that no path
   defaults to a server zone.
6. **The top-up.** It is called once, in `load`, before the slice is read, and
   nowhere else. Its write side effect is approved for this consumer and
   explicitly refused for Progress (M3-15C). Confirm both.
7. **Ownership.** No owner id is accepted from a caller, no repository is
   constructed with anything but the session-derived client, and
   `records.ownerId` comes from the verified owner.
8. **The module's placement outside `src/server/ai`**, and whether that reads as
   respecting the single-database-seam invariant or as routing around it. It is
   a deliberate choice with a stated reason; disagreeing with it is a legitimate
   finding.
9. **`correction_reason` and `correctionReason` appear nowhere under `src/`.**
   The remaining occurrences are in applied migrations and one pgTAP test, which
   are forward-only history and out of scope.
10. **Scope.** Nothing in the diff should touch a surface, a prompt, a model, a
    ceiling, `TRAINING_HISTORY_WINDOW_DAYS`, `TRAINING_HISTORY_MAX_SESSIONS`, or
    the `context.ts` sub-budgets.
