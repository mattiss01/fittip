# FitTip working agreement

## Product invariants

- Plans, proposals, and actual completions are separate permanent records.
- Replanning never changes completed history, past sessions, or user-locked future content.
- Every owned record has a `user_id`; authorization is enforced server-side and in database Row Level Security.
- At most three active goals may be `core`; supporting goals remain distinct.
- Memory is explicit, inspectable, editable, and statused. Inferred memory is proposed, never silently treated as fact.
- Activities are personal, AI-created or user-created definitions. Do not add a global exercise library for v1 convenience.
- AI returns schema-validated proposals only. It never directly writes user data or silently changes an accepted plan.
- Pain, illness, injury, and severe-fatigue signals use conservative, non-diagnostic behavior.

## Delivery protocol

- Do not implement a user-visible feature without an approved feature brief.
- Product, safety/privacy/cost, and architectural decisions require product-owner approval. Record architecture decisions as ADRs.
- Work on one approved ticket only. Do not broaden scope during implementation.
- Before requesting acceptance, provide the mobile demo path, changed files, tests run, results, known limitations, and the precise decision requested.
- Use the lifecycle in Product Plan section 15.1: draft, approved, in development, testable, accepted.

## Engineering rules

- Keep AI calls and business rules server-side, behind domain-service interfaces.
- Use migrations for database changes. Enable RLS with explicit ownership policies on exposed user-data tables.
- Never expose service-role credentials or make authorization decisions from user-editable metadata.
- Prefer small vertical slices with automated tests. Test mobile flows at a 390px viewport.
- Preserve unrelated user changes. Do not refactor broadly without an approved ticket.
