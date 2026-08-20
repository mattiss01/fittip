# M3-14B validation: recurring series surface

**Ticket:** [M3-14B](../../backlog/M3/M3-14B-RECURRING-SERIES-SURFACE.md)
**Status:** in development — corrected implementation has green CI and a
matching `READY` Preview; fresh independent code review and product-owner
acceptance are pending.
**Tier:** 2
**Branch:** `ticket/m3-14b-recurring-series-surface`
**Base:** `2e2c1be4cb44f9591a6d7e0219a7ded28de547e1`
**Implementation review target:**
`49ae94bb8330d78b5d71dd7125c5595eb8eb2d40`
**Review range:**
`git diff 2e2c1be4cb44f9591a6d7e0219a7ded28de547e1..49ae94bb8330d78b5d71dd7125c5595eb8eb2d40`

Key implementation commits:

| Commit | Purpose |
| --- | --- |
| `29c246965eb0c24278ab5acf8978bcdc34554d9d` | Initial owner-scoped recurrence surface and focused coverage. |
| `3da3fb02d70877ed8bf0ced93efcc85fddaca682` | Dedicated mobile flow and retained authoritative receipt. |
| `09d6e223c96058dc928d91ac5ebb619475c48c68` | Corrected saved-reuse materialization fixture. |
| `a87a7df617bf9703367b6dbcedae111e71bf10db` | Corrected feedback precedence and recovered-idle copy. |
| `243b3a0f950e59253c002438b5356ed6754712ef` | Replaced source shortcuts with the unified Plan create flow. |
| `235fdea2ab43d929ccb8ddd80626dff149edef22` | Corrected test-only TypeScript types. |
| `abb578d8fe34b5cd5c908ccc151009f693ec185d` | Corrected the M3-12 disclosure focus setup. |
| `cad217da994c94ffcc358506d29f3a1632460e81` | Corrected end receipts and timezone recovery; removed dead source modes and builder. |
| `49ae94bb8330d78b5d71dd7125c5595eb8eb2d40` | Anchored default weekly creation to the selected session date. |

## Acceptance criteria

1. The empty and populated Plan have one **Create session** action and no
   per-day create actions; recurrence off creates one ordinary session on the
   chosen date.
2. The same flow creates reviewed daily or weekly, bounded or open series and
   shows them correctly at `390x844`. A default weekly rule includes and follows
   the chosen session date until the owner customizes its weekdays.
3. A Plan card exposes only **Edit**, **Remove**, and its lock control. Other
   operations are inside the editor, and neither Plan nor saved-library cards
   expose recurrence shortcuts.
4. A recurring create names dates skipped by the ten-session cap.
5. **Only this session** changes one occurrence and leaves the rest unchanged.
6. **This and all future sessions** changes only the future and preserves
   earlier occurrences.
7. Future removal states every permanent consequence before action, preserves
   earlier, completed and locked records, and afterward reports the
   authoritative unchanged-removed, changed-removed and locked-kept counts.
   Unchanged removed is `deleted - divergedDeleted`, because changed removals
   are a subset of the transaction's deleted total.
8. Window top-up is action-only, announced accessibly, and has honest pending,
   recovery and skipped-date outcomes.
9. Empty, loading, invalid, stale, expired-session, missing-time-zone and
   offline states retain specific copy and recovery.
10. The pinned production Playwright flow at `390x844` covers ordinary and
    recurring creation plus only-this, this-and-future and end-series scopes.

## Changed files

Exact base-to-implementation stat:

```text
 .github/workflows/ci.yml                           |  10 +
 AGENTS.md                                          |   4 +-
 docs/backlog/M3/M3-14B-RECURRING-SERIES-SURFACE.md | 108 ++--
 docs/product/F-005-ROLLING-TRAINING-PLAN.md        |  17 +-
 docs/validation/M3/M3-14B-VALIDATION.md            | 503 ++++++++++++++++++
 docs/validation/M3/evidence/M3-14B-390x844.png     | Bin 0 -> 149931 bytes
 docs/validation/README.md                          |   6 +
 e2e/m3-12-plan.spec.ts                             |  53 +-
 e2e/m3-13-saved-sessions.spec.ts                   |   1 +
 e2e/m3-14b-recurring-series.spec.ts                | 476 +++++++++++++++++
 e2e/m3-14b.playwright.config.ts                    |  17 +
 src/app/home/plan/actions.test.ts                  |   5 +
 src/app/home/plan/actions.ts                       |  45 +-
 src/app/home/plan/create-session.tsx               | 284 ++++++++++
 src/app/home/plan/page.tsx                         |  42 +-
 src/app/home/plan/plan-manager.test.tsx            | 313 ++++++++++-
 src/app/home/plan/plan-manager.tsx                 | 571 +++++++++++++--------
 src/app/home/plan/plan.module.css                  | 383 ++++++++++++++
 src/app/home/plan/recurrence-fields.tsx            | 144 ++++++
 src/app/home/plan/recurring-session-controls.tsx   | 248 +++++++++
 src/app/home/plan/saved/actions.test.ts            |  12 +-
 src/app/home/plan/saved/actions.ts                 |  11 +-
 src/app/home/plan/saved/saved-library.test.tsx     |   1 +
 src/app/home/plan/saved/saved.module.css           |  18 +
 src/app/home/plan/series-action-state.ts           |  51 ++
 src/app/home/plan/series-actions.test.ts           | 363 +++++++++++++
 src/app/home/plan/series-actions.ts                | 479 +++++++++++++++++
 src/app/home/plan/series-materialization.ts        |  40 ++
 src/app/home/plan/series-materializer.test.tsx     |  84 +++
 src/app/home/plan/series-materializer.tsx          | 133 +++++
 src/app/home/plan/series-recurrence.test.ts        |  66 +++
 src/app/home/plan/series-recurrence.ts             | 119 +++++
 src/app/home/plan/series-transition-watch.ts       | 125 +++++
 src/app/home/plan/series/new/page.tsx              |   8 +
 src/app/home/plan/session-fields.tsx               |  67 +++
 .../repositories/rolling-plan-repository.test.ts   |  63 +++
 src/server/repositories/rolling-plan-repository.ts | 130 +++++
 .../rolling-plan/in-memory-rolling-plan-adapter.ts |  10 +
 src/server/rolling-plan/rolling-plan.ts            |  11 +
 src/server/saved-sessions/session-copy.ts          |  32 ++
 40 files changed, 4735 insertions(+), 318 deletions(-)
```

Reviewed-target-to-current-implementation correction stat:

```text
 AGENTS.md                                       |   4 +-
 docs/validation/M3/M3-14B-VALIDATION.md         | 144 ++++++++----
 docs/validation/README.md                       |  10 +-
 e2e/m3-14b-recurring-series.spec.ts             |  26 +--
 src/app/home/plan/create-session.tsx            |   1 -
 src/app/home/plan/plan-manager.test.tsx         |  18 +-
 src/app/home/plan/recurrence-fields.tsx         |  24 +-
 src/app/home/plan/series-action-state.ts        |   1 +
 src/app/home/plan/series-actions.test.ts        | 170 ++++++--------
 src/app/home/plan/series-actions.ts             |  48 ++--
 src/app/home/plan/series-materializer.test.tsx  |  40 +++-
 src/app/home/plan/series-materializer.tsx       |   9 +-
 src/app/home/plan/series/new/series-builder.tsx | 286 ------------------------
 13 files changed, 282 insertions(+), 499 deletions(-)
```

Purpose notes for non-obvious paths:

- `.github/workflows/ci.yml` pins the ticket flow in the existing browser job;
  it is unchanged by the current corrections.
- `AGENTS.md` assigns hosted UI verification to the product owner; reviewers
  do not perform browser runs.
- `series-transition-watch.ts` is the approved, deliberately separate fifth
  transition-recovery copy.
- `series/new/page.tsx` preserves the legacy URL only as a redirect to the
  unified Plan entry.
- `series/new/series-builder.tsx` was deleted after exact repository search
  found no import or live caller. Git can recover it; no file was renamed.

## Data, API, privacy and security effects

- No schema, migration, generated type, grant, RLS policy, privileged function,
  package, credential, external service, AI call or spend changed.
- The existing authenticated Server Actions and owner-scoped M3-14 operations
  remain the only recurrence mutation boundary. Browser storage is limited to
  the existing recovery flags.
- `add_series` now accepts only the unified flow's validated owner-entered
  session fields. The removed Plan and saved source modes had no live caller;
  ordinary M3-13 saved-session reuse is unchanged.
- The corrections add no shared request state, waterfall, client repository
  import or broad dependency. The weekly default is derived during render until
  the owner customizes it, avoiding effect-driven mirrored state.

## CI, Preview and evidence

Current implementation `49ae94bb8330d78b5d71dd7125c5595eb8eb2d40`
is covered by green [CI run
32399625879](https://github.com/mattiss01/fittip/actions/runs/32399625879)
on evidence-only head `ad71738bbe6ae40a7cb177be91506fb198fab79e`.
The evidence-commit exception applies because that head changes only this
record and its index over the implementation target. All three jobs passed,
including the complete automated gate and every pinned 390px browser flow.
The matching Vercel Preview is `READY` at
<https://fittip-899hity23-mattis-3657s-projects.vercel.app> (deployment
`dpl_EmDqNUFkjQwe9T15xmZAxPskFUog`).

Prior evidence is superseded but establishes the corrected baseline:

- [CI 32394248009](https://github.com/mattiss01/fittip/actions/runs/32394248009)
  was green on evidence head `b8fd4b4` over implementation `abb578d`; its
  matching Preview was
  <https://fittip-gf4t4grxo-mattis-3657s-projects.vercel.app>.
- The product owner personally completed and accepted the authenticated prior
  Preview check at `390x844`. Runtime commits `cad217d` and `49ae94b` invalidate
  that acceptance; the new exact Preview requires a fresh owner check.
- Superseded failures remain concise history: CI
  [32392022206](https://github.com/mattiss01/fittip/actions/runs/32392022206)
  found test-only TypeScript errors, and CI
  [32392705787](https://github.com/mattiss01/fittip/actions/runs/32392705787)
  found the stale M3-12 disclosure setup. Earlier rejected targets and full
  correction detail remain in Git history.

Focused builder results for the current corrections:

| Check | Result |
| --- | --- |
| Three focused Vitest files | PASS — 21 tests |
| Changed-file ESLint and Prettier | PASS |
| TypeScript | PASS |
| Next.js 16.2.11 production build | PASS |
| Pinned M3-14B Playwright against `build` + `start`, port 3022 | PASS — 1 test at `390x844`, 10.6 seconds total |
| `git diff --check` | PASS |

The production flow generated its normal screenshot and cleaned its disposable
owner. The screenshot was restored because the correction changes behavior,
not the accepted evidence asset. Port 3022 was released. CI still owns the
complete automated gate.

## Known limitations and remaining gates

- Activities remain fixture-backed and read-only; there is no activity editor
  or global library.
- Transition recovery retains its approved fifth local copy; consolidation is
  outside this ticket.
- Independent code review and fresh product-owner hosted acceptance are
  pending. The reviewer does not run a browser; the owner performs the manual
  hosted interaction and visual check.

## Independent reviewer focus

Review exact implementation `49ae94bb8330d78b5d71dd7125c5595eb8eb2d40`
against base `2e2c1be4cb44f9591a6d7e0219a7ded28de547e1` and reconcile
the 40-file manifest above. Confirm the fresh CI and matching `READY` Preview,
then judge:

- `end_series` reports unchanged removals as total deleted minus the changed
  subset while retaining the authoritative effect receipt;
- a default weekly create includes and follows the selected date without
  changing explicitly customized weekdays;
- missing-time-zone materialization remains specific through recovery races;
- Plan/saved `add_series` source modes and the unreachable builder are gone,
  while the legacy redirect and ordinary saved reuse remain;
- owner authentication, explicit ownership predicates, history preservation,
  bounded segments, consequence-before-action, server/client boundaries and
  honest recovery states remain intact.

The product owner, not the reviewer, performs the fresh authenticated
`390x844` Preview interaction and visual acceptance.
