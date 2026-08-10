# M3-01B builder validation: one approved real-provider adapter

**Ticket:** [M3-01B](../../backlog/M3/M3-01B-REAL-PROVIDER-ADAPTER.md)

**Tier:** 1 — schema, migration, authorization, credentials, an external
service, and spend

**Lifecycle state:** testable. The first independent exact-commit review of
`d553f6a` returned **changes required** with two blocking findings, one
near-blocking finding, a missing concurrency proof, and a missing validation
record. All five are addressed in `dd980f7`, which is the new review target.

**Branch:** `ticket/m3-01b-real-provider-adapter`

**Base:** `4b843f8d2c34fdc837090ae418dfdd2d5a314dbc`

**Reviewed commit:** `dd980f70bbcad515dae4a10699f8f58488a52a55`

**Commits on the branch, oldest first:**

| SHA       | Purpose                                                   |
| --------- | --------------------------------------------------------- |
| `738aa94` | OpenAI adapter, prompt, live limits, rate card, spend seam |
| `d553f6a` | migration, pgTAP, spend repository, service wiring         |
| `dd980f7` | independent-review corrections B1, B3, N1, B4              |

Review `git diff 4b843f8..dd980f7`. The first two commits are incremental
commits of one scope; the third is the correction commit and is the only one
that has been through review before.

**Architecture boundary:**
[ADR-006](../../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md),
[ADR-007](../../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md),
[ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md), and
[M0-06A](../../backlog/M0/M0-06A-FOUNDER-HOSTED-STAGING.md) before hosted use

## Delivered behavior

**No user-visible behavior changes.** See limitation 1: nothing in the
repository constructs any of it yet. This ticket ships the boundary; M3-02
wires it.

- `OpenAICoachAI` implements the accepted `CoachAI` contract against OpenAI's
  responses API for `gpt-5.6-luna`, using `fetch` directly rather than a
  provider SDK, so there is no retry policy to misconfigure and no dependency
  added. One authorized request becomes exactly one HTTP call.
- The baseline prompt and both JSON response schemas are ported unchanged from
  the bake-off harness, with everything static emitted before anything
  volatile so the cacheable prefix stays byte-identical.
- `ai_spend_reservations` plus `reserve_ai_spend` and `settle_ai_spend` hold
  the authoritative ceilings inside the database, where the capped owner cannot
  reach them. Reserve charges the upper bound before the call; settle
  reconciles against provider-reported usage; an unsettled reservation expires
  after fifteen minutes so a crashed call cannot hold budget until midnight.
- `COACH_AI_LIVE_LIMITS` and `OPENAI_GPT_5_6_LUNA_RATE_CARD` carry decision 4's
  approved numbers and decision 6's constant, versioned rate card. Unknown or
  stale price state denies.
- The live enablement gate now also refuses any adapter that is not on the
  network-free allowlist when no durable spend ledger is present.
- `src/architecture/coach-ai-network-gate.test.ts` fails if a second module
  under `src/server/ai` gains a network primitive, or if the one that has it
  can reach the network without passing the gate.

## Mobile demo path

There is nothing to demonstrate at `390x844`. This ticket adds no route, no
component, no server action, and no copy.

The Preview check is therefore a **no-change** check: at `390x844` on the
ticket Preview, confirm Today, Plan, Goals, Memory, and guided setup behave
exactly as they do on `master`. Any difference is a defect in this ticket,
because this ticket intends none. See limitation 1 — the absence of visible
change is the expected outcome, not an oversight.

## Changed files

`git diff --stat 4b843f8..dd980f7`

```text
 .github/workflows/ci.yml                           |   3 +
 package.json                                       |   1 +
 src/architecture/coach-ai-network-gate.test.ts     | 134 ++++++
 src/lib/supabase/database.types.ts                 |  89 ++++
 src/server/ai/ai-privacy.test.ts                   |  25 +
 src/server/ai/budget.test.ts                       |  44 ++
 src/server/ai/budget.ts                            |  66 +++
 src/server/ai/coach-ai-service.test.ts             | 264 +++++++++-
 src/server/ai/coach-ai-service.ts                  | 168 ++++++-
 src/server/ai/enablement.test.ts                   |  22 +
 src/server/ai/enablement.ts                        |  15 +-
 src/server/ai/network-free-adapters.ts             |  33 ++
 src/server/ai/openai-adapter.test.ts               | 447 +++++++++++++++++
 src/server/ai/openai-adapter.ts                    | 277 +++++++++++
 src/server/ai/openai-prompt.ts                     | 207 ++++++++
 src/server/ai/spend.ts                             |  61 +++
 .../repositories/ai-spend-repository.test.ts       | 178 +++++++
 src/server/repositories/ai-spend-repository.ts     | 157 ++++++
 .../20260810081331_m3_01b_ai_spend_ledger.sql      | 363 ++++++++++++++
 supabase/tests/database/m3_01b_ai_spend.test.sql   | 531 +++++++++++++++++++++
 .../integration/m3_01b_concurrent_reservations.mjs | 417 ++++++++++++++++
 21 files changed, 3472 insertions(+), 30 deletions(-)
```

Purpose notes for paths whose role is not evident from the path and diff:

- `src/server/ai/spend.ts` declares the durable ledger seam and nothing else.
  It imports no database client and no Supabase type, so `src/server/ai` keeps
  its invariant that only `owner.ts` and `context-source.ts` reach the
  database. The implementation lives outside the subtree.
- `src/server/repositories/ai-spend-repository.ts` implements that seam over
  the two RPCs and maps Postgres refusals to the boundary's stable codes. It
  exists here rather than under `src/server/ai` for the reason above.
- `src/server/ai/network-free-adapters.ts` is the allowlist the live gate keys
  on. It compares exact constructor identity rather than `instanceof`, so a
  subclass of an exempt adapter is gated — a subclass can add a socket.
- `src/architecture/coach-ai-network-gate.test.ts` is a repo-wide invariant,
  not a unit test. It asserts the gate cannot be bypassed by an adapter's own
  `kind` claim and that only one module in the subtree holds a network
  primitive.
- `src/server/ai/ai-privacy.test.ts` gains an exception for exactly one path.
  The leakage scan's network assertions now run over every runtime file in the
  subtree except `openai-adapter.ts`, and assert the excluded set is exactly
  one file smaller, so a second network-capable module fails it.
- `src/server/ai/openai-prompt.ts` holds the prompt text and the two `strict`
  JSON schemas. Ordering is load-bearing for prompt caching; a test asserts the
  static prefix rather than trusting it.
- `supabase/tests/integration/m3_01b_concurrent_reservations.mjs` is the new
  concurrency harness. See "The concurrency harness" below for what it proves
  and how its parameters were chosen.
- `src/lib/supabase/database.types.ts` is generated by the Supabase CLI from
  the new migration. It was not hand-edited.

No file was deleted or renamed.

## Migration, data, and API effects

- **One new migration**, `20260810081331_m3_01b_ai_spend_ledger.sql`. It adds
  two composite types, the `ai_spend_reservations` table with eight
  constraints and two indexes, RLS with an owner-select policy, two
  `SECURITY DEFINER` functions with `set search_path = ''`, and the privilege
  grid below. It is additive: no existing table, policy, grant, or function is
  altered.
- **No API route, server action, page, or component changed.** Nothing in the
  application calls any of this yet.
- **No dependency added.** `package.json` gains one script line and no
  package; `package-lock.json` is untouched.
- **`.github/workflows/ci.yml`** gains one step in the `database` job, after
  the three existing concurrency steps. No existing check was reordered,
  weakened, or removed. This is a tooling change and is called out separately
  because AGENTS.md treats `.github/**` as supply chain.

### Privilege and policy matrix

| Surface                 | Anonymous           | Authenticated owner                  | Other authenticated owner | `service_role`        |
| ----------------------- | ------------------- | ------------------------------------ | ------------------------- | --------------------- |
| `ai_spend_reservations` | no table privileges | column-level `SELECT` through RLS    | denied by RLS             | see limitation 6      |
| `settlement_token`      | not granted         | **not granted** — withheld by column | not granted               | see limitation 6      |
| `reserve_ai_spend`      | no execute          | execute, owner from `auth.uid()`     | cannot name another owner | revoked               |
| `settle_ai_spend`       | no execute          | execute, owner from `auth.uid()`     | cannot name another owner | revoked               |

`INSERT`, `UPDATE`, and `DELETE` are not granted to `authenticated` at all, so
there is no direct write path. Neither function takes a `user_id` parameter,
and both ceilings are function-local constants rather than arguments, because
`authenticated` holds `EXECUTE` and anything a function accepts as an argument
is a number the capped user chooses.

### Credential and privacy effects

- The provider credential is read for presence, shape, and length only, in
  `enablement.ts`. Its value is never returned, logged, compared to a literal,
  placed in telemetry, or retained. `ai-privacy.test.ts` fails if the variable
  is named anywhere else in the subtree.
- `hasPublicAIVariable` now also matches `OPENAI`, `ANTHROPIC`, and `GEMINI`
  under `NEXT_PUBLIC_`, closing the gap M3-01's review found: the generic `AI`
  token did not match `NEXT_PUBLIC_OPENAI_KEY`.
- `settlement_token` is a capability, not an identifier. The owner's `SELECT`
  grant omits the column, so an owner can audit every figure in their own spend
  history and still cannot settle a live reservation at zero.
- What leaves the boundary is unchanged from M3-01: per goal id, title,
  category, priority tier, target date; per memory item id, type, content.
  The adapter serializes the context the service assembled and adds nothing.

## Tests and final results

**The reviewed commit `dd980f7` needs a green CI run recorded before
acceptance.** The previous commit `d553f6a` has run
[31372584775](https://github.com/mattiss01/fittip/actions/runs/31372584775),
which **failed**: Prettier failed on
`src/server/repositories/ai-spend-repository.test.ts`, and because Prettier is
the first step of the `static` job, ESLint, TypeScript, Vitest, and the
production build all skipped. `d553f6a` therefore has no recorded result for
any of them, which is why finding B1 was blocking rather than cosmetic. That
formatting failure is fixed in `dd980f7`.

If the branch is pushed with this record already on it, the workflow's
`ci-${{ github.ref }}` concurrency group cancels the in-flight run for
`dd980f7` and only the record commit's run completes — the same mechanical
trap M3-01 hit. That is fine under the AGENTS.md evidence-commit exception,
and it is checkable rather than assumed: `git diff --stat dd980f7..HEAD`
reports only paths under `docs/`, `.prettierignore` excludes `docs/`, and no CI
step reads it, so the green run exercises exactly the reviewed source. If the
lead prefers a run attributed to `dd980f7` itself, push that commit first and
let its run finish before pushing this one.

Checks CI does not cover, or that were run locally while correcting:

| Command or check                                                       | Result                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm.cmd run test:run -- src/server/ai src/server/repositories/ai-spend-repository.test.ts src/architecture` | pass — 12 files, 227 tests                                          |
| `npm.cmd run lint`                                                     | pass                                                               |
| `npm.cmd run typecheck`                                                | pass                                                               |
| `npx.cmd prettier --check` over every changed non-SQL file             | pass, no residual diff                                             |
| `supabase db reset --local`                                            | pass — all ten migrations applied from zero                        |
| `npm.cmd run test:m3-01b-concurrency`                                  | pass — 4 rounds, 12 contenders each, exactly one commit per round  |

Per AGENTS.md the builder did not execute the complete suite by hand; CI
establishes that result.

### The concurrency harness

`supabase/tests/integration/m3_01b_concurrent_reservations.mjs` exists because
`reserve_ai_spend` uses a pattern no other RPC in this repository uses —
`lock_timeout` plus a `lock_not_available` handler mapped to `PT409` — and
nothing exercised it. The advisory lock is the only reason the daily and total
ceilings are real: an `INSERT ... SELECT ... WHERE` does not lock the rows it
aggregates, so under `READ COMMITTED` concurrent reservations all read the same
under-ceiling total and all commit.

It proves three things:

1. **The ceiling holds under contention.** Each round seeds a fresh owner to
   exactly one reservation of headroom and fires twelve simultaneous
   reservations of that exact amount. Exactly one commits, and the owner's day
   sums to exactly 2,000,000 micro-USD.
2. **The loser's refusal is distinguishable.** Every refusal must be `PT402` /
   HTTP 402 with the ceiling message. `PT409` — contention — is a failure, not
   an accepted alternative, because the two mean opposite things to the caller.
   A separate race proves the `PT409` shape genuinely occurs: two simultaneous
   settlements of one reservation yield exactly one success and one `PT409`
   with the closed-reservation message.
3. **The lock and the aggregate are per owner.** A saturated owner is refused
   for one micro-USD while two other owners reserving at the same instant both
   commit, and each of their days sums to its own reservation alone.

**The parameters were measured, not guessed.** A copy of `reserve_ai_spend`
with the advisory lock removed and nothing else changed was installed in the
local database, and the harness re-run against it:

- Two contenders in a single round — the obvious shape, and the shape the two
  existing harnesses use — **passed with the lock removed**. That test proves
  nothing.
- Twelve contenders breached the ceiling in five of six rounds, with up to ten
  of the twelve committing for 2,072,000 against a 2,000,000 ceiling.
- At four rounds the harness fails on the first or second round with the lock
  removed: `Round 1: expected exactly one reservation to commit, received 10`.
  The odds of missing a lock-free regression are under one in two hundred.

The lock-free function was installed only in the local container and never
committed; `supabase db reset --local` restored the real one before the final
run. See limitation 9 for the one branch the harness does **not** reach.

### Independent-review corrections in `dd980f7`

- **B1, blocking.** Prettier fixed on the spend repository test. Every other
  file the ticket touches was re-checked; that was the only one.
- **B3, blocking.** `spendLedger` was optional and unchecked. A composition
  root that wired a real adapter, the live flag, the owner allowlist, and the
  credential but omitted the ledger passed every gate and called out with only
  `CoachAIBudget`'s in-memory ceilings — which a Vercel instance change resets,
  so every cold start would begin at zero spend and `dailyCostCeilingMicroUsd`
  would never bind. The gate now refuses a non-network-free adapter with no
  ledger, using the existing `budget_unavailable` code. A new test proves the
  refusal happens with zero adapter invocations and zero spend, mirroring the
  `ImpostorCoachAI` test. Two existing tests that ran a live-shaped adapter
  without a ledger now supply one.
- **N1, near-blocking.** On a rejected provider call the durable settlement was
  created and then abandoned: only the success path awaited it. Decision 5 sets
  zero retries precisely because timeouts and transport failures are routine,
  so this was the likelier path. The catch now awaits it, inside a `try` that
  cannot let a ledger failure replace the provider's cause. Two tests: one
  holds the ledger write open and asserts `propose` has not settled until it
  lands, one makes the ledger write fail and asserts the caller still receives
  `provider_unavailable`. Removing the fix makes the first fail.
- **B4.** The concurrency harness above, plus `test:m3-01b-concurrency` in
  `package.json` and one additive step in the `database` CI job.
- **B2.** This document.

## Known limitations

The first eight are carried forward from the original builder's handoff, which
was chat-only — that omission is finding B2, and this section is written afresh
from the diff rather than copied, so treat it as the record. Items 9 onward are
findings the independent review surfaced and the product owner is asked to
accept rather than block on.

1. **This ticket ships a boundary that nothing can reach at runtime, and the
   Preview will show no user-visible change.** `new CoachAIService(` appears
   exactly once in the repository, in `coach-ai-service.test.ts`.
   `OpenAICoachAI`, `COACH_AI_LIVE_LIMITS`, `OPENAI_GPT_5_6_LUNA_RATE_CARD`,
   `AISpendRepository`, and `createAISpendRepository` have no production
   caller, and the literal `"gpt-5.6-luna"` appears only in tests and in
   comments — runtime source carries it once, inside the rate-card version
   string. There is no composition root; M3-02 builds it. The brief scopes the
   ticket that way deliberately, and it is stated here so the product owner
   reads it before the Preview rather than after.
2. **No real provider call has ever been made from this code.** The brief
   forbids obtaining a key or spending, so the adapter is proven entirely
   against a local stub returning controlled statuses, bodies, delays, and
   hangs. The single live pass is the lead's, after review. Until it happens,
   "the adapter works against OpenAI" is an inference from the bake-off
   harness, not a result.
3. **Decision 4's per-source byte allocation is deliberately unresolved.** Its
   trigger stands: it must be settled before any owner reaches roughly thirty
   memory items and before M3-02 is accepted.
4. **The in-memory limits and the database ceilings are two separate
   mechanisms.** The in-memory one holds the rate and concurrency limits the
   ledger does not; the ledger holds the ceilings the process cannot be trusted
   with. Neither is complete alone, and above both sits the product owner's
   provider-side monthly cap, which is the only ceiling that survives a bug in
   this repository's own accounting.
5. **The three shipped numbers are sized for `gpt-5.6-luna` specifically.**
   `maxInputTokens` 8,000 and `deadlineMs` 30,000 hold against luna's measured
   peaks with margin; every other candidate in the 9 August bake-off broke at
   least one. If the model changes, revisit decision 4 rather than assuming the
   numbers travel. `maxInputTokens` in particular was sized against two
   scenarios, not against the regeneration worst case.
6. **`revoke all privileges on table` names only `public`, `anon`, and
   `authenticated`, so `service_role` keeps Supabase's default `ALL` on
   `ai_spend_reservations`** and could update `charged_micro_usd` directly,
   which makes the function-level `EXECUTE` revoke decorative against it. This
   matches the repository's existing convention and the application has no
   service-role client by rule, so it is defence in depth only. Not fixed:
   changing the convention for one table would make the other tables look
   deliberate when they are not. **(Review finding N3.)**
7. **A reservation reserves against the request's upper bound, so a failed call
   is charged in full.** That is intended — a call the provider generated has
   been billed whether or not this process saw the answer — but it means a run
   of timeouts consumes the daily ceiling at the reserved rate rather than the
   actual one.
8. **`settle_ai_spend` accepts a charge up to 1,000,000 micro-USD regardless of
   what was reserved**, so a settlement can record more than the 8,000
   per-request ceiling. This is correct for reconciliation — the ledger must
   record what was billed — and it cannot help an owner spend more, only record
   more against themselves. It is noted because it is not obvious from the
   per-request ceiling, and because the concurrency harness uses it to seed a
   day in four calls rather than two hundred and fifty.
9. **The `PT409` lock-timeout branch of `reserve_ai_spend` is not exercised by
   any test.** Reaching it needs the advisory lock held past `lock_timeout`,
   which needs a transaction held open across requests, and PostgREST offers no
   way to do that. The harness proves the mapping is distinguishable by
   asserting the ceiling race is never `PT409`, and proves the `PT409` shape
   occurs at all through `settle_ai_spend`'s concurrent-settlement race — but
   the specific `lock_not_available` handler is covered by reading, not by
   execution. **(Extends review finding B4.)**
10. **The ceilings 8,000 / 2,000,000 / 20,000,000 and the operation enum are
    duplicated between the migration and `src/server/ai/budget.ts` with nothing
    cross-checking them.** They agree today. Nothing asserts they will after a
    forward migration changes one side. Not fixed: the two are deliberately
    independent — the database ceiling exists precisely because the application
    cannot be trusted to bound itself — so a shared constant would defeat the
    point, and a cross-check test would have to encode the numbers a third
    time. **(Review finding N2.)**
11. **Two pgTAP assertions could pass for the wrong reason.** The parameter-name
    check at `:41-54` tests `argument ilike '%user%'`, which a parameter named
    `p_owner_id` would satisfy while being exactly the defect it guards
    against; and the ceiling tests at `:365-370` and `:451-456` both expect
    `PT402` with the same message, so each could pass for the other's reason.
    Not fixed: the assertions are correct today and the migration is applied,
    so tightening them is a test-only change better made when the next ticket
    touches that file. **(Review finding N4.)**
12. **An expired reservation can still be settled.** `settle_ai_spend` has no
    expiry predicate, so a settlement arriving after the fifteen-minute window
    still writes. This is safe in the only direction that matters — late
    settlement can only raise recorded spend, never lower it — but it was
    undocumented. Recorded rather than changed. **(Review finding N5.)**
13. **`COACH_AI_PROMPT_VERSIONS` still reads `roadmap-stub-v1`**, so telemetry
    attributes real model output to a stub identifier. The brief forbids
    modifying `contracts.ts`, and bumping it belongs to the ticket that writes
    the real prompt. M3-02 must do it. **(Review finding N6.)**
14. **`onTruncated` and `CoachAITruncation` are exported and tested but
    consumed by nothing.** The adapter surfaces the signal because a truncated
    response and a schema failure are otherwise indistinguishable downstream,
    which cost sixteen billed calls to learn. No caller wires it yet.
    **(Review finding N7.)**
15. **`coach-ai-network-gate.test.ts:51-60` asserts part of the gate by regex
    over source text.** Source-text assertions break on refactors and pass on
    semantically equivalent bypasses. The load-bearing proof is the behavioral
    `ImpostorCoachAI` test in `coach-ai-service.test.ts`; the regex is a
    secondary signal. **(Review finding N8.)**
16. **A reservation created at 23:59 UTC counts against day N, and its live
    hold is invisible to day N+1's daily sum.** Bounded by one reservation,
    roughly 5,200 micro-USD against a 2,000,000 ceiling. **(Review finding
    N9.)**

## What the reviewer should check that CI cannot

- That the ownership predicate in both functions is derived and not passed, and
  that neither ceiling is reachable as an argument.
- That the `settlement_token` column grant genuinely excludes the token, and
  that no code path returns it to a caller who is not the server that reserved.
- That the B3 gate is placed where a live adapter cannot get past it, rather
  than somewhere a later refactor would step around.
- That the N1 `await` cannot deadlock a request whose provider call never ends
  — the deadline path leaves `durableSettlement` unset by design, and the
  reviewer should confirm that reading rather than trust this sentence.
- That the concurrency harness's assertions are the ones described above, and
  that its per-owner claim is not weaker than it reads.
- That limitations 6 and 10 are things the product owner should accept rather
  than defects the builder declined to fix.
