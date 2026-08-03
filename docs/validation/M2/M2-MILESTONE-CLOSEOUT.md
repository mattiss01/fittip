# M2 milestone closeout

**Lifecycle state:** accepted — 3 August 2026

**Approval:** On 29 July 2026 the product owner requested the smallest useful
M2 validation slice, following the targeted M1 closeout model. Execution was
queued in [M2-04](../../backlog/M2/M2-04-M2-VALIDATION-SLICE.md) until M2-01
through M2-03 were individually accepted, merged, pushed, deployed, and hosted-
verified. All three conditions were met on 3 August 2026.

**Accepted slices:** [M2-01](M2-01-VALIDATION.md), [M2-02](M2-02-VALIDATION.md),
and [M2-03](M2-03-VALIDATION.md)

## Purpose

Close M2 without repeating the exhaustive database, RLS, concurrency, domain,
mobile, accessibility, privacy, and independent-review evidence already
recorded for its three accepted slices. This closeout adds no product, schema,
external-service, or AI behavior.

## Approved targeted evidence

The five checks approved in M2-04. Items 1, 3, 4 and the non-sensitive half of
5 are the lead's; item 2 and the attestation in 5 are the product owner's,
because the founder credentials are private.

## Exit rule

If the walkthrough or an authorization boundary fails, M2 remains open and the
finding returns to its owning accepted ticket as a focused correction. Otherwise
this record moves to **accepted**, M2 closes, and
[M3-01](../../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) becomes
dependency-ready but remains separately proposed.

## Evidence

### Git and founder deployment

Every accepted M2 commit is an ancestor of pushed `master` at `2691eb3`:

| Ticket | Accepted commit | On `master` |
| --- | --- | --- |
| M2-01 | `ae7d3104` (`6542693` merged) | yes |
| M2-02 | `e5dab525` | yes |
| M2-03 | `2dd7824c` | yes |

Two commits have landed since M2-03's acceptance — `7f277b6` (its acceptance
record) and `2691eb3` (the M2-09 continuous-integration stopgap). Their combined
diff touches only `docs/` and `.github/workflows/ci.yml`. No file under `src/`,
`supabase/`, or `next.config.ts` changed, so M2-03's post-merge hosted database
evidence is not invalidated by anything after it.

Founder deployment `dpl_8vN1B9Rqqv5D8FJUkWDGUkTNdsno` is `Ready`, built from
branch `master`, and carries the `fittip-gilt.vercel.app`,
`fittip-mattis-3657s-projects.vercel.app`, and `fittip-git-master-...` aliases.

### Anonymous hosted boundary

Unauthenticated requests against the founder alias on 3 August 2026:

| Path | Result |
| --- | --- |
| `/` | `200`, sign-in surface |
| `/home/you` | `303` to `/` |
| `/home/you/onboarding` | `303` to `/` |

Both protected responses carry
`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`,
`Pragma: no-cache`, `Expires: 0`, and
`X-Robots-Tag: noindex, nofollow, noarchive`. `/home/you/onboarding` is M2-03's
new surface and is covered by `src/proxy.ts`'s `/home/:path*` matcher rather
than by a route-specific rule.

Runtime logs for the exact founder deployment contain no `error` or `fatal`
entry. Every record is `level: info` on `branch: master`.

### Hosted database — reused, not re-queried

M2-03 recorded post-merge hosted verification on 3 August 2026: hosted migration
history ending at exact repository version `20260802201214`, all six onboarding
tables present with RLS enabled, and advisors showing only the intentional
authenticated-access entries, the pre-existing founder-staging leaked-password
warning, pre-existing unindexed foreign keys, and expected unused indexes.

That evidence is reused here under M2-04's "evidence reused without automatic
rerun" clause. The repository holds nine migrations and the newest is the one
hosted history ends at, so the hosted schema is current by inspection. **The
hosted database was not independently re-queried today**, because nothing
between M2-03's verification and `2691eb3` changed a migration, and because a
remote Supabase query needs the product owner's per-occasion override. If a
fresh confirmation is wanted before acceptance, say so and it will be run.

### Context eligibility for future AI

Memory has an explicit, documented, tested gate.
`selectActiveMemoryContext` (`src/server/memory/memory-records.ts:98`) admits an
item only when `status === "active"` and its review date has not passed. The
status set is exactly `active`, `proposed`, `rejected`, `archived`, and its unit
tests assert the admit/exclude decision for all four plus an expired-but-active
item, so the gate is covered exhaustively rather than by sample.

One naming note, because M2-04 step 3 asks about "a disabled context item" and
no such status exists. **Disabled is the user-facing name for `archived`** —
`src/components/memory/memory-manager.tsx:97` maps the status to the "Disabled"
label, and the surface says "Disabled memory stays inspectable and is excluded
from coaching context." Disabling is `archived`, which the selector excludes and
the tests cover. `disabled` and `enabled` do exist as `MEMORY_CHANGE_KINDS`, the
history verbs, and `inferred_proposed` is a provenance rather than a status.
The vocabulary diverges between the UI and the data model; the behavior asked
for is present.

Onboarding candidates are excluded structurally rather than by a filter. Drafts
and candidates live in six dedicated `onboarding_*` tables, each with RLS
enabled and owner-scoped policies, and reach `goals` or `memory_items` only
through explicit publication. A draft or rejected candidate is therefore not a
row the memory selector could return.

**Goals have no equivalent selector.** See the finding below.

### No-AI boundary

The full dependency set is `@supabase/ssr`, `@supabase/supabase-js`, `next`,
`react`, `react-dom`, `server-only`, and the toolchain. No AI provider or SDK is
declared, and no module under `src/` references a provider, model call, or
generation entry point. M2 introduces no provider call, generated plan, silent
inference, or direct AI write.

### Private owner walkthrough

The product owner ran the approved path at `390x844` against
`https://fittip-gilt.vercel.app` on 3 August 2026 using the private founder
session, and attested that it passed:

**start/resume onboarding -> add and prioritize goals -> add coaching context ->
review/edit/reject candidates -> publish selected records -> inspect and edit
the resulting Goals and Coach context under You.**

Per the M1 closeout's retention rule, no owner email, password, Auth token, user
UUID, secret, note, or training detail is recorded here. The attestation is the
evidence; the session contents are deliberately not.

This is the first end-to-end exercise of the chain. M2-01, M2-02, and M2-03 were
each accepted in isolation, and onboarding through to editing published records
under **You** had never run as one continuous hosted flow. It also closes the
coverage gap M2-02 accepted knowingly: its review actions had no browser
coverage until M2-03 could produce real proposals.

## Findings

### F1 — no active-goal context selector

M2-04 acceptance criterion 3 requires that only active, explicitly accepted
**goals and memory** be eligible for future AI context. Memory satisfies this
through `selectActiveMemoryContext`. Goals do not have a counterpart.

The data supports the distinction: `goals.status` is constrained to `active`,
`paused`, `achieved`, or `abandoned`, and a check constraint ties `archived_at`
to a non-`active` status. What is missing is the accepted contract — no function
expresses "these are the goals an AI may read", and no test asserts that a
paused, achieved, abandoned, or archived goal is excluded.

Nothing is broken today, because nothing reads goals for AI. The cost is that
[M3-01](../../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) would have to
invent that boundary itself, in the ticket that first introduces a provider —
which is the worst place to be defining what an AI is allowed to see.

**Resolved on 3 August 2026.** The product owner settled the policy rather than
deferring it, on the grounds that the expensive part is the coaching decision
and not the code, and that M3-01 is the worst place to be making it. Recorded as
[ADR-012](../../decisions/ADR-012-AI-GOAL-CONTEXT-ELIGIBILITY.md): a goal is
targetable only while `active` and unarchived; `achieved` goals are readable as
history but never targetable; `paused` and `abandoned` are excluded entirely;
targetable and historical are separate context fields; and the gate is
deny-by-default so a future status is invisible until someone amends the ADR.

Implementation belongs to M3-01, which now names ADR-012 in its architecture
boundary and carries the selector in scope item 6 with an explicit instruction
not to redecide the policy. No correction returns to M2-01, and F1 does not
block M2 acceptance.

One consequence is worth stating plainly: a user who wants a paused goal
considered must resume it, and no UI affordance explains that. ADR-012 records
it as accepted and unaddressed.

## M2 closes with four open tickets

Deliberately, and none of them blocks anything. M3 depends only on M2-01 through
M2-04. Milestone numbers here mark where work originated, not a release train —
M2-05 and M2-06 were likewise raised and accepted mid-milestone — so these four
keep their numbers as open defects against a closed milestone rather than being
renumbered into M3.

| Ticket | Priority | Why it stays open |
| --- | --- | --- |
| [M2-07](../../backlog/M2/M2-07-GOAL-REVIEW-FOLLOWUPS.md) | P2 | Eight findings from M2-01's second review. Two are pgTAP guards that cannot fail, so the suite reports RLS properties it does not test. |
| [M2-08](../../backlog/M2/M2-08-TYPE-GENERATION-DRIFT.md) | P2 | The documented type-generation step reddens `typecheck` on unchanged `master`. M3-02 and M3-03 both add schema, so this taxes M3's real work. |
| [M2-09](../../backlog/M2/M2-09-APP-ROUTER-LOST-RENDER.md) | P1 | The App Router race is unexplained. Two surfaces carry mitigations and continuous integration now retries the planning flow, which makes it quieter rather than fixed. |
| [M2-10](../../backlog/M2/M2-10-FOCUS-LOST-AFTER-MUTATION.md) | P2 | Keyboard and screen-reader users restart from the top after every mutation on both management surfaces. No external user exists yet; this must precede one. |

Two of these are worth naming as risks rather than filing quietly. M2-09 is now
masked by its own stopgap, which is precisely when a P1 gets forgotten; its
removal is written into its acceptance criteria so it cannot become permanent by
default. M2-07's unfailable pgTAP guards buy false confidence in the
authorization model this product rests on, which is a stronger claim than its P2
label carries.

## Acceptance

**M2 is accepted and closed on 3 August 2026** as the goals, editable
coaching-context, and guided-onboarding foundation.

All six acceptance criteria are met. The exact accepted commits and their
validation records are identified; the hosted walkthrough passed at `390x844`;
context eligibility is settled for memory by `selectActiveMemoryContext`, for
onboarding candidates structurally, and for goals by ADR-012 with implementation
assigned to M3-01; hosted migration, RLS, advisor, and founder-boundary checks
carry no unresolved blocker; no AI provider, plan generation, external-user,
analytics, or production behavior was introduced; and this record holds the
evidence and the decision.

Two limitations are accepted as recorded rather than resolved. The hosted
database was reused from M2-03's same-day verification and not independently
re-queried, on the basis that no migration changed in between. A paused goal
must be resumed before a coach will consider it, and no interface affordance
explains that.

[M3-01](../../backlog/M3/M3-01-LOCAL-AI-ADAPTER-CONTROLS.md) is now
dependency-ready. It remains separately proposed and still requires explicit
product-owner approval of the provider, model, key use, data-use and retention
terms, rate card, hard limits, and maximum spend before any implementation.

## Post-closure Tier 3 entries

Appended after acceptance. Nothing above this line is rewritten. Tier 3 changes
record one entry here rather than taking their own validation document.

### M2-08 — type generation reproduces the committed file

**Reviewed commit** `61379f1b544253ecef4a6660ef9605a86ca39f25` on
`ticket/m2-08-type-generation-drift`. Lead-implemented; Tier 3 replaces the
builder and reviewer split.

- `e945ed912b54b452917906c335dbfe98019fb576` — initial implementation.
- `61379f1b544253ecef4a6660ef9605a86ca39f25` — correction: the Args-block
  pattern did not match CRLF working files.

Continuous integration for the reviewed commit:
[run 30815703994](https://github.com/mattiss01/fittip/actions/runs/30815703994),
**green** — 51 test files, all three jobs.

**Re-scoped mid-ticket.** Dispatched Tier 1 on the lead's diagnosis that the
fix was a forward migration adding `default null` to nine parameters. The
builder proved that is not executable — PostgreSQL requires every parameter
after a defaulted one to have a default, and the nine sit at positions 2, 4, 6,
8, 10-13 and 18 of nineteen, interspersed with parameters that must stay
required. Correcting the signature meant dropping and recreating a
`security definer` function guarding accepted training data, plus seven edits
to M1-03's pgTAP file. The product owner declined that blast radius for a
typecheck defect and chose to patch the generated types instead. The builder
committed nothing and handed back; that was the correct call and the brief's
stop condition working as intended.

**Delivered.** `npm run types:patch` restores the nine `| null` annotations
`supabase gen types` cannot emit. The generator never emits `| null` on an RPC
argument because PostgreSQL has no per-argument nullability to read, so the
patched file describes the database *more* accurately than raw generator
output. Generate → format → patch now reproduces the committed file
byte-identically, verified against the local stack at CLI 2.109.1 with all nine
migrations applied from zero.

**A second defect surfaced while verifying.** The documented command passed
`--schema public`, which silently dropped the `graphql_public` schema the
committed file carries. Fixed in the same commit.

**Changed files.**

```text
 .claude/skills/schema-change/SKILL.md |  12 ++-
 README.md                             |  25 +++++-
 package.json                          |   1 +
 scripts/patch-database-types.mjs      | 154 +++++++++++++++++++++++++++++++
 scripts/patch-database-types.test.mjs | 113 ++++++++++++++++++++++
 5 files changed, 300 insertions(+), 5 deletions(-)
```

Nothing was deleted or renamed. No schema, migration, RPC, policy, grant,
dependency, or application-code change; `src/lib/supabase/database.types.ts` is
untouched by this commit. `scripts/patch-database-types.mjs` is a pure function
plus a thin CLI, kept free of subprocess and platform branching so the logic is
directly testable.

**Tests.** Nine unit tests cover the patch, the required-argument and `Returns`
blocks it must not touch, idempotency, and four distinct failure messages —
unknown function, missing argument, argument-became-optional, and unformatted
input. The last exists because running the patch before Prettier is the easy
mistake and would otherwise surface as nine identical "argument missing"
errors. A guard test asserts the committed types already carry the annotations,
so regenerating without patching fails continuous integration rather than
landing silently.

| Check continuous integration does not cover | Result |
| --- | --- |
| `db reset --local` + generate → format → patch, then `git diff` | clean; byte-identical to the committed file |
| `git diff --check` | clean |
| Full local `test:run` on Windows/CRLF | 51 files, 362 tests; found the CRLF defect below |

No Vercel Preview check applies. This commit changes no `src/` file, no
migration, and no runtime behavior — only tooling, its tests, and
documentation.

**The correction is worth reading.** The first commit's pattern matched the
generated Args block on `\n` only. Continuous integration checks out LF and
passed all nine tests; the working tree here is CRLF under
`core.autocrlf=true`, and the guard test failed immediately. An LF-only
pattern would have gone green on every hosted run while throwing for every
developer running the schema workflow — the exact inversion of the failure this
script exists to prevent. The fix adds `\r?` and, more importantly, a CRLF
regression test, because continuous integration structurally cannot catch that
class.

**One unrelated observation, recorded not diagnosed.** The first CI run
([30815101025](https://github.com/mattiss01/fittip/actions/runs/30815101025))
reported all 51 test files passing but exited non-zero on two unhandled
`ReferenceError: window is not defined` errors attributed to
`src/app/home/progress/[id]/page.test.tsx` — a file this ticket does not touch,
which contains no `window` reference. It did not recur on the reviewed commit
and never reproduced locally. Most likely something in that file's import graph
touches `window` after the jsdom environment tears down, surfaced by a timing
change. It is not diagnosed and does not belong to M2-08.

The product owner decided on 3 August 2026 to leave this as a note rather than
open a ticket, on the evidence available: one occurrence, not reproducible, and
no failing assertion behind it. If it recurs, this paragraph is the prior
observation to cite — a second sighting makes it a pattern rather than a
one-off, and worth opening then.

**Known limitations.**

- **The database signature still does not say what the application means.**
  `save_training_completion` declares nine parameters as required that the
  application always may pass as NULL. The types now describe reality; the
  schema does not. Correcting it remains available as the drop-and-recreate
  described above, and nothing here forecloses it.
- **The patch is pinned to one function.** A second RPC with genuinely nullable
  arguments needs adding to `NULLABLE_ARGUMENTS` deliberately. That is the
  intent — silent generalization is how this class of drift returns — but it is
  a manual step nothing enforces.
- **Formatting-shape coupling.** The patch navigates Prettier's output shape and
  fails loudly if it changes. A Prettier major bump may require updating it.
