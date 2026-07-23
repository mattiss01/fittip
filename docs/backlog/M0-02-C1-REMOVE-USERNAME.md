# M0-02-C1: Remove username from the local profile foundation

**Status:** testable — builder and independent review passed 23 July 2026

**Approved by:** product owner, 23 July 2026

**Milestone:** M0

**Priority:** P0 correction

**Depends on:** M0-02 accepted

**Architecture decision:** [ADR-004 accepted](../decisions/ADR-004-USERNAME-FREE-ACCOUNT-PROFILE.md)

**Blocks:** M0-03 / F-001

**Owner:** Lead agent awaiting product-owner acceptance after `gpt-5.6-terra` builder and independent-review handoffs

## Outcome

Correct the accepted but local-only M0-02 profile foundation so FitTip accounts do not require a username. Preserve the profile ownership boundary, explicit privileges, owner-only RLS, server-derived identity, generated types, and direct isolation evidence.

## Environment and approval boundary

This correction is authorized against the local Supabase stack and repository only.

It does not authorize:

- linking or changing a remote Supabase project;
- applying a migration to a hosted database;
- implementing M0-03 registration, confirmation, recovery, session, route, or UI behavior;
- adding a display name, public handle, or other profile field.

Read-only confirmation must show that no remote project link or migration history exists before changing the baseline migration. If remote application is discovered, stop: create a new forward migration rather than editing applied history.

## Scope

### Schema and authorization

- Amend the never-remotely-applied M0-02 baseline migration so `public.profiles` contains exactly `user_id` and `created_at`.
- Remove the username column, format constraint, and unique constraint.
- Preserve the primary key, Auth foreign key with cascade delete, explicit revokes/grants, and owner-only `SELECT`/`INSERT` policies.
- Do not add `UPDATE`, `DELETE`, a trigger, view, RPC, function, new table, custom role, or speculative field.
- Regenerate and commit database types from a clean local reset.

### Server boundary

- Remove username types, normalization, validation, collision errors, and caller input.
- Make current-profile creation derive `user_id` only from verified Auth claims and insert no user-editable data.
- Return only `userId` and `createdAt`.
- Preserve `server-only`, the request-scoped publishable-key client, explicit owner filtering, safe errors, and the client-import boundary.

### Tests

- Update pgTAP schema expectations to exactly two approved columns and remove obsolete username assertions.
- Preserve anonymous denial, authenticated owner insert/read, missing-identity denial, cross-user denial, and no update/delete privileges.
- Update repository tests to prove profile creation accepts no ownership/profile input and derives the current `user_id`.
- Preserve environment, server-client, architecture, lint, type, test, and build coverage.

### Governing documentation

- Add ADR-004 supersession links without rewriting historical approval records.
- Revise F-001, the backlog, product plan, README, M0-02 brief, and validation record to distinguish the accepted original implementation from this approved correction.
- Remove username and collision language from the proposed M0-03 flow.
- Keep F-001 in `draft`; this correction does not approve the remaining authentication feature.

## Acceptance criteria

1. A clean local database reset applies the corrected committed baseline.
2. `public.profiles` contains exactly `user_id` and `created_at`.
3. No username column, constraint, index, Auth metadata contract, repository input, or error remains.
4. Existing grants and owner-only RLS remain unchanged in effect.
5. Authenticated user A can create/read profile A and cannot create/read profile B.
6. User B cannot read or modify profile A; anonymous access remains denied.
7. Profile creation accepts no caller-supplied ownership or profile field.
8. Generated types match the clean local schema.
9. Database lint/advisors, pgTAP, formatting, lint, typecheck, Vitest, and production build pass.
10. Documentation consistently describes username-free accounts and the eight-character password minimum.
11. No remote Supabase project or setting changes.
12. No M0-03 user-visible behavior is implemented.

## Required handoff

The builder must provide:

- exact branch and commit;
- changed-file groups;
- confirmation that the baseline migration was never remotely applied;
- actual post-correction schema and privilege/policy matrix;
- exact commands and results;
- owner/anonymous/cross-user denial evidence;
- generated-type reproducibility evidence;
- secret and remote-link scan results;
- known limitations; and
- confirmation that F-001 remains draft.

The lead agent then assigns an independent reviewer. Product-owner acceptance is requested only after focused corrections and re-review pass.

## Review record

The builder completed the correction at commit `6de981d`. Independent review returned **PASS — no findings** after inspecting the exact diff and independently verifying the corrected schema, privileges, RLS, owner/anonymous/cross-user behavior, generated types, application tests, and production build. M0-02-C1 is **testable** pending product-owner acceptance.
