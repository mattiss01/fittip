# M3-18: Residual focus-ring contrast on preserved surfaces

**Status:** proposed — not approved for implementation

**Triage:** needs-triage

**Milestone:** M3

**Priority:** P2

**Tier:** 3 proposed — presentation-only styling, no behavior, schema, or
authorization change. The product owner may raise it; accessibility conformance
is a product judgement, not the lead's.

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
- `src/app/globals.css` carries a second ring colour, `#f4cba0`, at lines 95 and
  212. Line 212 targets `.plan-shell`, which M3-11 leaves dead — decide whether
  to recolour or delete it. Line 95 is a separate, still-live case and needs its
  own contrast measurement; do not assume it shares the 1.92:1 figure.
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
