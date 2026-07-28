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
- Each builder works on one approved ticket only. Multiple dependency-ready tickets may run concurrently only after the lead records a file/data ownership and dependency-overlap assessment, assigns separate builders, and places each parallel ticket in an isolated Git worktree.
- Never run parallel builders in the same worktree. If tickets materially overlap in files, migrations, data contracts, or acceptance behavior, serialize them or split out an explicitly owned integration ticket.
- Before parallel dispatch, record the merge order and who owns shared integration changes. Re-run combined regression and integration checks after merging.
- When the product owner approves a dependency-ready ticket, the lead agent immediately marks it `in development` and spawns a distinct builder subagent before any implementation edit. The lead agent must not act as the builder.
- After the builder handoff, the lead agent immediately spawns a different independent reviewer subagent. The builder and reviewer must not be the same agent.
- If distinct builder/reviewer delegation is unavailable, the lead agent stops implementation and reports the delegation blocker; it must not silently fall back to single-agent delivery.
- These delegation rules apply to every approved implementation ticket, even when the lead could make the change directly. No additional product-owner prompt is required to spawn the agents.
- Every builder handoff must include a complete change manifest grouped as created, modified, deleted, and renamed files. For every listed file, give one brief explanation of what changed and why. Also summarize migrations/data/API effects and tests added or changed. Persist this manifest in the ticket's validation record; a chat-only summary is not sufficient.
- The independent reviewer uses the builder's manifest as a navigation checklist but must reconcile it against the actual Git diff and report any omitted, unexpected, or inaccurately described file.
- Every implementation ticket uses a ticket-specific branch and, when another ticket is active, an isolated Git worktree. The builder commits only that ticket's scoped changes before reviewer handoff and records the exact commit SHA in the validation record.
- The reviewer reviews the exact recorded commit, not an uncommitted working tree. Review corrections create new ticket-branch commits and invalidate approval of earlier SHAs until re-reviewed.
- Product-owner acceptance applies to the exact independently reviewed commit. After acceptance, the lead immediately merges that commit into `master`, runs the required post-merge checks, and records the resulting `master` commit SHA before dispatching dependent work.
- An accepted ticket must never remain solely as uncommitted changes on `master`. Do not begin dependent implementation from an uncommitted or unmerged ticket.
- Approved planning/governance changes that define a ticket contract are committed separately before the implementation branch when practical. Never bundle unrelated user changes into a ticket commit; if clean separation is not safe, stop and resolve the dirty-worktree blocker explicitly.
- Return to the product owner only for a material decision, a genuine blocker, or final acceptance.
- Before requesting acceptance, provide the mobile demo path, changed files, tests run, results, known limitations, and the precise decision requested.
- Use the lifecycle in Product Plan section 15.1: draft, approved, in development, testable, accepted.

## Engineering rules

- Keep AI calls and business rules server-side, behind domain-service interfaces.
- Use migrations for database changes. Enable RLS with explicit ownership policies on exposed user-data tables.
- Never expose service-role credentials or make authorization decisions from user-editable metadata.
- Prefer small vertical slices with automated tests. Test mobile flows at a 390px viewport.
- Preserve unrelated user changes. Do not refactor broadly without an approved ticket.
