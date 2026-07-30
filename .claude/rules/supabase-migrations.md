---
description: Migration, RLS, and generated-type rules for the Supabase schema
paths:
  - "supabase/**"
---

# Supabase schema changes

- Create every migration through the pinned CLI: `npx.cmd supabase migration new <name>`.
  Never hand-name a timestamp file.
- Applied migrations are immutable. Corrections are new forward migrations; do not edit
  history. Verify from zero with `npx.cmd supabase db reset --local`.
- `supabase/config.toml` is local-only development configuration. Never run `supabase link`,
  `db push`, or any remote command — ADR-007 gates the founder-staging project separately.
- Every exposed user-data table: revoke unintended privileges, `ENABLE ROW LEVEL SECURITY`,
  and add explicit ownership policies targeting `authenticated` with
  `(select auth.uid()) = user_id`. `TO authenticated` alone is not authorization.
- Update access needs the matching owner-select policy plus owner `USING` **and** `WITH CHECK`
  so `user_id` cannot be reassigned.
- Index the ownership and ordering columns that policies and list queries use when the primary
  key does not already provide the access path.
- Add a pgTAP file under `supabase/tests/database/` proving the actual columns, constraints,
  privileges, policies, and RLS state, plus owner access and anonymous/cross-user denial for
  every mutation.
- After a clean reset, regenerate the committed types (see README) — do not hand-edit
  `src/lib/supabase/database.types.ts`.
- Gate sequence for a schema ticket: `db reset --local`, `db lint --local --level warning
  --fail-on warning`, `db advisors --local --type all --level warn --fail-on warn`,
  `test db --local supabase/tests/database`.
