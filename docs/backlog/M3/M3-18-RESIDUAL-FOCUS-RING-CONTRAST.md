# M3-18: Residual focus-ring contrast on preserved surfaces

**Status:** accepted — the product owner confirmed the Preview and accepted on
17 August 2026 against implementation `5f78071` and its green CI run. Dispatch
was approved the same day, ahead of M3-12, so the new Plan surface is built
against a compliant focus ring rather than swept afterwards.

**Triage:** ready

**Milestone:** M3

**Priority:** P2

**Tier:** 3 — confirmed by the product owner on 17 August 2026.
Presentation-only styling, no behavior, schema, or authorization change. The
lead implements directly; a green CI run plus the product owner's Preview
confirmation replaces the builder and reviewer split.

## Agent brief

**Outcome.** Raise every failing focus indicator to at least 3:1, applying
M3-11's `var(--ledger-ink)` decision to the surfaces M3-11 could not reach.

**Hard constraints:**

- Change the focus indicator only. No component, route, server, schema, or
  authorization change, and no other visual change on the affected routes.
- Fix all four cases, not the three module rules alone. The global
  `input:focus` rule is the worst and is live on every route with a text input.
- The global rule is not scoped to `.appShell`, so it cannot rely on the
  `--ledger-*` tokens. Use a token that resolves globally.
- Compute each resulting ratio against every surface the 2px offset exposes.
  Do not assert a ratio from a literal.
- Keep the indicator absent at rest and solid when focused, the serious-coach
  tone, the 390px path, and reduced-motion behavior intact.

**Non-goals:** no focus-visible/focus semantic change, no restyling beyond the
indicator, no cleanup of unrelated dead `.plan-shell` rules.

**Acceptance:** every changed ring computes at least 3:1; no other visual
change on the affected routes; green exact-commit CI; product-owner
confirmation at 390px on the Preview.

**Expected to change:** `src/app/globals.css`,
`src/app/home/you/goals/goals.module.css`,
`src/app/home/you/memory/memory.module.css`,
`src/app/home/you/onboarding/onboarding.module.css`, and this ticket's
validation record.

**Skills.** `frontend-design` was considered and judged not applicable: a
focus-indicator colour correction is not a material reshape of user-visible UI.

Read only this section unless you hit an ambiguity it does not resolve.

**Depends on:** M3-11 accepted and merged. This ticket only makes sense once the
M3-11 focus treatment is on `master`, because it applies that same decision to
the surfaces M3-11 could not reach.

**Blocks:** nothing.

**Source:** M3-11 independent review, finding NEW-2. Outside M3-11's approved
scope, so it was deliberately left alone rather than fixed opportunistically.

## Outcome

Three preserved, in-use surfaces still paint a focus ring that fails WCAG 2.2
SC 1.4.11 Non-text Contrast. M3-11 corrected the shared home-shell rule but
could not reach these, because each module defines its own focus rule and the
change would have been outside the approved destructive-reset scope.

## The defect

`#efaa84` against the `--ledger-paper` `#fffdf4` that the 2px outline offset
exposes measures **1.92:1**. SC 1.4.11 requires **3:1** for a focus indicator.
Verified independently during M3-11 review and again by the lead.

| File | Line | Surface |
| --- | --- | --- |
| `src/app/home/you/goals/goals.module.css` | 387 | Goals manager |
| `src/app/home/you/memory/memory.module.css` | 430 | Memory manager |
| `src/app/home/you/onboarding/onboarding.module.css` | 181 | Onboarding step form |

All three are live, owner-reachable surfaces, which is what makes this worth a
ticket rather than a note.

### A fourth case, and the worst one

`src/app/globals.css:94-95` gives **every** `input:focus` a `#f4cba0` outline
against the `#fff` input background set at `:90`. Measured: **1.51:1** — worse
than the three above, and live on every route with a text input, including the
goals, memory, and onboarding surfaces already listed.

This one was found during M3-11's round-two review and is the reason this ticket
must not be scoped from the three module rules alone. Fixing only those would
leave every input on the same routes focusing at 1.51:1 while the ticket read as
complete.

## Precedent to follow

M3-11 moved the shared `.shell a:focus-visible`, `.shell button:focus-visible`,
and `.card summary:focus-visible` rule in `src/app/home/home.module.css` from
`#efaa84` to `var(--ledger-ink)` (`#142f2a`), measuring **14.02:1** against the
same paper. Applying that token here keeps one focus treatment across the app
instead of two.

## Implementation notes for whoever drafts the brief

- The `--ledger-*` tokens are declared on `.appShell` in `home.module.css:1-8`,
  not at `:root`. These three modules render inside the home layout, so the
  custom properties inherit through the DOM and `var(--ledger-ink)` resolves.
  Confirm that in the browser rather than assuming it; a CSS-module class hash
  does not affect custom-property inheritance, but the DOM nesting does.
- `src/app/globals.css:212` also carries `#f4cba0`, targeting `.plan-shell`,
  which M3-11 leaves dead — decide whether to recolour or delete it. This is
  separate from the live `:94-95` input rule measured above.
- The `:94-95` rule is global, not scoped to `.appShell`, so a fix there has a
  wider blast radius than the three module rules and cannot rely on the
  `--ledger-*` tokens being in scope. Treat it as its own decision.
- `src/app/home/plan/proposal/proposal.module.css:110` also carried `#efaa84`,
  but M3-11 deletes that file. Do not reintroduce it.

## Scope boundaries

- Presentation only. No component, route, server, schema, or authorization
  change.
- Do not restyle anything beyond the focus indicator.
- Keep the serious-coach tone, the 390px mobile path, keyboard focus visibility,
  and reduced-motion behavior intact.

## Acceptance signals to write into the brief on approval

- Every changed ring measures at least 3:1 against the surface the offset
  exposes, computed rather than asserted from a literal.
- The indicator is absent at rest and solid when focused, on each of the three
  surfaces at 390px.
- No other visual change on those routes.
