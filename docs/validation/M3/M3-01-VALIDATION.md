# M3-01 builder validation: server-only AI boundary and fixture adapters

**Ticket:** [M3-01](../../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md)

**Tier:** 1 — it defines what user data may ever leave this system

**Lifecycle state:** accepted — 4 August 2026.

Independent exact-commit review returned **approved** with no defect requiring a
source change; its seven findings are documentation accuracy or forward risk and
are recorded as limitations 9–12 plus two smaller notes below. No Vercel Preview
check applies: this commit adds no route, no UI, and no user-visible behavior.

**Branch:** `ticket/m3-01-ai-boundary`

**Base:** `9727f167ea31fd1a3feb528be7521e3d4e4ff260`

**Reviewed commit:** `8a39aeeed42881e3e3308f01bab6ca6592183496` — the branch
head, which has its own green continuous-integration run
([30891730440](https://github.com/mattiss01/fittip/actions/runs/30891730440)).

Amended by the lead on 4 August 2026. The builder nominated `9c6b4a7` as the
review target and then had to argue that a green run on a later commit stood in
for it, because the workflow's concurrency group cancels in-progress runs on any
non-`master` ref and the record commits cancelled `9c6b4a7`'s run. That argument
is unnecessary: `git diff --name-only 9c6b4a7..8a39aee` returns only paths under
`docs/`, so the two commits carry identical source, and the head already has the
green run the working agreement asks for. Reviewing the head therefore satisfies
"a green run for the exact reviewed commit" outright rather than through an
exception. Review `git diff 9727f16..8a39aee`.

**Commits on the branch, oldest first:**

| SHA | Purpose |
| --- | --- |
| `6dac445` | ADR-012 goal-context gate and its per-status tests |
| `017905c` | boundary primitives: contracts, errors, gates, context, budget, idempotency, validation, telemetry |
| `0156190` | fixture corpus, fixture adapter, context source, domain service |
| `a92c388` | enablement, context, budget, and idempotency tests |
| `455e8f5` | fixture-corpus and end-to-end service tests |
| `9c6b4a7` | leakage corpus and the architecture import invariants |

These are incremental commits of one scope, not corrections to reviewed work.
No commit in the range has been reviewed before.

**Architecture decision implemented:**
[ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md)

## Delivered behavior

No user-visible behavior changes. This ticket builds the boundary that a later
approved ticket calls, and every gate it adds is inert until something calls it.

- `selectActiveGoalContext` in `src/server/goals/goal-records.ts` implements
  ADR-012 exactly: an unarchived `active` goal is targetable, an unarchived
  `achieved` goal is historical and never targetable, `paused` and `abandoned`
  are excluded, and `archived_at` disqualifies independently of status. The gate
  enumerates the statuses it admits, so a status added later is invisible to the
  AI until ADR-012 is amended.
- A provider-neutral `CoachAI` interface with two operations, versioned request
  and response schemas, and a deliberately untrusted candidate type — an adapter
  returns raw text, never a parsed object.
- A deny-by-default live enablement gate over runtime, an explicit flag, an owner
  allowlist, the operation, provider and model configuration, and credential
  presence. It resolves an environment only for local development or the M0-06A
  founder project; a Vercel Preview, a `vercel dev` runtime, an undeclared mode,
  and an unreadable runtime policy all deny. It also denies outright when any
  `NEXT_PUBLIC_*` variable names AI, because such a variable means a value has
  already reached the browser bundle.
- A branded `CoachAIOwner`, obtainable only from `verifyCoachAIOwner`, which
  reads verified Auth claims. A caller cannot assert ownership: passing a chosen
  `user_id` is a type error, not a runtime check that might be forgotten.
- Context assembly that runs the two accepted eligibility gates, copies exactly
  the allowlisted fields, and fails closed past its reference and serialized-size
  ceilings.
- Injected in-memory rate, concurrency, budget, and idempotency policy. Unknown
  or stale price state denies. Unknown token usage keeps the full reservation
  charged. One attempt per request; there is no retry.
- Strict output validation that bounds size before parsing, accepts only exact
  JSON matching the operation schema, rejects unknown fields at every level, and
  rejects impossible dates, invalid durations, unowned or achieved goal
  references, unsafe phrasing, and business-rule breaches. Rejection is whole:
  no partial acceptance, and prose is never salvaged into a plan.
- Content-free telemetry into a bounded, injected, in-memory sink. No external
  sink exists.
- A fixture adapter over an authored corpus of 22 cases, deterministic and
  offline.

## Mobile demo path

There is nothing to demonstrate at `390x844`. This ticket adds no route, no
component, no server action, and no copy; nothing imports the new module yet.

The Preview check the product owner should make is therefore a **no-change**
check: at `390x844` on the ticket Preview, confirm that Today, Plan, Goals,
Memory, and guided setup behave exactly as they did on `master`. Any difference
is a defect in this ticket, because this ticket intends none.

## Changed files

`git diff --stat 9727f167ea31fd1a3feb528be7521e3d4e4ff260..9c6b4a7a4faadfd8bdaf43d582ec4b1cb179f63c`

```text
 src/architecture/server-boundary.test.ts   |  59 +++
 src/server/ai/ai-privacy.test.ts           | 194 ++++++++++
 src/server/ai/budget.test.ts               | 255 +++++++++++++
 src/server/ai/budget.ts                    | 267 ++++++++++++++
 src/server/ai/coach-ai-service.test.ts     | 563 +++++++++++++++++++++++++++++
 src/server/ai/coach-ai-service.ts          | 341 +++++++++++++++++
 src/server/ai/context-source.ts            |  73 ++++
 src/server/ai/context.test.ts              | 249 +++++++++++++
 src/server/ai/context.ts                   | 196 ++++++++++
 src/server/ai/contracts.ts                 | 153 ++++++++
 src/server/ai/enablement.test.ts           | 206 +++++++++++
 src/server/ai/enablement.ts                | 185 ++++++++++
 src/server/ai/errors.ts                    |  65 ++++
 src/server/ai/fixtures/fixture-adapter.ts  |  82 +++++
 src/server/ai/fixtures/fixture-corpus.ts   | 365 +++++++++++++++++++
 src/server/ai/idempotency.test.ts          | 141 ++++++++
 src/server/ai/idempotency.ts               | 140 +++++++
 src/server/ai/output-validation.test.ts    | 159 ++++++++
 src/server/ai/output-validation.ts         | 336 +++++++++++++++++
 src/server/ai/owner.ts                     |  44 +++
 src/server/ai/telemetry.ts                 | 123 +++++++
 src/server/goals/goal-records.test.ts      |  69 ++++
 src/server/goals/goal-records.ts           |  49 +++
 src/server/repositories/goal-repository.ts |   3 +-
 24 files changed, 4316 insertions(+), 1 deletion(-)
```

Purpose notes for paths whose role is not evident from the path and diff:

- `src/server/ai/owner.ts` and `src/server/ai/context-source.ts` are the only two
  modules in the subtree permitted to reach Auth claims or a repository. The
  architecture test names exactly these two; everything else in `src/server/ai`
  is pure over injected inputs.
- `src/server/ai/context-source.ts` takes its repositories as constructor
  arguments described structurally, so it imports no Supabase client and a test
  needs no database. It has no factory that constructs the real repositories,
  because nothing calls it yet — see Known limitations.
- `src/server/ai/ai-privacy.test.ts` is a source-text leakage scan, not a
  behavioral test. It reads every runtime file in the subtree and fails on a
  network client, a console call, browser storage, a service-role reference, a
  missing `server-only` import, or the credential variable named outside
  `enablement.ts`.
- `src/server/repositories/goal-repository.ts` changes by one line: `Goal.status`
  now refers to the newly exported `GoalStatus` instead of repeating the inline
  union, so the status list has one definition.
- `src/architecture/server-boundary.test.ts` gains a `describe` block only. The
  existing client-import and `.retry(false)` invariants are untouched.

No file was deleted or renamed.

## Data, migration, API, privacy, and security effects

- **No migration, no schema change, no RPC, no policy change, no regenerated
  types.** `supabase/` is untouched.
- **`package.json` and `package-lock.json` are unchanged.** No AI SDK, HTTP
  client, or provider library was added. `git diff 9727f16..HEAD -- package.json
  package-lock.json` is empty. This was the ticket's most likely failure mode and
  it did not occur; needing a dependency would have meant the work had drifted
  into M3-01B.
- **No test makes a network call.** Every fixture body is a string literal in
  `fixture-corpus.ts`; the leakage scan fails if any runtime file in the subtree
  contains `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or a Node HTTP
  import, and separately asserts the corpus file contains no `readFile`, dynamic
  `import(`, or `await`. The one deadline test injects its own rejection rather
  than waiting on a wall clock, so no suite depends on a timer.
- **No provider, model, account, key, prompt text, spend, external sink, remote
  resource, or deployment step** is introduced. The credential variable
  `FITTIP_AI_API_KEY` is read for presence, length, and absence of stray
  whitespace only; its value is never returned, compared to a literal, logged,
  placed in a request, or retained. A test asserts the gate's result does not
  contain the credential it checked.
- **Ownership.** The service derives its owner from verified Auth claims through
  the existing `requireAllowedVerifiedUser`, and the branded `CoachAIOwner` makes
  a caller-supplied `user_id` a compile error. The service additionally refuses
  records whose `ownerId` does not match the owner it was given.
- **What leaves the boundary.** Per goal: id, title, category, priority tier, and
  target date. Per memory item: id, type, and content. Nothing else — no
  `user_id`, rationale, constraints, revision history, confirmation timestamps,
  provenance, confidence, Auth identity, header, or raw row. Context assembly
  copies field by field rather than spreading, so a column added to a repository
  row cannot ride along, and a test proves a deliberately wide row loses its
  extra columns.
- **Telemetry** is built from a field allowlist by copying, so an added property
  is dropped rather than recorded. It carries ids, counts, byte sizes, versions,
  token counts, costs, and coarse outcome codes. It does not carry the owner id,
  the record ids, or any content; record provenance is returned to the domain
  caller instead. The sink is in-memory, bounded, and injected — not a module
  singleton, so no request observes another's buffer.
- **The browser stores nothing new**, and no client bundle can reach the module:
  the architecture invariant fails the build if a `"use client"` file imports
  `@/server/ai/**`.
- **Errors** are drawn from a fixed message table. Missing configuration and a
  missing credential deliberately share one message, because distinguishing them
  describes the secret boundary to whoever is asking.
- **Money** is integer micro-USD throughout, so no ceiling is decided by floating
  point arithmetic.

## Tests and final results

Branch CI run
[30891250944](https://github.com/mattiss01/fittip/actions/runs/30891250944)
**succeeded**. It covers Prettier, ESLint, TypeScript, `test:run`, the
production build, the full migration/lint/advisor/pgTAP matrix, the concurrency
harnesses, and the 390px browser flows.

That run's head SHA is `3b9c478175d3fe163e70faca07dee8d81a41a6c8`, the commit
that adds this record, not the implementation target
`9c6b4a7a4faadfd8bdaf43d582ec4b1cb179f63c`. The reason is mechanical and worth
stating rather than glossing: the workflow's concurrency group is
`ci-${{ github.ref }}` with `cancel-in-progress` on any non-`master` ref, so
pushing the record cancelled the still-running job for the code commit.

The two commits are identical outside `docs/`. A reviewer can confirm that in
one command:

```
git diff --stat 9c6b4a7a4faadfd8bdaf43d582ec4b1cb179f63c..3b9c478175d3fe163e70faca07dee8d81a41a6c8
```

It reports only `docs/validation/M3/M3-01-VALIDATION.md` and
`docs/validation/README.md`. `.prettierignore` excludes `docs/`, and no CI step
reads it, so the green run exercises exactly the reviewed source. Under the
AGENTS.md evidence-commit exception a record-only commit needs no run of its
own; this note exists so the SHA mismatch is checkable rather than something the
reviewer has to reconstruct.

Checks CI does not cover, run locally by the builder:

| Command or check | Result |
| --- | --- |
| `git diff --check` | pass, no whitespace errors |
| `git diff 9727f16..HEAD -- package.json package-lock.json` | empty, as intended |
| Focused Vitest over the ticket's files | pass — 11 files, 194 tests |
| Focused Prettier write over every changed TypeScript file | pass, no residual diff |
| Focused ESLint over `src/server/ai`, `src/architecture`, `src/server/goals` | pass |
| `npx tsc --noEmit` | pass |

The focused Vitest command was
`npm.cmd run test:run -- src/server/ai src/server/goals src/architecture
src/server/repositories/goal-repository.test.ts`. Per AGENTS.md the builder did
not execute the complete suite by hand; CI establishes that result.

Tests added, by intent rather than by count:

- **ADR-012, per status.** All four statuses in both directions, the archived
  predicate asserted independently for every status, and a status outside the
  union proving the gate admits nothing it has not named.
- **The gate matrix.** Every control denies with its own code: runtime, flag,
  public-variable leak, allowlist, operation, provider, model, credential. Both
  approved environments resolve; Preview and `vercel dev` do not.
- **Context.** The eligibility split, the field allowlist, a wide row losing its
  extra columns, review-due memory exclusion, the reference and size ceilings,
  malformed input, and an empty context for a new owner.
- **Budget.** Unknown, expired, fractional, negative, and wrong-currency price
  state each deny rather than counting as zero; the per-request, daily, and total
  ceilings; per-owner and per-operation rate isolation; window expiry; single
  concurrency; and reconciliation, including four ways reported usage is unusable
  and therefore keeps the reservation charged.
- **Idempotency.** Key stability, opacity, boundedness, and sensitivity to owner,
  operation, schema, and either collection revision; one attempt per key; replay
  after completion; a joined concurrent duplicate; a failure that is not cached;
  conflict on changed context; and bounded eviction.
- **The fixture corpus.** Each of the 22 cases asserted against its authored
  expectation, plus a test that fails if any rejection reason has no fixture — so
  a failure mode nobody wrote down appears as a gap rather than as silence.
- **The service end to end.** A validated proposal with its record provenance;
  exactly one attempt; a provider adapter never reached without live enablement;
  denial before any charge when no price is known; refusal of another owner's
  records; concurrent duplicates collapsing to one attempt and one charge;
  conflict on a reused caller key; deadline handling without a wall-clock timer;
  and telemetry containing no goal title, memory content, record id, or owner id.
- **Leakage.** The source-text scan described above, plus assertions that every
  error message is content-free and that the corpus contains no
  credential-shaped string.

Project skills: `validation-record` for this handoff. No `.agents/skills/` skill
applies — the ticket changes no React, Next.js, or user-visible surface.

## Known limitations

1. **No provider exists, so the live gate has never run end to end.** Nothing in
   the repository can satisfy it: there is no provider adapter to reach. The gate
   is proven by unit tests over an injected environment and by a provider-kind
   test double, not by a real call. M3-01B carries the provider half.
2. **Rate, budget, concurrency, and idempotency state is in memory and
   per-instance.** It does not survive a Vercel instance change, so it is a local
   deterministic control and not a hosted one. The brief scopes it that way
   deliberately; durable shared fail-closed state belongs to M3-01B.
3. **`COACH_AI_FIXTURE_LIMITS` are not approved caps.** They are deterministic
   defaults for fixture runs, named so they cannot be mistaken for a decision.
   The product owner's request, token, deadline, and spend ceilings are an open
   M3-01B decision and must be injected before any live use.
4. **Training history is not in the context.** The brief's expected-change line
   mentions the M1 training repositories, and this implementation reads goals and
   memory only. Deciding which training history a coach may read is a product
   policy of exactly the kind ADR-012 was written to settle in advance, and no
   such ADR exists; inventing one inside a Tier 1 ticket is the failure mode
   ADR-012 exists to prevent. The context type and the context source are shaped
   to take a third source without restructuring. **This is a scope judgement the
   reviewer and product owner should confirm or reject.**
5. **The unsafe-content deny list is a conservative backstop, not a classifier.**
   Passing it does not make a candidate safe. It catches diagnostic and
   pain-dismissing phrasing by pattern; the product invariant on pain, illness,
   and injury needs domain rules a consuming ticket adds.
6. **`RepositoryCoachAIContextSource` has no production wiring.** No route,
   action, or factory constructs it with the real repositories, because nothing
   consumes the boundary yet. Its repository arguments are structural, so the
   real `GoalRepository` and `MemoryRepository` satisfy them, but that
   substitution is not exercised by a test against real repository instances.
7. **`context_too_large` denies rather than truncating.** An owner with more than
   the ceiling of eligible goals or memory items gets a denial, not a trimmed
   context. Failing closed is correct for a boundary, but it is a real behavior
   with no UI affordance explaining it, and the consuming ticket must handle it.
8. **The `attemptCount` in telemetry is always 0 or 1 by construction.** There is
   no retry, so the field exists for a future decision rather than to distinguish
   observed behavior today.

The four below were added by the lead on 4 August 2026 from the independent
review. All are documentation accuracy or forward risk; the reviewer found no
defect requiring a source change, and none was made.

9. **An adapter declares whether the live enablement gate applies to it.**
   `coach-ai-service.ts:159` runs `requireCoachAILiveEnablement` only when
   `adapter.kind === "provider"`, so a `"fixture"` adapter skips the runtime
   check, the live flag, the `NEXT_PUBLIC_` scan, the owner allowlist, the
   operation switch, and credential presence. The reasoning is sound — a fixture
   reaches nothing, and criterion 3 governs a *real* call — but the Delivered
   behavior section above describes the gate unconditionally, which overstates
   it. Zero exposure today: nothing in the repository constructs
   `CoachAIService`. The forward risk is real and belongs to M3-01B, where a
   provider adapter copy-pasted from `FixtureCoachAI` would inherit
   `kind: "fixture"` and call out ungated, with no invariant catching it.
10. **`hasPublicAIVariable` does not match the names a leaked key would have.**
    `enablement.ts:170` tests `/(^|_)AI(_|$)/`, which matches `AI_KEY` and
    `COACH_AI_FLAG` but **not** `NEXT_PUBLIC_OPENAI_KEY`,
    `NEXT_PUBLIC_ANTHROPIC_KEY`, or `NEXT_PUBLIC_GEMINI_KEY` — "AI" is not
    delimited in any of them. The adjacent comment claims it catches "any
    `NEXT_PUBLIC_*` variable naming AI", which is not true. It is defense in
    depth rather than the primary control, so this is an overstated claim rather
    than a hole, but it will not fire on the most likely real leak once M3-01B
    names a provider.
11. **Telemetry reports `environment: "local"` for any fixture run**, including
    on the founder project, because `coach-ai-service.ts:158` initializes it and
    only reassigns inside the provider branch. Criterion 9 asks telemetry to
    prove the environment; today it proves it only for provider calls.
12. **The concurrency slot is released on deadline while the call may still be
    in flight.** `maxConcurrentRequests` counts reservations, not live calls, so
    with a real provider a timed-out request stays open and billable while a
    second is admitted. Spend ceilings still hold — the full reservation stays
    charged — so this is not a budget hole, but it is a gap against "one
    explicit maximum concurrent live request". Not exercisable with fixtures.

Two smaller notes from the same review, recorded without their own entries: the
`"rejected"` telemetry outcome is unreachable because the outer `catch`
overwrites it with `"failed"` (no information is lost, `rejectionReason`
survives), and the new database-seam invariant does not match
`@supabase/supabase-js` itself, so a future file constructing its own client
would pass.

## Independent reviewer checklist

Review exact pushed commit `8a39aeeed42881e3e3308f01bab6ca6592183496` on
`ticket/m3-01-ai-boundary`. The range is
`git diff 9727f167ea31fd1a3feb528be7521e3d4e4ff260..8a39aeeed42881e3e3308f01bab6ca6592183496`.
Confirm the CI run for that SHA is green; do not re-run lint, typecheck, tests,
build, or the browser flow.

The "Changed files" manifest above is stated for `9727f16..9c6b4a7` and
reconciles exactly against that range. The delta from there to the reviewed
commit is two files under `docs/` and nothing else.

Judgment this ticket needs and CI cannot supply:

1. **ADR-012 fidelity.** Read `selectActiveGoalContext` against the ADR's seven
   decisions. Confirm it enumerates admitted statuses rather than excluding
   rejected ones, that `archived_at` is checked independently of status, and that
   an achieved goal cannot reach `targetable` by any path — including through
   output validation, where the targetable set is what a proposal may reference.
2. **The field allowlist is a privacy decision.** Confirm the goal and memory
   fields that leave the boundary are the minimum the two operations need, and
   that nothing in `CoachAIRequest` carries Auth identity, caller metadata, or a
   raw row.
3. **Ownership cannot be asserted.** Confirm the `CoachAIOwner` brand is not
   constructible outside `owner.ts`, and judge whether the service's
   `records.ownerId !== owner.id` check is a real backstop or theatre given that
   the context source is injected.
4. **Fail-closed reading.** Walk each denial in `enablement.ts` and `budget.ts`
   and confirm an absent, blank, malformed, or stale value denies rather than
   defaults. Pay particular attention to `resolveCoachAIEnvironment`: it assumes
   the founder project is the Vercel `production` target and that a Preview must
   never call out. Confirm that assumption matches how the founder project is
   actually configured.
5. **The fixture checklist.** Judge whether the enumerated failure modes are the
   right ones, and name any you would expect that are absent. The corpus is
   deliberately an authored list, so a gap is a review finding, not a test
   failure.
6. **Scope judgement 4 in Known limitations** — training history excluded from
   context. Confirm or reject.
7. **Nothing persists.** Confirm no path in the subtree can create or update a
   goal, memory item, roadmap, plan, activity, or completion, and that a
   validated candidate is only ever returned as a proposal.
8. **The architecture invariant is real.** Confirm the new `describe` block would
   actually fail on a violation rather than passing vacuously — the AI subtree
   must be non-empty and the client-component list must be non-empty for the
   assertions to mean anything.
