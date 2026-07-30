---
description: Ownership, authorization, and transaction rules for server-side data access
paths:
  - "src/server/**"
  - "src/lib/supabase/**"
  - "src/lib/auth/**"
---

# Server data access

- Derive the owner from verified Auth claims (`src/lib/auth/verified-user.ts`). Never accept a
  caller-supplied `user_id`, and never authorize from user-editable Auth metadata.
- Repeat the `user_id` predicate on every read and write even though RLS also enforces it. RLS
  is the backstop, not the only check.
- There is no service-role or secret Supabase client in the application. Do not add one. Only
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` reach runtime code;
  `src/lib/supabase/env.ts` rejects secret and legacy JWT-form keys on purpose.
- Server-only modules import `server-only`. `src/test/setup.ts` stubs it for Vitest, so a
  missing import is not caught by tests — only by review.
- Multi-row invariants (plan versions, completion heads, goal ranks) go through the approved
  atomic RPC for that ticket, not a sequence of client-side statements.
- `.retry(false)` is allowed **only** on the `save_manual_plan_version` and
  `save_training_completion` RPC calls. `src/architecture/server-boundary.test.ts` asserts the
  exact set and count; adding it elsewhere is a deliberate architectural change.
- Map constraint and conflict errors to stable domain results (e.g. the `PT409` conflict path)
  instead of letting a Postgres error surface to the UI.
- Plans, proposals, and completions are separate permanent records. A read or write for one
  never rewrites another, and correction revisions stay append-only behind
  `completion_heads.current_completion_id`.
