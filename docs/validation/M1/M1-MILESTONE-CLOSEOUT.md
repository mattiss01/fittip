# M1 milestone closeout

**Lifecycle state:** accepted

**Approval:** On 29 July 2026 the product owner retired the standalone
[M1-05 consolidated validation ticket](../../backlog/M1/M1-05-M1-VALIDATION-SLICE.md)
as disproportionate duplication and approved this narrower closeout.

**Accepted slices:** [M1-01](M1-01-VALIDATION.md),
[M1-02](M1-02-VALIDATION.md), [M1-03](M1-03-VALIDATION.md), and
[M1-04](M1-04-VALIDATION.md)

## Purpose

Close M1 without repeating the exhaustive local, database, browser, and
independent-review evidence already recorded for its four accepted slices.
This closeout adds no product, schema, external-service, or public-user
behavior.

## Approved targeted evidence

1. Confirm the current `master` commit is pushed and its founder Vercel
   deployment is `READY`.
2. At `390x844`, use the private owner session to smoke the hosted
   **Plan -> Today -> Log actual -> Progress** path against founder Supabase.
3. Confirm the hosted migration list contains the accepted M0/M1 migrations
   and every exposed FitTip table has RLS enabled.
4. Record current Supabase security/performance advisor findings and classify
   them against accepted ADRs and the founder-only boundary. Do not silently
   change schema or product behavior.
5. Check recent Vercel runtime errors, private/no-store behavior, the
   sign-in-only public boundary, and the absence of public/commercial claims.
6. Retain only non-sensitive evidence. Do not record the owner email,
   password, Auth tokens, user UUID, secrets, notes, or training details.

## Exit rule

If the targeted flow or an authorization boundary fails, M1 remains open and
the finding returns to the owning accepted slice as a focused correction.
Otherwise this record moves to **accepted**, M1 closes, and M2-01/M2-02 become
dependency-ready but remain separately proposed.

## Evidence

### Git and founder deployment

- The inspected runtime target was governance commit
  `53f69b46374914eb6e72ded02ca32850e3a37b5f`, pushed to `origin/master`.
- Vercel production deployment `dpl_2UiW25bfWtMhcy1sdLFL81bm6mdP` for that
  exact commit reached `READY`.
- Deployment URL:
  `https://fittip-37x239eui-mattis-3657s-projects.vercel.app/`.
- Founder alias: `https://fittip-gilt.vercel.app/`.
- The deployment reports no alias error. No product code changed in the
  governance commit.

### Anonymous hosted boundary

- `GET /` returned HTTP 200 with only the sign-in form.
- Anonymous `GET /home` returned HTTP 303 to `/`.
- Both responses included
  `Cache-Control: private, no-cache, no-store, ...` and
  `X-Robots-Tag: noindex, nofollow, noarchive`.
- The public page contained no create-account route or public/commercial/
  production claim.
- Vercel reported no grouped runtime errors for the project in the preceding
  24 hours.

### Hosted database

Supabase project `FitTip Founder Staging` was `ACTIVE_HEALTHY` on PostgreSQL
17.6. The hosted migration list contained exactly the five accepted migrations:

1. `20260723084625_m0_02_data_authorization_foundation`
2. `20260727082635_revoke_public_rls_auto_enable_execute`
3. `20260728105226_m1_01_training_records_foundation`
4. `20260728143000_m1_03_completion_writes`
5. `20260728170000_m1_03_review_corrections`

All nine public FitTip tables had RLS enabled. Policy counts were present for
every table: four on `personal_activities`, two on `profiles`, and one on each
immutable plan/completion table.

### Advisor disposition

The security advisor reported three known warnings:

- `save_manual_plan_version` and `save_training_completion` are intentionally
  authenticated `SECURITY DEFINER` transaction boundaries under
  [ADR-008](../../decisions/ADR-008-M1-TRAINING-RECORD-TRANSACTIONS.md) and the
  accepted M1-03 contract. Hosted inspection confirmed an empty `search_path`,
  no anonymous execution privilege, and authenticated-only execution for both.
- Leaked-password protection remains disabled, as already accepted for the
  owner-only founder environment in M0-06A. Public registration remains
  disabled; this warning must be resolved through the separate external-use
  gates before friends/public/commercial use.

The performance advisor reported two unindexed-foreign-key informational
notices and eleven unused-index informational notices. They are not a founder
closeout blocker: the database is intentionally low traffic, no performance
failure was observed, and removing or adding indexes without workload evidence
would be an unapproved schema change. Reassess them with real query evidence
before external use.

The current official
[Supabase breaking-change index](https://supabase.com/changelog?types=breaking-change)
was reviewed before these checks. No listed hosted-platform change invalidated
this read-only migration, RLS, grant, or advisor inspection.

### Private owner walkthrough

On 29 July 2026 the product owner confirmed in chat that they were signed in
and had personally completed the hosted check. They explicitly declined a
duplicate agent-controlled browser run. This is retained as product-owner
attestation for the private `390x844`
**Plan -> Today -> Log actual -> Progress** walkthrough.

The browser-control surface was not connected, so there is intentionally no
agent screenshot, browser trace, credential access, or copied owner data. No
credential was requested, read, or stored.

## Acceptance

The targeted hosted closeout passed through the combination of:

- exact deployment and anonymous-boundary evidence collected by the lead;
- current hosted migration, RLS, grant, and advisor evidence;
- existing independently reviewed M1-01 through M1-04 validation; and
- the product owner's manual private-session walkthrough.

The product owner approved retirement of M1-05 and supplied the final manual
evidence on 29 July 2026. M1 is accepted as the manual planning and factual
tracking milestone. M2-01 and M2-02 are now dependency-ready but remain
separately proposed and may not be implemented without product-owner approval.
