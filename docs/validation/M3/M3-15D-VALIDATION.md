# M3-15D validation: bounded AI completion context

**Ticket:** [M3-15D](../../backlog/M3/M3-15D-AI-COMPLETION-CONTEXT.md)
**Status:** round 1 of independent review **approved**
`2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c` with two non-blocking findings. The
product owner approved both for correction; they are applied in
`ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2`, which supersedes the approved
commit and needs re-review. The continuous-integration run for the new SHA, the
Vercel Preview, and product-owner acceptance are outstanding.
**Tier:** 1
**Branch:** `ticket/m3-15d-ai-completion-context`
**Base:** `9b66e4c2356b8d58bdaab875513810ef83acd175`
**Implementation review target:**
`ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2` — the last source commit. The
record commit that follows it changes no application file (the evidence-commit
exception in `AGENTS.md`).
**Review range:**
`git diff 9b66e4c2356b8d58bdaab875513810ef83acd175..ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2`
**Previously approved target:** `2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c`,
approved in round 1. The correction range alone is
`git diff 2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c..ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2`,
which touches three source files. It changes no visible surface, but it is not
behaviour-free: finding 2 adds a refusal path. That path is unreachable in
practice — the profile repository filters by its own session-derived id, so the
two identities cannot disagree today — but it is a new refusal, and round 2 of
review reviewed it as new code rather than as a finding closed.

Implementation commits, in order:

| Commit | Purpose |
| --- | --- |
| `3d9b9f4b61ecc90cd0abd68c4d6717587ce94e05` | `correctionReason` and its truncation constant are deleted from the allowlist, the contract, and the two dependants. |
| `f38a5eee711ffd76ae6e2e7c6172771b4e324259` | The history selection now returns the input records it actually transmitted. |
| `1514db8b7859b4cb12fd3c7bd045c6526753f471` | The production context source, and the composition root's fallback to it. |
| `2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c` | Its tests, including the out-of-allowlist field proof. **Approved in round 1.** |
| `e26587db3cc8f5146be603ef3848f7b4888f7d3e` | **Round 1, finding 1.** The network tripwire scans every module that shapes provider-bound owner data. |
| `ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2` | **Round 1, finding 2.** `ownerId` is derived from the profile read and asserted, not echoed. |

## Round 1 review: approved, and what changed

Two non-blocking findings against `2d85a1c`. Neither was disputed, and the
product owner approved both for correction rather than deferring them. The
reviewer found no regression in either: the second is a property the source it
replaced had too.

1. **The network invariant had stopped covering its own subject.**
   `src/architecture/coach-ai-network-gate.test.ts` scanned `src/server/ai`
   only. The production context source is the one module that reads a real
   owner's records and assembles them for a provider, and after this ticket
   placed it in `src/server/context` a `fetch` added to it would have been
   caught by nothing at all.

   The scan is now a named list of roots rather than one directory, because what
   the invariant is about is the data and not the location: a socket opened
   anywhere that selects, reduces, or assembles owner data bound for a coach is
   either an ungated provider call or an exfiltration of exactly the records the
   boundary exists to bound. The roots are `src/server/ai`,
   `src/server/context`, and the three eligibility gates in
   `src/server/training`, `src/server/goals`, and `src/server/memory`. Being a
   superset is the intended direction; the file's own header now says so, and
   says why. Two assertions pin that the widened scan is genuinely reading the
   two modules outside `src/server/ai`, so a future refactor cannot quietly
   narrow it back.

   Verified rather than assumed: a `fetch` appended to
   `coach-ai-context-source.ts` fails `lets exactly one module reach the
   network`, and the file was restored afterwards.

2. **`ownerId` echoed the caller, so a real guard could never fire.** The source
   set `ownerId` from the caller's own `owner.id`, which made
   `coach-ai-service.ts`'s `records.ownerId !== input.owner.id` guard —
   documented as "the context source must never hand back another owner's
   records" — structurally unable to fire for this source. The reviewer
   confirmed the legacy source did the same, so this is not a regression, but a
   predicate that cannot fail is not a control.

   `profile.userId` was already in hand from the read at the top of `load`. It
   is now asserted against the requested owner, fails closed with
   `owner_denied`, and is the value reported as `ownerId`. The service's guard
   therefore compares two independently derived values, and a new test drives
   the mismatch path so the refusal is known to be reachable.

Both corrections invalidate round 1's approval of `2d85a1c`. The commit to
re-review is `ea8d0f5`.

## Round 2 review: approved for acceptance against `ffe3c7e`

A second, distinct independent reviewer re-read the correction range
`06965a9..ffe3c7e` on 14 September 2026 and returned **approve with findings**,
none blocking. It reviewed finding 2 as new code rather than as a closed
finding, because the fix restructured a null-check inside an authorization path
to satisfy a type narrower, which is where a real defect would hide.

**The authorization trace.** The only path that skips the ownership assertion at
`coach-ai-context-source.ts:112` is `profile === null`, and that path is
terminated unconditionally ten lines later by the zone refusal at line 122. So
every value returned from `load` was read under a profile that exists *and*
whose `userId` equals the requested owner. The null-profile case is still a
refusal, and still the same refusal it was before the restructure
(`context_below_minimum`, not the new code). Refusal ordering leaks nothing: the
ownership refusal precedes the zone refusal, so a mismatched profile yields
`owner_denied` whatever its zone state, and the mismatched owner's zone presence
is never distinguishable. `owner_denied`'s safe message names no account,
provider, or configuration state. The lead independently re-read lines 100–135
and reached the same conclusion.

**The tripwire.** `PROVIDER_BOUND_ROOTS` leads with `AI_ROOT`, so the scanned
set is a strict superset of what it scanned before; the
`expect(reaching).toEqual([openai-adapter.ts])` assertion is unchanged and now
runs over the larger set. The reviewer settled the vacuity question by
executing that one file — 6 passed — which proves the two new `toContain` pins
resolve on Windows paths and that the scan is genuinely reading files outside
`src/server/ai` rather than matching nothing.

**One non-blocking finding, deferred deliberately.** The tripwire's own header
claims its list names "every root that holds such a module", and two roots that
shape provider-bound owner data are absent: `src/server/completions`
(`plan-window-top-up.ts` selects the plan window that becomes
`training.plannedSessions`; `completion-log.ts` defines the `Completion` the
source reduces) and `src/server/rolling-plan` (`RollingPlanSession`'s
`localDate`, `title`, `sport`, and `isLocked` are copied verbatim into the
payload). The concrete failure is a telemetry or enrichment `fetch` added to
`plan-window-top-up.ts` passing the gate silently — round 1's defect one
directory over. Both roots were grepped and neither contains a network
primitive today, so this is a coverage gap in a tripwire's stated scope rather
than a live hole or a regression, and closing it requires no exemption. It is
carried as a follow-up rather than a further correction round.
`src/server/roadmap` was considered and deliberately left out: it shapes
provider *output*, not owner input.

**Scope.** The reviewer reconciled the manifest against the diff and found
nothing outside the ticket. `docs/validation/README.md` is this ticket's own
in-flight index entry, not an accepted record, so amending it is permitted.

**One reviewer slip, corrected here.** The round 2 report states that
`readPlanWindowToppedUp` has exactly one non-test call site repo-wide. It has
two: this source at line 151, and `src/app/home/today/page.tsx:108`, which
predates this ticket and is correct under the same ADR-017 consequence. The
brief's constraint is that *this ticket* introduces no other call site, and that
holds — the full ticket range touches no file under `src/app/`.

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

`git diff --stat 9b66e4c..ea8d0f5`, excluding this record and the validation
index that names it:

```
 src/architecture/coach-ai-network-gate.test.ts     |  60 ++-
 src/server/ai/composition.test.ts                  |  37 ++
 src/server/ai/composition.ts                       |  19 +-
 src/server/ai/context-source.ts                    |  11 +-
 src/server/ai/context.test.ts                      |   4 -
 src/server/ai/contracts.ts                         |   1 -
 src/server/ai/fixtures/fixture-corpus.ts           |   1 -
 src/server/context/coach-ai-context-source.test.ts | 511 +++++++++++++++++++++
 src/server/context/coach-ai-context-source.ts      | 288 ++++++++++++
 src/server/training/training-history-context.ts    |  20 +-
 10 files changed, 932 insertions(+), 19 deletions(-)
```

The round 1 corrections alone,
`git diff --stat 2d85a1c..ea8d0f5`:

```
 src/architecture/coach-ai-network-gate.test.ts     | 60 ++++++++++++++++++---
 src/server/context/coach-ai-context-source.test.ts | 19 ++++++-
 src/server/context/coach-ai-context-source.ts      | 29 ++++++++---
 3 files changed, 97 insertions(+), 11 deletions(-)
```

Nothing was deleted or renamed. `src/server/context/` is a new directory holding
one module and its test.

Files whose purpose is not evident from the path and diff:

- `src/server/context/coach-ai-context-source.ts` — the production
  `CoachAIContextSource`. It lives outside `src/server/ai` because
  `src/architecture/server-boundary.test.ts` currently holds
  `src/server/ai/owner.ts` as the only file in that module permitted to import a
  repository, so that no adapter, prompt, or validator can widen the context
  past what the domain service authorized, and it sits beside the AI's other
  data-shaping modules — `training/training-history-context`,
  `goals/goal-records`, `memory/memory-records` — none of which are in
  `src/server/ai` either. The module's own header states this.

  **Correcting this record's first version, which overstated the tradeoff.** It
  said that placing the module in `src/server/ai` would have meant weakening a
  safety property. Round 1 supplied the history that makes that wrong:
  `src/server/ai/context-source.ts` was itself the second named `databaseSeams`
  entry in that invariant until M3-11 (`e370dbe`) deleted the implementation
  behind it. Restoring it would have been re-adding a previously approved named
  seam, reviewed as a deliberate amendment — not eroding an untouched boundary.
  The placement still stands and the reviewer judged it correct; the honest
  statement is that both options were defensible and this one keeps the
  invariant at a single entry.
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
- `src/architecture/coach-ai-network-gate.test.ts` — round 1, finding 1. The
  scan widens from one directory to a named list of roots, and the file's header
  gains the paragraph explaining what it now guards and why over-inclusion is
  the intended direction. No assertion was weakened: the same
  `expect(reaching).toEqual([openai-adapter.ts])` now runs over a strictly
  larger file set, with two added assertions pinning that the set really does
  include the modules outside `src/server/ai`.
- `src/server/ai/composition.test.ts` — the two new assertions reach past the
  service's TypeScript-private `deps` bag. Which context source a real request
  is served by is not otherwise observable, and it is the one thing this wiring
  decides about owner data.

## Data, migration, API, privacy, and security effects

**Schema, migrations, RPCs, generated types, packages: none.** No file under
`supabase/` and no `package.json` entry is touched. Nothing in this ticket
needed a grant, a policy, or a privileged function; had it, the instruction was
to stop and re-dispatch against M3-15A.

**Ownership and authorization.** No read is scoped by an id the caller supplied.
The source reads only through `createProfileRepository`, `createGoalRepository`,
`createMemoryRepository`, `createCompletionLog`, and `createRollingPlan`, each
of which derives identity from verified Auth claims and repeats the `user_id`
predicate over RLS. There is no SQL, no Supabase client, and no `verified-user`
import in the new module.

`load(owner)` takes the branded `CoachAIOwner` so the id the profile read
returns can be checked against the id the request was made for. After round 1's
finding 2 that check is real in both places: the source refuses with
`owner_denied` on a mismatch, and the `ownerId` it reports is `profile.userId`
rather than the caller's own value, so `CoachAIService`'s
`records.ownerId !== input.owner.id` guard compares two independently derived
values instead of a value against itself. The branded owner is still never what
any read is scoped by.

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
inside `context.ts` — before anything is serialized.

Completions are reduced in the source instead, and the accurate reason is not
that assembly lacks a gate for them: `toCompletionReference` is a field-by-field
gate exactly like the other two. It is that its *input* type,
`TrainingHistoryCompletion`, is already narrower than `Completion`, so somebody
had to map one to the other, and wherever that mapping lives is a second place
the allowlist can be widened by accident. This record's first version said
"completions have no such second gate", which was imprecise; round 1 corrected
it.

**The write side effect.** `readPlanWindowToppedUp` materializes missing series
occurrences, and the source calls it exactly once, in `load`, before reading the
slice. That is ADR-017 consequence 3 and approval-boundary decision 4: a coach
reading an untopped window plans around sessions the owner does have. It is
deliberately the opposite of M3-15C, where viewing history must not materialize
future training. A top-up failure never fails the read; the slice is returned
with `toppedUp: false`, which the source then discards — see limitation 4.

**No provider call was made, and none can be made by this change.** Every check
ran in fixture mode. No `FITTIP_AI_*` variable was set, no credential was read,
and no network request was issued to any provider. `src/server/context/` holds
no network primitive; `src/architecture/coach-ai-network-gate.test.ts` still
passes with `openai-adapter.ts` as the one module that can reach the network.

**Browser storage:** unchanged; nothing client-side is touched.

## Tests and final results

**Continuous integration: green for the reviewed commit, on its first attempt.**

| SHA | Run | Conclusion |
| --- | --- | --- |
| `06965a95ae1a78ff47903770a7778a905b110e36` | [34823799022](https://github.com/mattiss01/fittip/actions/runs/34823799022) | failure — `e2e/m3-14b-recurring-series.spec.ts:275` only, the M3-22 defect |
| `ffe3c7eaf277102b35548754151b145701e6f092` | [34833095545](https://github.com/mattiss01/fittip/actions/runs/34833095545) | **success** — `static`, `database`, and `browser` all green, no rerun |

`ffe3c7e` is the reviewed commit, and its run is green with no exception
claimed. The product owner had accepted the M3-22 known-defect exception for
this ticket on 14 September 2026, against the earlier `06965a9` run. **That
acceptance went unused.** The flake did not recur on the reviewed SHA, so this
record claims no exception and rests on an unqualified green run. The
acceptance is recorded here only so the decision is not lost: M3-22 remains an
open, undispatched Tier 3 defect, and the exception it was granted for expired
with the run it was granted against.

The green `static` job also closes the one gap the builder recorded honestly
below — it did not re-run `build` locally after the corrections. That job runs
`next build` on this exact SHA.

**Vercel Preview:** https://fittip-j77en39t4-mattis-3657s-projects.vercel.app —
deployment `6435062079`, state `success` for `ffe3c7e`. No migration is
involved, so no founder hosted database step applies to this ticket.

Tests added or changed:

- `src/server/context/coach-ai-context-source.test.ts` — new, 11 tests. It mocks
  the five repository factories and asserts: the refusal for an owner with no
  confirmed zone and for one with no profile row, and that nothing else is read
  in that case; the refusal when the profile read returns a different owner than
  the one asked about, added for round 1's finding 2; the owner-local derivation
  of today and of both window ends; that the plan window is topped up with the
  revision the slice reported, once; the field-by-field completion mapping; the
  out-of-allowlist proof below; unplanned completions reporting a null title and
  sport; cancelled planned sessions appearing as neither commitment nor miss;
  and that `sources` names only the completions each operation's own limits
  transmit.
- `src/server/ai/composition.test.ts` — two assertions that a composition with
  no injected source gets `OwnedRecordsCoachAIContextSource`, and that an
  injected stub still wins.
- `src/server/ai/context.test.ts` — four `correctionReason: null` lines removed.
  Nothing else in that file moved; no assertion changed.
- `src/architecture/coach-ai-network-gate.test.ts` — round 1, finding 1. Two
  assertions added, none removed or weakened; the existing
  `lets exactly one module reach the network` now runs over five roots rather
  than one. Checked by appending a `fetch` to `coach-ai-context-source.ts`,
  observing the failure, and restoring the file — `git diff` confirmed the
  restore.

**Acceptance criterion 2, specifically.** The test `copies only allowlisted
completion fields, whatever else the record carries` adds three fields to a real
`Completion` — `actualStartedAt` with a real value, plus `clinicalNote` and
`heartRateAverage` standing in for whatever the schema gains next.

It then makes **two** assertions, and this record's first version credited only
the second. The `toEqual` against an exact object literal is what pins the first
gate: it fails on any key the mapping adds, including one a substring scan would
miss. The scan of `buildCoachAIContext(...).serialized` is what proves the
result end to end — that neither the added keys nor their values, nor the
completion's id, `timezoneName`, `planSessionId`, `updatedAt`, or
`plannedSnapshot`, survive into the payload a provider would receive. Either
alone would be weaker than the pair.

| Command or check | Result |
| --- | --- |
| `npm.cmd run test:run -- src/server src/architecture` (at `2d85a1c`) | 38 files, 585 tests passed |
| `npm.cmd run test:run -- src/server/context src/server/ai src/architecture` (at `ea8d0f5`) | 18 files, 368 tests passed |
| `npm.cmd run typecheck` | passed |
| `npm.cmd run lint` | passed |
| `npm.cmd run build` (at `2d85a1c`) | passed; all 21 routes compiled |
| `git diff --check 9b66e4c..HEAD` | clean |
| `npx.cmd prettier --write` on each changed file, then `git diff` | no content change |

The build was not re-run after the round 1 corrections. They touch three files,
two of them tests, and `typecheck` and `lint` both pass on the result; CI
establishes the build for the reviewed SHA.

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

   Round 1 found a second way this can break that the first version of this
   record did not mention: `buildCoachAIContext` takes an optional `limits`
   third parameter, defaulting to `COACH_AI_CONTEXT_LIMITS[operation]`. The
   source reads that same table by operation, so exactness holds while
   `CoachAIService` passes no third argument — which it does not today. A caller
   that passes custom limits silently desynchronizes the two, with no error and
   no test failure. Nothing currently does, and nothing in this ticket adds a
   caller that could; it is recorded because it is a second unguarded
   assumption, not because it is live.
4. **A failed top-up is not disclosed to anyone.** `readPlanWindowToppedUp`
   returns `toppedUp: false` and a `skipped` list when materialization could not
   run or could not take a rule date, and the source discards both. The coach is
   then handed a plan slice that may be short of occurrences a series would have
   produced, with nothing saying so — which is exactly the residue ADR-017
   consequence 3 exists to make visible, and the same class of failure ADR-013
   decision 1 refuses for a trimmed completion window. It is not a wrong answer
   so much as an undisclosed one. Round 1 found this; the mechanism was
   described in this record from the start but not listed as a limitation.
   Carrying the disclosure through to the owner needs a surface to show it on,
   which is M3-15E.
5. **An unplanned completion carries no title and no sport.** They come from the
   planned snapshot, and an unplanned completion has none. Reporting null is
   honest; deriving a sport from the logged activities would invent a session
   the owner never planned. The coach still sees the status, the duration, the
   effort, and the activity names.
6. **The miss list can misread a completion logged outside the window.** A
   planned session inside the 56-day window whose completion has an
   `actualLocalDate` outside it is not in the completion read, so the session is
   reported as missed. This needs a completion recorded against a session more
   than eight weeks from its planned date, so it is rare, but it is a real way
   the adherence signal can be wrong.
7. **The forward plan read is 180 days wide.** Nothing bounds a
   `get_rolling_plan_slice` window, and series materialization only fills 14
   days forward, so in practice the far end returns only manually created
   sessions. It has not been measured against an owner with a large hand-built
   future plan.
8. **`sources` records completions only.** Goal and memory provenance already
   travels as `assembled.references`; plan provenance is recorded nowhere. M3-16
   owns proposal application and is where that gap has to be closed or
   explicitly accepted.
9. **`horizonEndDate` on the records the source returns is `today`.** `load` is
   not given the compose input and must not invent a horizon; assembly replaces
   the value with the one the owner actually composed against. It is inert, but
   a reader of `CoachAIOwnedRecords` in isolation could misread it.
10. **The composition default is an interpretation.** See the note on
   `composition.ts` under changed files. If the product owner reads acceptance
   criterion 1 as requiring a production caller rather than a production
   default, that caller belongs to M3-15E and this ticket does not deliver it.

## Independent reviewer checklist

Review `ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2` on
`ticket/m3-15d-ai-completion-context`. The full range is
`git diff 9b66e4c2356b8d58bdaab875513810ef83acd175..ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2`.
Round 1 approved everything up to `2d85a1c`, so a re-review may read only
`git diff 2d85a1cc65b800a53f02617c5ab8fa3bb2cfee1c..ea8d0f5fba19fa24c0a1b805a9c64fceebdb16b2`
plus items 11 and 12 below. Confirm the CI run for the exact head SHA is green;
do not re-run lint, typecheck, the Vitest suite, the build, or the browser
flows.

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
11. **The widened network scan (round 1, finding 1).** Judge whether five named
    roots is the right expression of "every module that shapes provider-bound
    owner data", or whether it is now wide enough to produce false positives
    somebody will be tempted to narrow away. Confirm no assertion was weakened
    to accommodate the wider set, and that the header now describes what it
    guards rather than where it looks.
12. **The ownership assertion (round 1, finding 2).** Confirm the mismatch
    refusal is placed before any other read, that `owner_denied` is the right
    code for it rather than a new one, and that the null-profile path still
    resolves to `context_below_minimum` rather than being swallowed by the new
    check.

## Acceptance

**Accepted by the product owner on 14 September 2026**, against the
independently reviewed `ffe3c7eaf277102b35548754151b145701e6f092` and its
Vercel Preview at https://fittip-j77en39t4-mattis-3657s-projects.vercel.app.

The acceptance covers the data boundary this ticket opens: up to 20 completions
from the last 56 owner-local days, each reduced field by field to the ADR-013
allowlist, carrying the four health signals — pain, illness, injury, and severe
fatigue — that leave for a US provider here for the first time in fact rather
than in principle. The product owner was asked to approve those four
deliberately and separately at dispatch on 14 September 2026, and did.

| Step | Result |
| --- | --- |
| Merge to `master` | `85567a9b6f0b29b5df5ab71ae755136eb9349e3a`, a `--no-ff` merge of the ticket branch |
| `master` continuous integration | [34851693075](https://github.com/mattiss01/fittip/actions/runs/34851693075) — success |
| Founder deployment | `6438503969`, state `success`, https://fittip-nk6pkojd4-mattis-3657s-projects.vercel.app |
| Hosted database migration | Not applicable — nothing under `supabase/` changed |

**No 390px acceptance pass was performed, and none was owed.** This ticket adds
no route, component, or copy; the mobile demo path section above says so. The
acceptance is a judgment on what data leaves, not on how anything looks.

**The lead performed no hosted smoke check, and could not.** Vercel deployment
protection sits in front of the founder environment, so every unauthenticated
request is answered `302` to `vercel.com/sso-api` before the application runs.
That boundary is correct and desirable, but it is evidence about Vercel and
never about FitTip. What carries each assertion instead: the green `browser`
job for the merge commit covers the 390px flows, and the context source has no
hosted surface to smoke — it is reached only from a coaching operation, and no
operation is wired to a surface until M3-15E and M3-16. The first hosted
exercise of this code will be M3-15E's, and that ticket owes the check.

**Follow-up opened.** The round 2 reviewer's non-blocking tripwire coverage
finding is carried as [M3-25](../../backlog/M3/M3-25-NETWORK-TRIPWIRE-COVERAGE.md),
on the product owner's decision of 14 September 2026, rather than reopening
this ticket for a third correction round.
