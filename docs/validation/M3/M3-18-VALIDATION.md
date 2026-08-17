# M3-18 validation: residual focus-ring contrast

**Status:** accepted — the product owner confirmed the Preview and accepted on
17 August 2026 against implementation `5f78071`.

**Tier:** 3, confirmed by the product owner on 17 August 2026. The lead
implemented directly; a green CI run plus the product owner's Preview
confirmation replaces the builder and reviewer split.

**Commit:** `5f78071` on `ticket/m3-18-focus-ring-contrast`.

**CI:** green, all three jobs —
https://github.com/mattiss01/fittip/actions/runs/32028945004
(static 1m12s, database 4m2s, browser 5m5s).

**Preview:** `success` at
https://fittip-3pvssobkn-mattis-3657s-projects.vercel.app — tied to commit
`5f78071` through the GitHub deployments API, which reports the SHA directly
rather than by alias-and-timestamp inference.

## Manifest

```
 src/app/globals.css                               | 12 +-----------
 src/app/home/you/goals/goals.module.css           |  2 +-
 src/app/home/you/memory/memory.module.css         |  2 +-
 src/app/home/you/onboarding/onboarding.module.css |  2 +-
 4 files changed, 4 insertions(+), 14 deletions(-)
```

Nothing else changed. No component, route, server, schema, or authorization
change. No file deleted or renamed; no test added or changed, because CSS
custom-property values are not reachable from the Vitest suite.

The one change not evident from the diff stat: the 10 deleted lines in
`globals.css` are the `.plan-shell` / `.activity-library` focus rule, removed
rather than recoloured. Neither class has any reference in any `.tsx` file
after M3-11, verified by grep. It was deleted because leaving the failing
`#f4cba0` literal in `globals.css` invites reuse by the Plan surface M3-12
builds next. The other dead `.plan-shell` rules in that file are out of this
ticket's scope and were left alone.

## Contrast evidence

Computed with the WCAG 2.2 relative-luminance formula against every surface the
`outline-offset: 2px` can expose, not asserted from a literal. The computation
reproduces M3-18's independently measured 1.92:1 and 1.51:1 exactly, which
cross-checks the method.

| Ring | paper `#fffdf4` | wash `#e8ede3` | input `#ffffff` | surface `#fffef9` | bg `#edf0e8` |
| --- | --- | --- | --- | --- | --- |
| before, modules `#efaa84` | 1.92 | 1.64 | 1.95 | 1.93 | 1.70 |
| before, global `#f4cba0` | 1.48 | 1.27 | 1.51 | 1.50 | 1.31 |
| after, `--ledger-ink` `#142f2a` | **14.02** | **12.01** | **14.29** | **14.15** | **12.40** |
| after, `--foreground` `#17332e` | **13.30** | **11.39** | **13.55** | **13.42** | **11.77** |

Every ring now clears the 3:1 SC 1.4.11 minimum with large margin.

The three module rules use `var(--ledger-ink)`, following the M3-11 precedent.
`src/app/home/layout.tsx:11` wraps all of `/home/**` in `.appShell`, where the
`--ledger-*` tokens are declared, so the custom properties inherit into the
three CSS modules. This was confirmed from the DOM nesting rather than assumed,
as the ticket required.

The global `input:focus` rule is **not** scoped to `.appShell` — it is live on
auth routes too — so `--ledger-ink` would not resolve there. It uses
`var(--foreground)`, an existing `:root` token, instead of a hardcoded literal.

## Local results

Lint, typecheck, and production build all pass on the committed tree.
`git diff --check` clean.

## Known limitations

- The `:focus` versus `:focus-visible` distinction is unchanged. The global
  input rule still fires on pointer focus, not only keyboard focus. Changing
  that is a behavior change beyond the indicator colour and was deliberately
  left out of scope.
- The remaining dead `.plan-shell` rules in `globals.css` are still present.
- No automated test guards these values. A future regression would be caught by
  review, not by CI.

## Product-owner acceptance

Confirmed at 390px on the Preview and accepted on 17 August 2026: the focus ring
is clearly visible when focused, absent at rest, and nothing else on Goals,
Memory, or Onboarding looks different.

## Merge and founder deployment

Merged to `master` as `0421d45` (`--no-ff`, matching the M3-11 convention) and
pushed 17 August 2026.

**`master` CI:** green, all three jobs —
https://github.com/mattiss01/fittip/actions/runs/32030086708
(static 1m21s, database 3m45s, browser 4m44s).

**Founder deployment:** `success` at
https://fittip-3lqjpd2m4-mattis-3657s-projects.vercel.app, reported by the
GitHub deployments API against target `Production` and commit `0421d45` — the
exact merge commit, read rather than inferred from an alias and a timestamp.

**Hosted checks.** This ticket adds no migration, so there is no hosted schema
step to apply or verify; the founder database is untouched by it. Anonymous
`GET` of `/`, `/home`, and `/auth/login` returns `302` to `vercel.com/sso-api`
on both the deployment URL and the `fittip-git-master-*` alias, so no private
path or content is served without authentication.

The visual check that actually matters for this change is the product owner's
390px pass, recorded above against the Preview. The founder environment sits
behind Vercel SSO, so it cannot be smoke-tested anonymously beyond the
protection check; that is a property of the environment, not a gap in this
ticket's evidence.
