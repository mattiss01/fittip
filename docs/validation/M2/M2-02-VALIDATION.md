# M2-02 builder validation: memory model and management

**Ticket:** [M2-02](../../backlog/M2/M2-02-MEMORY-MODEL-MANAGEMENT.md)

**Lifecycle state:** accepted 2 August 2026 by the product owner, against the
independently reviewed commit and its Vercel Preview, after three independent
review rounds and hosted database verification. See
[Independent review outcome](#independent-review-outcome) and
[Product-owner acceptance](#product-owner-acceptance-2-august-2026).

**Exact implementation review target:**
`e5dab525c140fa290a61545cc59706ca0bb69758`

**Initial implementation commit:**
`460ee184cb60c28d41f64481515c0bb8f459249a`

**Builder correction commits:**

- `6ac57c2741f43ec32cc9b5f9a959c01a70b59df6` — recovers a memory change whose
  result never reaches the screen, after continuous-integration run
  30728162026 proved the defect on this surface; also formats
  `e2e/m2-02-memory.spec.ts`, which failed the CI Prettier step.
- `3fc223732214732067d76618a6e6bd29c47abdc9` — the first independent review's
  three corrections: an unsaved Add-memory draft destroyed by any unrelated
  action, two bounded-lock pgTAP guards that passed when the property was
  absent, and ADR-010 framing a builder decision as pre-approved. Also
  corrects this record's browser-storage claims.
- `75520c2` — a user-created `observed_pattern` is active on save, after the
  product owner overturned ADR-010 decision 7 on 2 August 2026. The migration
  is amended in place; see *The overturned decision*.
- `1796965` — the pgTAP suite proves the review queue only from directly
  seeded system proposals, and asserts that no authenticated create produces
  one.
- `39315b9f213f929184c4dcf98bf337e15bfe5532` — removes the review-queue steps
  from the 390px flow rather than faking a user path to a proposal, and drops
  the create form's "(starts proposed)" option text.
- `e5dab52` — the second independent review's one correction: restores
  keyboard coverage, which had gone with the deleted decline block, by driving
  permanent deletion entirely by keyboard.

**Lead commit on this branch:** `deabe75` — `ci: run the M2-02 memory browser
flow` (port 3016). Wiring the flow into continuous integration was a
`.github/**` tooling change outside the builder's scope; the builder reported
the gap and the lead closed it.

**Branch:** `ticket/m2-02-memory-model`

**Base:** `79fdefbb76005264bbea9e1acbdc37f46289b0e4`

**Architecture decision:**
[ADR-010](../../decisions/ADR-010-M2-MEMORY-WRITE-BOUNDARY.md) — proposed,
recording the write boundary the product owner approved in principle at
dispatch, for confirmation with this ticket. Decision 7 has already been
ruled on: the owner overturned it on 2 August 2026.

**Mobile evidence:** [empty state](evidence/M2-02-empty-390x844.png),
[filed memory](evidence/M2-02-filed-390x844.png),
[stale conflict](evidence/M2-02-stale-conflict-390x844.png),
[permanent delete](evidence/M2-02-delete-390x844.png),
[final state](evidence/M2-02-final-390x844.png)

**Continuous integration:** run 30728162026, against `deabe75`, was **red** —
two failures, both real and both now fixed in
`6ac57c2741f43ec32cc9b5f9a959c01a70b59df6`. See *The red continuous-integration
run* below. The run for the corrected SHA is not yet recorded; the lead pushes
and records it.

**Independent review:** first round reviewed `6178d8e` against CI run
30748008542 (green) and returned **correction required** — three findings, no
authorization, ownership, deletion, provenance, locking, or privacy defect in
the code. All three are fixed in
`3fc223732214732067d76618a6e6bd29c47abdc9`; see *The first independent review*
below.

Second round reviewed `d3797bd` and **approved** the reversal of ADR-010
decision 7: correct and complete, with the forgery invariant intact and, in
the reviewer's assessment, stronger than before — `proposed` is now
unreachable from the authenticated write path entirely rather than for three
classes out of four. The reviewer re-derived the pgTAP revision sequence by
hand, confirmed the cross-owner assertion is pinned to user B's own revision,
and independently verified the premise for amending the migration in place.
One correction: the deleted decline block had carried the surface's only
keyboard assertion. Fixed in `e5dab52`. Re-review of that commit pending.

**Product-owner acceptance:** not yet requested

## Delivered behavior

- `/home/you` links to a new **Memory** surface at `/home/you/memory`,
  reachable only by an authenticated verified owner.
- An owner can file a fact, constraint, preference, or observed pattern as one
  validated text value of 1–1000 characters, with an optional review date.
- All four classes become active on save, including `observed_pattern`. The
  product owner ruled on this on 2 August 2026; see *The overturned decision*.
- **proposed** is reserved for content FitTip derived rather than content the
  owner wrote. No authenticated path can produce it, so in M2-02 the review
  queue is always empty and the surface says so.
- A proposal, once M2-03 produces one, offers **Accept**, **Edit and accept**,
  and **Decline**. No action is preselected and leaving the screen changes
  nothing. A declined item is never switchable back on as fact; only permanent
  deletion acts on it. These actions exist and are proven at the database
  level; see limitation 2.
- **Disable** moves an active item to disabled and **Enable** restores it.
  Disabled memory stays fully inspectable and is excluded from active context.
- Editing appends a new version and moves the current pointer. Prior text is
  never overwritten and stays readable in a per-item version history that
  names the version number, what changed, and whether the owner or FitTip
  authored it.
- A passed review date marks an item **review due** and excludes it from active
  context. It never archives, converts, or deletes anything. The owner clears
  it by renewing the date, editing, or disabling the item.
- **Delete permanently** states its effect, requires an explicit confirmation,
  then erases the current text and every earlier version of it in one
  transaction. Only a dated, content-free record that a deletion happened
  remains.
- A filter narrows the view to everything, active, proposed, review-due,
  disabled, or declined. Each option carries its own count and its own
  explanatory line, so narrowing never hides what a status means.
- Every card shows its class, its status stamp, its origin, its version
  number, and its review date when it has one. Confidence and a source
  reference are displayed when present, never as certainty.
- A save that races another tab reports the conflict and offers a reload
  action rather than overwriting the newer collection.
- An unsaved **Add memory** draft survives any action taken on another card.
  The form clears only when the memory it holds has been created, and a
  rejected create returns the owner's own words.
- A save whose result never reaches the screen no longer leaves the surface
  frozen. If the reply arrived and did not render, the page says so and
  reloads to show what is actually saved; if no reply arrived at all, it
  reports the change as unconfirmed and offers a reload. Neither claims the
  change was applied.
- Creating and editing memory shows one static, non-diagnostic safety notice.
  Nothing infers or grades severity, and no classifier exists.
- The empty state says nothing is stored. It makes no claim that the coach has
  learned anything.

## Mobile demo path

Run at `390x844` against a production build, not `next dev`.

1. `npx.cmd supabase start`, then `npx.cmd supabase db reset --local`.
2. `npm.cmd run build`, then `npm.cmd run start -- -p 3016`, with
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set
   from `npx.cmd supabase status`.
3. Sign in, open **You**, then **Manage memory**. The empty state reads
   "Nothing is stored yet."
4. **Add memory** → Fact → "Trains four mornings before work." → Save memory.
5. Add a Constraint with review date `2020-01-01`. It files under **Review
   due** and is stamped so.
6. Add an Observed pattern. It files under **Observed patterns**, stamped
   "Active", exactly like the other three classes.
7. Open the fact's **Edit memory**, change the text, save. The card reads
   Version 2; **Version history** still shows version 1's original text.
8. **Disable** the fact, then **Enable** it.
9. On the constraint, open **Edit memory** and set **New review date** to a
   future date, then **Update review date**. The Review due section
   disappears.
10. Filter to **Proposed 0**. The review queue is empty and says so; nothing
    a user can create ever lands there.
11. Delete a card **using only the keyboard**: Tab to **Delete permanently**,
    press Enter to open it, read the stated effect, Tab to **Confirm permanent
    delete**, press Enter. Reload; the text is gone.
12. Use the filter buttons. Each shows its own count and explanatory line.

The automated form of this path is
`npx.cmd playwright test --config=e2e/m2-02.playwright.config.ts` (port 3016,
`390x844`, `Europe/Berlin`), which also needs `SUPABASE_SERVICE_ROLE_KEY` at
test runtime to create and delete its disposable account. **Without that key
the spec skips silently.**

## Changed files

`git diff --stat 79fdefbb76005264bbea9e1acbdc37f46289b0e4..460ee184cb60c28d41f64481515c0bb8f459249a`

```
 .../M2/evidence/M2-02-delete-390x844.png           |  Bin 0 -> 148774 bytes
 .../validation/M2/evidence/M2-02-empty-390x844.png |  Bin 0 -> 34752 bytes
 .../validation/M2/evidence/M2-02-filed-390x844.png |  Bin 0 -> 129452 bytes
 .../validation/M2/evidence/M2-02-final-390x844.png |  Bin 0 -> 123200 bytes
 .../M2/evidence/M2-02-review-queue-390x844.png     |  Bin 0 -> 133893 bytes
 .../M2/evidence/M2-02-stale-conflict-390x844.png   |  Bin 0 -> 119568 bytes
 e2e/m2-02-memory.spec.ts                           |  352 +++++++
 e2e/m2-02.playwright.config.ts                     |   17 +
 src/app/home/you/memory/action-state.ts            |   24 +
 src/app/home/you/memory/actions.test.ts            |  186 ++++
 src/app/home/you/memory/actions.ts                 |  152 +++
 src/app/home/you/memory/error.tsx                  |   18 +
 src/app/home/you/memory/loading.tsx                |   13 +
 src/app/home/you/memory/memory.module.css          |  447 ++++++++
 src/app/home/you/memory/page.tsx                   |   53 +
 src/app/home/you/page.tsx                          |   16 +-
 src/architecture/server-boundary.test.ts           |   19 +-
 src/components/memory/memory-manager.test.tsx      |  305 ++++++
 src/components/memory/memory-manager.tsx           |  607 +++++++++++
 src/lib/supabase/database.types.ts                 |  214 ++++
 src/server/memory/memory-privacy.test.ts           |  161 +++
 src/server/memory/memory-records.test.ts           |  144 +++
 src/server/memory/memory-records.ts                |  166 +++
 src/server/repositories/memory-repository.test.ts  |  336 ++++++
 src/server/repositories/memory-repository.ts       |  272 +++++
 .../20260801085404_m2_02_memory_model.sql          |  708 +++++++++++++
 supabase/tests/database/m2_02_memory.test.sql      | 1077 ++++++++++++++++++++
 27 files changed, 5284 insertions(+), 3 deletions(-)
```

The correction commit,
`git diff --stat 460ee184cb60c28d41f64481515c0bb8f459249a..6ac57c2741f43ec32cc9b5f9a959c01a70b59df6`,
also carries the docs commit and the lead's CI commit that sit between them:

```
 .github/workflows/ci.yml                           |  10 +
 docs/decisions/ADR-010-M2-MEMORY-WRITE-BOUNDARY.md | 206 +++++++++
 docs/validation/M2/M2-02-VALIDATION.md             | 500 +++++++++++++++++++++
 .../M2/evidence/M2-02-delete-390x844.png           | Bin 148774 -> 161668 bytes
 .../validation/M2/evidence/M2-02-empty-390x844.png | Bin 34752 -> 34722 bytes
 .../validation/M2/evidence/M2-02-filed-390x844.png | Bin 129452 -> 123183 bytes
 .../validation/M2/evidence/M2-02-final-390x844.png | Bin 123200 -> 123896 bytes
 .../M2/evidence/M2-02-review-queue-390x844.png     | Bin 133893 -> 132170 bytes
 docs/validation/README.md                          |   1 +
 e2e/m2-02-memory.spec.ts                           |  54 ++-
 src/app/home/you/memory/memory.module.css          |   5 +-
 src/components/memory/memory-manager.test.tsx      | 185 ++++++++
 src/components/memory/memory-manager.tsx           | 199 +++++++-
 13 files changed, 1148 insertions(+), 12 deletions(-)
```

`.github/workflows/ci.yml` in that range is the lead's `deabe75`, not the
builder's. The five changed screenshots are the same flow re-captured against
the corrected build. Later versions of this record are added in a further
commit, because a record cannot contain the SHA of the commit that adds it.

The second correction,
`git diff --stat 6ac57c2741f43ec32cc9b5f9a959c01a70b59df6..3fc223732214732067d76618a6e6bd29c47abdc9`:

```
 docs/decisions/ADR-010-M2-MEMORY-WRITE-BOUNDARY.md |  21 +-
 docs/validation/M2/M2-02-VALIDATION.md             | 239 +++++++++++++++++----
 .../M2/evidence/M2-02-delete-390x844.png           | Bin 161668 -> 148774 bytes
 .../validation/M2/evidence/M2-02-empty-390x844.png | Bin 34722 -> 34752 bytes
 .../validation/M2/evidence/M2-02-filed-390x844.png | Bin 123183 -> 128980 bytes
 .../validation/M2/evidence/M2-02-final-390x844.png | Bin 123896 -> 123564 bytes
 src/components/memory/memory-manager.test.tsx      | 103 +++++++++
 src/components/memory/memory-manager.tsx           |  13 +-
 supabase/tests/database/m2_02_memory.test.sql      |  33 ++-
 9 files changed, 361 insertions(+), 48 deletions(-)
```

Three product files changed there: the create-form key in
`memory-manager.tsx`, the two lock guards in `m2_02_memory.test.sql`, and the
tests covering the draft. The rest is documentation and re-captured
screenshots.

The keyboard-coverage round,
`git diff --stat 39315b9f213f929184c4dcf98bf337e15bfe5532..e5dab52`:

```
 docs/decisions/ADR-010-M2-MEMORY-WRITE-BOUNDARY.md |  38 +++--
 docs/validation/M2/M2-02-VALIDATION.md             | 179 ++++++++++++++++-----
 e2e/m2-02-memory.spec.ts                           |  13 +-
 3 files changed, 172 insertions(+), 58 deletions(-)
```

One product-facing change: the deletion step in `e2e/m2-02-memory.spec.ts` is
now driven by keyboard. The ADR and record changes in that range are the
overturned-decision documentation committed alongside it.

The overturned-decision round,
`git diff --stat 3fc223732214732067d76618a6e6bd29c47abdc9..39315b9f213f929184c4dcf98bf337e15bfe5532`:

```
 docs/validation/M2/M2-02-VALIDATION.md             | 142 +++++++++++++-
 .../M2/evidence/M2-02-delete-390x844.png           | Bin 148774 -> 131605 bytes
 .../validation/M2/evidence/M2-02-empty-390x844.png | Bin 34752 -> 34794 bytes
 .../validation/M2/evidence/M2-02-filed-390x844.png | Bin 128980 -> 122864 bytes
 .../validation/M2/evidence/M2-02-final-390x844.png | Bin 123564 -> 101206 bytes
 .../M2/evidence/M2-02-review-queue-390x844.png     | Bin 132170 -> 0 bytes
 .../M2/evidence/M2-02-stale-conflict-390x844.png   | Bin 119568 -> 100262 bytes
 e2e/m2-02-memory.spec.ts                           |  67 ++-----
 src/components/memory/memory-manager.test.tsx      |  31 ++-
 src/components/memory/memory-manager.tsx           |   4 +-
 .../20260801085404_m2_02_memory_model.sql          |  15 +-
 supabase/tests/database/m2_02_memory.test.sql      | 214 ++++++++++++++-------
 12 files changed, 329 insertions(+), 144 deletions(-)
```

`M2-02-review-queue-390x844.png` is **deleted**: it shows a screen no user can
reach, and keeping it as evidence would misrepresent the product. The other
screenshots are the same flow re-captured. The migration change is one branch
of the create path; see *The overturned decision* for why it was amended in
place.

Files in the first correction whose purpose is not evident from the path and
diff:

- `src/components/memory/memory-manager.tsx` — adds the M2-05 recovery hooks
  (`useMutationStall`, `useRecoveredReload`) and the honest notices they
  drive. The block comment above them records the measurement that justifies
  them.
- `e2e/m2-02-memory.spec.ts` — adds `settled(page)`, awaited before every
  mutating step, because the surface can now legitimately reload itself
  mid-flow. It waits for a real state; it relaxes nothing.

Nothing was deleted or renamed.

Files whose purpose is not evident from the path and diff:

- `src/server/memory/memory-records.ts` — the domain contract shared by the
  repository and the server action: the four classes, statuses, provenances,
  the 1000-character content bound, the input parsers, and
  `selectActiveMemoryContext`, which is the **only** function a later approved
  coaching ticket may use to read memory. It excludes proposed, declined,
  disabled, and review-due items. It carries no `server-only` import so the
  page can share its types, and it imports nothing from a repository.
- `src/server/memory/memory-privacy.test.ts` — the test the brief requires:
  memory content must never reach a log, an analytics payload, an error
  message, a snapshot, or a fixture. It statically asserts that no memory
  module routes through `console`, and behaviourally drives every failure path
  with a health-adjacent sentinel, asserting nothing was logged and the
  sentinel appears nowhere in the response except the owner's own preserved
  draft. Falsifiability was checked by temporarily adding a `console.log` to a
  memory module; the test failed, and the probe was removed.
- `src/app/home/you/memory/action-state.ts` — the serializable action result.
  Its `draft` field is the one place the owner's text travels back, so a
  rejected save does not throw their words away; it is returned only to that
  owner's own response.
- `src/architecture/server-boundary.test.ts` — updated deliberately, not
  incidentally. `apply_memory_change` is the fourth `.retry(false)` call site;
  an automatic retry would re-run a change the user was told to review.
- `src/app/home/you/page.tsx` — adds the Memory entry point, and corrects the
  intro line that claimed coaching context would appear "only after its own
  ticket is accepted", which this ticket makes false.
- `src/lib/supabase/database.types.ts` — regenerated. See the divergence noted
  under *Data, migration, API, privacy, and security effects*.

## The red continuous-integration run

Run **30728162026**, against the lead's `deabe75`, failed two jobs. The
database job passed in full. Both failures were real and neither was a flake
to be re-run away.

**Prettier.** `e2e/m2-02-memory.spec.ts` was genuinely unformatted — the one
file this ticket added that had not been through `prettier --write` before
committing. Fixed by formatting that single file, 22 insertions and 6
deletions. `format` was not run across the repository.

**The 390px memory flow.** The step failed waiting for a card that had just
been saved. The trace, not the plain log, settles what happened:

- The server action for that mutation started at `02:09:02.182` and completed
  in **33.485 ms** (`wait` 20.97 ms, `receive` 12.5 ms) with HTTP 200.
- Its body is complete and correct. It contains
  `1:{"status":"saved","message":"Memory saved.","submission":4,...}` and the
  re-rendered page props including the new item with `"status":"proposed"` and
  the expected content. No error, no digest.
- The page snapshot at the moment of failure shows the surface still reading
  "Saving memory change…", every control disabled, and `Collection 3` — the
  state from *before* that save.

So the mutation succeeded, its reply reached the browser in 33 ms, and the
App Router transition carrying it never committed. **This is not slowness, and
raising the timeout would not have helped** — there was nothing left to wait
for.

This is the defect M2-05 documented for the goal surface, reproduced on the
memory surface, which had no protection against it. It is a real defect in
this ticket's deliverable, not a test artifact.

**Reproduced locally before changing anything.** Twelve mutations per run,
six runs: **one run failed**, at a *different* mutation than CI (edit-and-
accept rather than create), with the identical signature — frozen on "Saving
memory change…", stale content, controls disabled. The earlier single local
pass reported in this record was luck, not leftover state. Roughly a 1.5%
per-mutation failure rate, which is why one flow of a dozen mutations fails
about one run in six.

**Fix.** The memory surface now uses the recovery M2-05 established and the
product owner accepted: watch the mutation from outside React, and when a
reply arrived that never rendered, say so and reload to show what is actually
saved; when no reply arrived at all, report the change as unconfirmed and
offer a reload. Neither path claims the change was applied, because the action
answers 200 for every outcome. The timing rules in
`src/features/goals/mutation-watchdog.ts` are not goal-specific, so they are
imported rather than duplicated; the module name is now too narrow, and
renaming it would touch M2-05's accepted code, so that is left to a follow-up.

**The spec was also wrong.** After the fix, one run in ten still failed — but
for a different reason, and the snapshot proves the product was correct: the
recovery notice was displayed and the saved item was on the page. The spec was
driving the next mutation while the surface was reloading itself, so the typed
input was lost with the replaced document. Since that reload is real product
behaviour, every mutating step now waits for the status region to leave its
in-flight states first. **No assertion was relaxed and no timeout was raised.**

**Measured result:** 1 failure in 6 runs before the fix; **24 consecutive
passes** after it (two batches of `--repeat-each=12`, `--workers=1`, against
`build` + `start` on port 3016).

## The first independent review

The reviewer read `6178d8e` against green CI run 30748008542, reconciled the
manifest exactly, and found no authorization, ownership, deletion,
provenance, locking, or privacy defect in the code. Three corrections were
required; all are in `3fc223732214732067d76618a6e6bd29c47abdc9`.

**1. This record made a privacy claim the code contradicted.** It said the
browser stored nothing. That was true of `460ee18` and stopped being true at
`6ac57c2`, which added the `sessionStorage` recovery marker. On a Tier 1
health-adjacent record the privacy section has to be exactly right, so it now
carries the full disclosure — key, value, purpose, and when it is cleared —
under *What the browser stores*, and the
`client-localstorage-schema` entry says the rule applies rather than that it
does not. Reviewer checklist item 10 was also wrong: four changes sit outside
the memory slice, not one, and it now names all four.

**2. Two bounded-lock pgTAP guards passed when the property was absent.**
They searched the function definition for the strings `lock_timeout` and
`lock_not_available`. A function setting `lock_timeout` to `'0'` — which
disables the timeout outright and restores exactly the unbounded wait this
ticket existed to avoid — contains that string and passed. So did `'30min'`.
The guard now extracts the configured value and asserts it is a non-zero
interval of at most ten seconds, and the second asserts `lock_not_available`
is *mapped* to `PT409` rather than merely mentioned. Verified against
synthetic definitions before adoption:

| Configured value | Old guard | New guard |
| --- | --- | --- |
| `'3s'` (actual) | pass | **pass** |
| `'0'` (timeout disabled) | pass | **fail** |
| `'30min'` | pass | **fail** |
| setting absent entirely | fail | **fail** |

The runtime behaviour was already correct — the reviewer confirmed the code
path and the two-session `psql` probe independently. Only the guard changed.

**3. An unsaved Add-memory draft was destroyed by any unrelated action.** The
create form was keyed on the shared submission counter, which
`changeMemoryAction` increments on every completed action from every card. Open
**Add memory**, type four hundred characters, click **Disable** on a card
lower down, and the form remounted empty with no warning. The create form is
now keyed stickily rather than by a derived expression, because a plain
expression would flip back on the next unrelated action and lose the draft just
the same. Three tests cover it, and the first fails without the fix. This is
M2-07 finding 4, fixed here rather than added a second time to that backlog.

An earlier version of this paragraph claimed the per-card edit forms "already
guarded against this". The second independent review, on 2 August 2026, showed
that is not true in one case, and it is corrected here rather than left
standing. The card editor key is
`` `${editOperation}-${item.id}-${draft ? actionState.submission : 0}` ``
(`src/components/memory/memory-manager.tsx:427-429`), which is correct in the
common case but flips back after a **rejected** edit on that same card: a
conflict preserves the draft and moves the key to `edit-A-1`, the user retypes
without submitting, an unrelated action on card B resolves card A's `draft` to
`undefined`, the key returns to `edit-A-0`, and the retyped text is lost. That
is the identical flip-back the sticky create key exists to prevent, surviving in
the card editors because only the create key was made sticky.

The behavior is unchanged by this correction and is present identically in
`460ee18`, `6ac57c2`, and `3fc2237`, so it is pre-existing rather than
introduced. It costs unsaved input only, with no data, authorization, or
privacy consequence, and it requires a rejected edit followed by a retype
followed by an unrelated action. The fix is the same sticky-key pattern and is
routed to [M2-10](../../backlog/M2/M2-10-FOCUS-LOST-AFTER-MUTATION.md) alongside
the focus-restoration work on both surfaces. The *Delivered behavior* claim
about **Add memory** drafts is correctly scoped and remains true as written.

**ADR-010 wording.** The status line framed the whole ADR as approved in
principle, which laundered decision 7 — an `observed_pattern` always starting
`proposed` — as pre-approved. It is the builder's own product judgement, taken
because nothing else in M2-02 can produce a proposal. The header now separates
what the product owner approved from what awaits explicit ratification. The
behaviour is unchanged, and both the reviewer and the lead recommend the owner
accept it.

**Routed elsewhere by the lead, deliberately not fixed here:** stale
`confidence` shown beside text rewritten by edit-and-accept (unreachable until
M2-03 produces confidence values) goes to M2-03; missing focus restoration
after a mutation needs one ticket covering this surface and the identically
shaped accepted goal surface, not a divergent fix here.

## The overturned decision

ADR-010 decision 7 made an `observed_pattern` start `proposed` whoever created
it. That was the builder's own product judgement, flagged as such and put to
the product owner for ratification. **On 2 August 2026 they overturned it**: an
observed pattern the owner writes is their own statement like any other, so it
becomes active on save — consistency across the four classes, and one less tap.
They made the call knowing it costs the review-queue demonstration.

**What changed.** One branch of the create path in
`20260801085404_m2_02_memory_model.sql`, the assertions that pinned the old
rule, the create form's option text, and the browser flow's review-queue steps.

**What did not change, and was never in question.** Content FitTip derives
still starts `proposed`. `inferred_proposed` provenance and
`author_class = 'system'` remain unforgeable: neither is a caller input, both
are fixed inside the function, and direct writes to `memory_items` and
`memory_revisions` are revoked from every role the application can reach.
pgTAP asserts all of that, and now also asserts that **no authenticated create
produces a proposal at all** — the invariant the owner's decision has to
preserve.

**The migration was amended in place rather than corrected forward.** Directed
by the lead, and the reasoning holds: this migration has never been applied to
any persistent database — only local resets and CI's disposable stacks — and
the branch is unmerged, so there is no applied history for the immutability
rule to protect. Shipping a table that forces a rule plus a second migration
immediately undoing it would be worse history than one correct migration. A
full `db reset --local` confirms it applies cleanly from zero.

**The cost, stated plainly.** The review queue is now unreachable from any user
path, so its accept, edit-and-accept and reject actions have no browser
coverage. See limitation 2. The alternative — inventing an app path that
creates proposals so the flow stayed green — was rejected outright, because it
would let a user manufacture content that reads as system-inferred.

**A second cost, which the first version of this section failed to disclose.**
The deleted decline block held the surface's **only** keyboard assertion, so
removing it left nothing anywhere proving the memory surface is operable
without a pointer — a ticket requirement at 390px. The builder did not notice;
the second independent review did, by grepping the spec and the component
tests for `keyboard`, `toBeFocused`, `toHaveFocus` and `focus()` and finding
zero hits in both. Restored in `e5dab52` by driving **permanent deletion**
entirely by keyboard, which is a stricter case than the one lost: the same
`details`/`summary` confirmation, on the most destructive action on the
surface, with focus asserted at each step. Confirmed load-bearing — replacing
the opening Enter with ArrowDown fails the run.

## Data, migration, API, privacy, and security effects

**Migration** `supabase/migrations/20260801085404_m2_02_memory_model.sql`,
created with `npx.cmd supabase migration new m2_02_memory_model` and applied
forward-only. No applied migration was edited. No remote or hosted command was
run: no `supabase link`, no `db push`.

**Record and history model.**

| Table | Holds | Text? |
| --- | --- | --- |
| `memory_collections` | one monotonic revision per owner | no |
| `memory_items` | identity, class, status, provenance, confidence, source reference, review date, current revision pointer, confirmation and status timestamps | **no** |
| `memory_revisions` | append-only versions: content, author class, provenance, change kind, resulting status, previous revision | yes — the only place |
| `memory_deletion_events` | owner, deleted item id, class, purged version count, collection revision, timestamp | **no** |

Every copy of the owner's text lives in `memory_revisions`, so permanent
deletion is one `delete` over that item's versions plus the item, in the same
transaction as the content-free evidence row.

**Privilege and policy matrix.** Identical for all four tables:

| Role | SELECT | INSERT | UPDATE | DELETE | EXECUTE `apply_memory_change` |
| --- | --- | --- | --- | --- | --- |
| `anon` | denied | denied | denied | denied | denied |
| `authenticated` | granted | denied | denied | denied | granted |
| `PUBLIC` | denied | denied | denied | denied | denied |
| `service_role` | not granted by this migration | — | — | — | denied |

RLS is enabled on all four tables. Each carries exactly one policy — `SELECT`,
`PERMISSIVE`, role `authenticated`, `using ((select auth.uid()) = user_id)`,
no `WITH CHECK`. pgTAP asserts each policy by name, command, permissiveness,
target roles, and **exact predicate string**, plus an exact total policy count
of four across the four tables, so a later `using (true)` cannot leave the
suite green.

**RPC.** One new function, `public.apply_memory_change(bigint, text, uuid,
text, text, date)`. `SECURITY DEFINER`, `set search_path = ''`, owned by
`postgres`, no dynamic SQL. It derives the owner from `auth.uid()` and
requires a matching profile; no caller supplies an owner, provenance, author
class, status, confidence, or revision id. Operations: `create`, `edit`,
`accept`, `edit_and_accept`, `reject`, `disable`, `enable`, `renew`, `delete`.
Every operation declares exactly which inputs it accepts and rejects the rest
with `22023`. The returned receipt is `(item_id, collection_revision,
revision_number, result)` and **carries no memory content**.

**Bounded lock wait.** The function sets `lock_timeout` to `3s` locally before
taking its per-owner advisory lock, and maps `lock_not_available` to the
`PT409` conflict. This is the correction to ADR-009's unbounded
`pg_advisory_xact_lock`, which M2-01's review found could leave a second
same-owner save hanging with no answer. Verified empirically with two `psql`
sessions against the applied migration: session A held the lock inside
`apply_memory_change`; session B's call aborted after **3 seconds** with
`ERROR: PT409: Memory changed. Reload and try again.` The full command and
output are under *Tests and final results*.

**Stale-write guard.** Every mutation requires the expected collection
revision and rejects a mismatch with `PT409`, which the repository maps to an
explicit conflict with `.retry(false)`.

**Cross-owner references.** `memory_revisions.item_id` and
`memory_revisions.previous_revision_id` and `memory_items.current_revision_id`
are all composite `(id, user_id)` foreign keys, so a revision can never point
at another owner's item or predecessor. Two are deferred only so one
transaction can write a first version together with its item, and purge
versions ahead of their item.

**Provenance.** Direct writes to `memory_revisions` are revoked, so a user
cannot author a revision claiming `system` provenance. Accepting a proposal
keeps the item's origin provenance and the accepted version's own provenance,
and records the confirmation separately in `user_confirmed_at`.

**Privacy.** Memory content never reaches a log, analytics payload, monitoring
call, error message, or receipt. A database error message is never forwarded;
the repository raises its own generic failure. No memory module calls
`console`.

**What the browser stores.** No `localStorage`, and no cookie beyond the
existing Supabase session. The correction commit added exactly one
`sessionStorage` entry, and this is the whole of it:

| Key | Value | Purpose | Cleared |
| --- | --- | --- | --- |
| `fittip.memory.recovered:v1` | the literal string `"1"` | records that the surface reloaded *itself* to recover a mutation whose result never rendered, so the reloaded page can explain the reload instead of flashing unexplained | on the next mutation, and by the browser when the tab session ends |

It holds no memory content, no item id, no user id, no timestamp, and no
status — only the fact that a self-triggered reload happened. It is
session-scoped, never sent to the server, and versioned in its key so a later
shape change cannot be misread. Reads and writes are wrapped in `try`/`catch`,
so private browsing or disabled storage costs the explanation and never the
recovery. This mirrors `fittip.goals.recovered:v1` on the accepted goal
surface.

An earlier version of this record said the browser stored nothing. That was
true of `460ee18` and became false at `6ac57c2`; the table above is the
correction.

**Generated types.** `src/lib/supabase/database.types.ts` was regenerated with
`npx.cmd supabase gen types --local --lang typescript` from a clean reset,
then Prettier-formatted, per `README.md`. It was **not** hand-edited to add
anything.

One disclosure. A clean regeneration with the pinned CLI (`supabase@2.109.1`)
also changes nine unrelated lines in the `save_training_completion` argument
type, dropping `| null` from nine optional parameters — which breaks
`npm.cmd run typecheck` in `src/server/repositories/completion-repository.ts`.
**This is pre-existing on unchanged `master` and is not caused by M2-02.** It
was proved by removing this ticket's migration and pgTAP file, resetting the
database, and regenerating: the same nine-line delta appeared. To keep the
branch's typecheck honest without silently changing M1-03 behaviour, those
nine lines were kept at their committed values and everything else in the file
is the generator's output. The resulting diff is **214 insertions, 0
deletions** — purely the new memory tables, the new function, and the new
composite type. The underlying divergence should be ticketed separately; it is
not M2-02's to fix.

**No secret, service client, trigger, view, second RPC, elevated worker,
external service, AI provider call, or paid resource was added.** No package
was added or changed.

## Tests and final results

The continuous-integration run for
`460ee184cb60c28d41f64481515c0bb8f459249a` is the automated-test evidence and
is **not yet recorded** — the lead pushes the branch and records the run URL
and conclusion. Everything below is what the builder actually observed
locally while developing, reported as such.

| Command or check | Result |
| --- | --- |
| `npx.cmd supabase db reset --local` | All 8 migrations applied from zero |
| `npx.cmd supabase test db --local supabase/tests/database` | `All tests successful. Files=6, Tests=365` — the new `m2_02_memory.test.sql` contributes 93 assertions |
| `npx.cmd supabase db lint --local --level warning --fail-on warning` | `No schema errors found` |
| `npx.cmd supabase db advisors --local --type all --level warn --fail-on warn` | `No issues found` |
| `npm.cmd run lint` | clean, 0 problems |
| `npm.cmd run typecheck` | clean |
| `npm.cmd run test:run` | `Test Files 45 passed (45)`, `Tests 329 passed (329)` after the overturned-decision change; 328 after the review corrections, 321 at the initial commit |
| `npm.cmd run build` | succeeded; `/home/you/memory` listed as server-rendered on demand |
| `npx.cmd playwright test --config=e2e/m2-02.playwright.config.ts --workers=1 --repeat-each=12` against `npm.cmd run start -- -p 3016`, run twice | **24 passed, 0 failed, 0 skipped** — the service-role key was supplied, so the spec did not skip itself |
| The same flow before the correction, `--repeat-each=6` | **1 failed, 5 passed** — the defect CI caught, reproduced locally |
| The flow again after the review corrections, `--repeat-each=8` | **8 passed, 0 failed** |
| The reduced flow after the overturned decision, `--repeat-each=8` | **8 passed, 0 failed** |
| The flow with the keyboard deletion path, `--repeat-each=8` | **8 passed, 0 failed** |
| Falsifiability probe: opening Enter replaced with ArrowDown | **run fails**, so the keyboard assertions are load-bearing |
| `npx.cmd supabase db reset --local` on the amended migration | all 8 migrations applied from zero |
| New lock guards evaluated against synthetic definitions in `psql` | `'3s'` passes; `'0'`, `'30min'` and an absent setting all fail |
| `git diff --check` | clean |
| Two-session bounded-lock probe (below) | contender aborted after 3s with `PT409` |

The single `1 passed (12.0s)` run reported here before the correction was
honest but insufficient: one pass cannot distinguish a working surface from a
one-in-six flake. Repeat runs are what established both the defect and the
fix.

The lock probe, run through `docker exec … psql` against the applied
migration, one session holding and one contending:

```
ERROR:  PT409: Memory changed. Reload and try again.
CONTEXT:  PL/pgSQL function public.apply_memory_change(...) line 57 at RAISE
contender elapsed: 3s
```

`npm.cmd run format:check` was **not** run as a pass/fail gate: it fails on a
clean checkout here for line-ending reasons documented in `CLAUDE.md`. Instead
`npx.cmd prettier --write` was run over every file this ticket adds or
changes, and CI's Prettier step on a Linux checkout is the real gate.

**pgTAP coverage.** The new suite asserts, behaviourally where behaviour is
what matters: table and function existence; `SECURITY DEFINER` with an empty
search path and the expected owner; absence of dynamic SQL; that the
configured `lock_timeout` is a non-zero interval of at most ten seconds and
that `lock_not_available` is mapped to `PT409`; a required owner column on all
four tables; owner-scoped composite foreign keys; that deletion evidence has
exactly seven columns and no content column; that no memory table other than
`memory_revisions` carries a text content column; the seven ownership and
ordering indexes; RLS enabled on all four tables; the four policies by exact
predicate and exact count; the full privilege matrix; and then, as the owner —
create, edit appending a version with the prior text still readable, the
current pointer moving, disable, enable, that a user-written observed pattern
is active and confirmed like any other class, that **no authenticated create
produces a proposal at all**, that an active item cannot be accepted again,
and — against **directly seeded `inferred_proposed`, `author_class = 'system'`
items**, which is the only legitimate way to reach them — accept preserving
the provenance of the text it carries, edit-and-accept preserving the item's
`inferred_proposed` origin and confidence while recording user confirmation,
reject, a declined proposal refusing to be enabled, a passed review date
leaving status and text alone,
renew, a stale change returning `PT409` without advancing the collection,
invalid content and an unapproved class rejected before persistence, and a
permanent delete purging both versions of a two-version item, removing the
item, and leaving exactly one content-free evidence row. Cross-owner and
anonymous denial is proved with **unfiltered** owner-scoped counts, never with
a `where user_id = …` that would mask a broken predicate, following
`m0_02_authorization.test.sql` rather than the M2-01 files.

**Project skills applied.**

`vercel-react-best-practices` — rules checked and how:

- `server-auth-actions` — the server action authenticates through the
  repository on every call; `requireAllowedVerifiedUser` runs before the RPC
  and before every read, and the form supplies no owner.
- `async-parallel` — `MemoryRepository.list` issues its three owner-scoped
  reads with `Promise.all` rather than in a waterfall.
- `server-serialization` — the page passes only the fields the client renders;
  no raw database row, no repository, and no `Database` type crosses the
  boundary.
- `bundle-barrel-imports` / `bundle-analyzable-paths` — every import is a
  direct, statically analyzable module path. No barrel file was added.
- `rerender-no-inline-components` — every subcomponent is defined at module
  scope.
- `rerender-derived-state-no-effect` — the card state, grouping, counts, and
  filtering are all derived during render. The correction commit adds the two
  effects the M2-05 recovery needs — a `PerformanceObserver` subscription and
  the in-flight watch — and nothing else. No derived value moved into an
  effect. (An earlier version of this record claimed the component had no
  `useEffect`; that was true only before the correction.)
- `rerender-dependencies` — the watch effect depends on a primitive key
  (`` `${submission}:${pending}` ``), so a later mutation cannot inherit an
  earlier verdict and no effect has to reset state.
- `rendering-conditional-render` — ternaries throughout, never `&&`.
- `js-set-map-lookups` — version history is grouped by item id with a `Map`
  rather than a repeated scan.
- `client-localstorage-schema` — applies to the one entry the surface writes,
  `fittip.memory.recovered:v1`. Versioned in the key, minimal by design (the
  literal `"1"`, carrying no memory content or identifier), `sessionStorage`
  rather than `localStorage` so it dies with the tab, cleared on the next
  mutation, and read and written inside `try`/`catch`. See *What the browser
  stores*. (An earlier version of this record called the rule not applicable;
  that was true only before the correction commit.)

`frontend-design` — the treatment applied. Memory is filed rather than
ledgered: each remembered statement is its own index card with a status-
coloured spine and, as the single signature element, a rotated ruled
**stamp** naming exactly what FitTip may do with it — Active, Proposed · needs
your review, Review due, Disabled, Declined. Because a memory has no title,
the remembered sentence itself is the display element, set larger in the body
serif; everything around it stays quiet in the existing Courier utility face,
so no new typeface competes with the rest of the product. The palette extends
the existing ledger tokens along one new axis — deep green for stated, ochre
for proposed, rust for review due, grey-green for disabled, aubergine for
declined — deliberately avoiding the goals surface's terracotta so a proposal
does not read as an error. Structure encodes content: sections are the real
statuses, and filter buttons carry their own counts and their own explanatory
lines so narrowing never hides meaning. Copy is active-voice and specific, an
action keeps its name through the flow, and the empty state invites action
without claiming the coach has learned anything. Motion is one reduced-motion-
guarded card entry, matching the existing surfaces. Touch targets are at least
2.75rem, focus is visibly outlined, and the flow asserts no horizontal
overflow at 390px.

## Known limitations

1. **Review-due uses the UTC date, not the owner's local date.** The page
   computes today with `utcIsoDate()` server-side, so near midnight an item
   can read review-due up to a day early or late relative to the owner. This
   was chosen over a browser-supplied date to keep the selector deterministic
   and avoid a hydration mismatch. An owner timezone belongs to a later
   ticket.
2. **The review queue has no browser coverage, and will not until M2-03.**
   `intake_confirmed` and `inferred_proposed` provenance, `confidence`, and
   `source_reference` have no producer in M2-02, because it adds no AI and no
   onboarding. After the product owner overturned decision 7, no user path
   reaches a proposal either. So **accept, edit-and-accept and reject are
   proven at the database level and in component tests, but not in any 390px
   browser flow.** pgTAP seeds `inferred_proposed`, `author_class = 'system'`
   items directly and exercises all three against them, which is legitimate
   because it is the shape M2-03 will produce — but it is not the same as
   driving the real surface. Manufacturing a user path to a proposal purely to
   keep the flow green was rejected: it would let a user create content that
   reads as system-inferred, which this ticket forbids outright. The gap
   closes when M2-03 produces real proposals. Note that keyboard operation is
   **not** part of this gap: the deleted block had carried the surface's only
   keyboard assertion, and `e5dab52` restored it on permanent deletion, which
   uses the identical `details`/`summary` confirmation. What is missing is the
   review actions themselves, not the interaction pattern they share with the
   rest of the surface.
3. **`memory_type` is immutable after creation.** The owner deletes and
   re-files instead. This was originally justified by the forced-`proposed`
   rule, which no longer exists; it stands now only because no approved
   requirement asks for reclassification, and adding one would need its own
   ticket.
4. **`rejected` is terminal apart from permanent deletion.** A declined
   proposal cannot be accepted or enabled later, which is what "must not
   reappear as fact" requires; re-filing it as a new statement is the path.
5. **A status-only change copies the item's current text into its new
   version.** That is how the current pointer stays a complete snapshot.
   Every copy is owner-scoped and purged together on permanent delete.
   ADR-010 records the alternative that was rejected.
6. **Resolved.** `e2e/m2-02-memory.spec.ts` now runs in CI, on port 3016, via
   the lead's `deabe75`. It was the builder's report of this gap that led to
   the run which caught the recovery defect.
7. **The recovery is a mitigation, not a root-cause fix.** The App Router
   transition that loses a mutation result is not understood, on this surface
   or on goals; M2-05 reached the same conclusion. The surface now detects the
   loss and tells the truth, and a reload settles the outcome — but a user
   still sees a reload they did not ask for, roughly once in every sixty-odd
   mutations at the rate measured here. The underlying race deserves its own
   investigation.
8. **No automated concurrency harness.** M1-01 and M2-01 have
   `supabase/tests/integration/*.mjs` harnesses wired into CI as npm scripts.
   The bounded lock wait here was proved manually with two `psql` sessions and
   asserted structurally in pgTAP; there is no automated multi-session test,
   and adding one would also need the `.github/**` step this builder could not
   write.
9. **A pre-existing generated-types divergence is carried, not fixed.** See
   the disclosure under *Data, migration, API, privacy, and security effects*.
   A clean regeneration on unchanged `master` breaks
   `completion-repository.ts`; nine unrelated lines were kept at their
   committed values. This needs its own ticket.
10. **Deletion evidence is retained indefinitely.** `memory_deletion_events`
   rows carry no content, but nothing prunes them. Retention belongs to the
   M0-04 privacy implementation.
11. **`docs/product/DATA-MODEL-OVERVIEW.md` still lists Memory as proposed.**
    That living planning view was left alone rather than edited outside this
    ticket's brief.
12. **External use stays gated.** This slice authorizes local and
    founder-hosted owner or synthetic data only. Sending memory content to an
    AI provider remains prohibited until the separate consent and privacy
    gates recorded in the ticket are approved, implemented, and accepted.

## Independent reviewer checklist

Review commit `e5dab52` on `ticket/m2-02-memory-model`, plus the follow-up
commit adding this record. The first round's three findings are addressed in
`3fc2237`; the product owner's reversal of ADR-010 decision 7 is in `75520c2`,
`1796965` and `39315b9`, which the second round approved. The only outstanding
change is `e5dab52`, restoring keyboard coverage on permanent deletion, so a
third round can reasonably scope itself to that commit and to confirming
nothing else regressed.

Read `git diff 79fdefbb76005264bbea9e1acbdc37f46289b0e4..e5dab52`
as the source of truth, and confirm the CI run is green for that SHA. Do not
re-run lint, typecheck, `test:run`, `build`, the database matrix, or the
browser flow — CI covers them, and CI now includes the 390px memory flow. Note
that `.github/workflows/ci.yml` inside that range is the lead's `deabe75`, not
the builder's.

Confirm the judgment CI cannot supply:

1. **The write boundary matches ADR-010.** `apply_memory_change` is the only
   write path; direct table privileges are `SELECT` only for
   `authenticated`; the owner comes from `auth.uid()` and never from a
   parameter; the search path is empty and every object is schema-qualified;
   there is no dynamic SQL; execute is denied to `PUBLIC`, `anon`, and
   `service_role`.
2. **Every lock wait is bounded.** Confirm `lock_timeout` is set before the
   advisory lock and that `lock_not_available` maps to `PT409` — and that no
   other statement in the function can wait unbounded. This is the specific
   defect M2-01 shipped.
3. **Provenance cannot be forged.** Check that no path lets a caller set
   `provenance`, `author_class`, `status`, `confidence`, or
   `source_reference`, and that accepting a proposal preserves origin while
   recording confirmation separately.
4. **Deletion is complete.** Check that `delete` purges every revision of the
   item, that the evidence row carries no text, and that no other table can
   retain the deleted content.
5. **The context selector is the only read a coaching ticket may use**, and
   that it excludes proposed, declined, disabled, and review-due items.
   Confirm nothing else in the diff exposes an "active memory" list.
6. **The pgTAP suite has no assertion that passes when the property is
   absent.** The two M2-01 defects to check for specifically: a guard that
   searches a function definition for something that cannot occur, and RLS
   assertions that check only that RLS is on. Confirm the policy predicates
   and exact counts are asserted, and that cross-user denial is proved without
   an own-owner `where` masking RLS.
7. **Honest states.** Empty, conflict, validation, session-expired, and
   persistence-failure copy says only what is known and offers a real next
   action; the empty state claims no learning.
8. **The safety notice is static and non-diagnostic**, appears only where
   memory is written, and nothing grades, scores, or infers severity.
9. **Memory content stays private.** Read `memory-privacy.test.ts` and judge
   whether it would actually fail; confirm the `draft` field is the only path
   the owner's text takes back to the browser and that it reaches only that
   owner.
10. **Scope.** Confirm no AI extraction, pattern detection, plan or coaching
    generation, provider call, raw-chat store, global activity catalog, remote
    mutation, trigger, view, second RPC, service client, secret, or paid
    resource was added. Four changes sit outside the memory slice, and these
    are all of them: `src/app/home/you/page.tsx` (the entry point and a now-
    false intro line), `src/architecture/server-boundary.test.ts` (the fourth
    `.retry(false)` site), `src/lib/supabase/database.types.ts` (regenerated),
    and a new import of `src/features/goals/mutation-watchdog.ts`, which is
    read but not modified. `.github/workflows/ci.yml` in the reviewed range is
    the lead's `deabe75`.
11. **The overturned decision is fully applied and nothing leaked.** Confirm a
    user-created `observed_pattern` is active, that no authenticated path can
    reach `proposed`, and — the invariant the reversal must not weaken — that
    `inferred_proposed` and `author_class = 'system'` are still impossible for
    a caller to set. Confirm the migration amendment is confined to the create
    branch, and satisfy yourself that amending in place rather than adding a
    forward migration was right here (never applied to a persistent database,
    branch unmerged).
12. **Keyboard operation is genuinely covered.** The surface lost its only
    keyboard assertion once and nobody noticed until a grep found it. Confirm
    `e2e/m2-02-memory.spec.ts` still drives permanent deletion by focus, Enter,
    Tab, Enter with the intermediate focus asserted, and that no future edit
    can quietly remove it again without the grep coming back empty.
13. **The recovery tells the truth and claims nothing.** Neither notice may
    say the change was saved — the action answers 200 for a success, a
    conflict, a validation failure, an expired session, and a persistence
    error alike. Confirm the lost-render path reloads and the unconfirmed path
    does not, that the session marker carries no memory content, and that
    `settled()` in the spec waits for a real state rather than masking a
    failure.
14. **Verify the generated-types disclosure yourself.** The claim that the
    nine `save_training_completion` lines diverge on unchanged `master` is
    checkable: remove this ticket's migration and pgTAP file, reset, and
    regenerate.
15. **Hosted verification** against the Vercel Preview for this exact commit,
    at `390x844`.

## Independent review outcome

Three review rounds against this branch, all by the same independent reviewer,
which built no part of this implementation.

| Round | Target | Verdict |
| --- | --- | --- |
| 1 | `6178d8e` | Correction required — one blocking finding (a false privacy claim in this record), plus the lock guards, the destroyed create draft, and the ADR framing |
| 2 | `3fc2237` | Approved — all findings resolved, one late finding (F6) recorded and routed |
| 3 | `39315b9`, then `e5dab52` | Approved — the overturned decision verified, then the restored keyboard coverage verified |

The reviewer independently re-derived the pgTAP collection-revision sequence by
hand rather than trusting the diff, confirmed the cross-owner ownership test is
pinned to user B's own current revision so it cannot pass on a stale-revision
check, verified `proposed` is unreachable from the authenticated write path
entirely after the reversal, and endorsed amending the migration in place after
checking the premise itself.

Findings routed out of this ticket rather than fixed here, all recorded on
`master` before acceptance: F3 stale confidence after edit-and-accept →
[M2-03](../../backlog/M2/M2-03-INTAKE-FACT-REVIEW.md) decision 9; F5 focus lost
after every mutation and F6 the card-editor draft lost after a rejected edit →
[M2-10](../../backlog/M2/M2-10-FOCUS-LOST-AFTER-MUTATION.md).

## Product-owner acceptance (2 August 2026)

Accepted against independently reviewed commit
`e5dab525c140fa290a61545cc59706ca0bb69758`, branch head
`9e93a5671cc3656c4709fe88234415b263ee5ee8`, and the Vercel Preview at
`https://fittip-pqu7p0k95-mattis-3657s-projects.vercel.app`.

Continuous-integration run `30759653021` is green on all three jobs for the
branch head. The head commit changes only this record and the re-captured
evidence, so the run covers the reviewed implementation unchanged.

The product owner made two product decisions during acceptance, both recorded
where the work is:

- **ADR-010 decision 7 overturned.** A user-created `observed_pattern` is
  `active` on save. The cost — no browser coverage of the review actions until
  M2-03 — was stated before the decision and accepted with it.
- **The three known limitations were accepted open**, each with a ticket:
  M2-09 for the unexplained App Router race, M2-10 for focus and the card-editor
  draft, and the review-action coverage gap recorded in limitation 2.

### Hosted database verification

The migration reached the founder-hosted project before acceptance, which is
what made the memory surface reachable on the Preview at all. The product owner
ran `supabase link` and `db push` personally; no agent executed a remote
command against the project.

`supabase migration list --linked` reports eight migrations with every local
timestamp matching its remote entry and no drift in either direction. The
eighth is `20260801085404` — this ticket's memory model.

`supabase db lint --linked --level warning` reported no schema errors in
`public` or `extensions`.

`supabase db advisors --linked --type performance --level warn` reported no
issues.

`supabase db advisors --linked --type security --level warn` reported exactly
five warnings, four of them pre-existing and previously classified:

- **`apply_memory_change` is executable by `authenticated` as a
  `SECURITY DEFINER` function.** This is the single new finding introduced by
  M2-02, and it is the intended and only approved memory write boundary under
  ADR-010. It is the same warning ADR-008 and ADR-009 already carry.
- `apply_goal_change` (ADR-009), `save_manual_plan_version` and
  `save_training_completion` (ADR-008) — unchanged from previous milestones.
- Leaked-password protection remains disabled, as accepted in M0-06A for the
  owner-only founder environment. It must be resolved through the external-use
  gates before friends, public registration, or commercial use.

**No advisor reported a disabled-RLS, exposed-table, or anonymous-access
finding for `memory_items`, `memory_revisions`, `memory_collections`, or
`memory_deletion_events`.** Those checks are `ERROR` level and were within the
requested threshold, so their absence is positive evidence that RLS held on all
four new tables after the hosted migration.

## Post-merge record

The accepted branch was merged to `master` on 2 August 2026, bringing the four
governance commits made on `master` during delivery into the branch first so the
merge itself introduced no surprise.

- Resulting `master` SHA: `cd00ac31dfc4b00bc0b7f9eb67270c0d85251303`, pushed to
  `origin/master` as `34e5026..cd00ac3`.
- `master` continuous-integration run `30763801088` is **green on all three
  jobs** for that SHA.
- Founder Vercel deployment for that SHA reached `READY`:
  `https://fittip-fnfabci6i-mattis-3657s-projects.vercel.app`.
- Founder alias: `https://fittip-gilt.vercel.app/`.

### Hosted smoke and security checks

Anonymous requests against the founder alias on 2 August 2026:

| Request | Result |
| --- | --- |
| `GET /` | `200` with `private, no-cache, no-store, max-age=0, must-revalidate` |
| `GET /home/you/memory` | `303` to `/` with `private, no-cache, no-store, must-revalidate, max-age=0` |
| `GET /home/you/goals` | `303` to `/`, unchanged by this ticket |

The new authenticated memory route is therefore unreachable anonymously on the
founder deployment and is not cached by the edge. HSTS is present on all three.

The hosted database verification recorded above ran **before** the merge,
because the migration had to reach the founder project for the product owner to
exercise the surface on the Preview at all. It is not repeated here; no schema
change occurred between that check and this deployment.

### A note for whoever corrects this migration next

`20260801085404_m2_02_memory_model.sql` was amended in place once, during the
ADR-010 reversal, when it had never been applied to any persistent database.
That reasoning expired the moment it was pushed to the founder project. It is
now applied history: every future correction to it is forward-only, and nobody
should reason by analogy from that amendment.
