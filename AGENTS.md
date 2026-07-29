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
- Each builder works on one approved ticket only.
- Only one implementation builder may be active at a time. Concurrent builders are not allowed, even when tickets appear independent or dependency-ready.
- Do not dispatch the next implementation builder until the current ticket is accepted, merged, pushed, deployed to the founder environment, and its required hosted verification is recorded.
- When the product owner approves a dependency-ready ticket, the lead agent immediately marks it `in development` and spawns a distinct builder subagent before any implementation edit. The lead agent must not act as the builder.
- After the builder handoff, the lead agent immediately spawns a different independent reviewer subagent. The builder and reviewer must not be the same agent.
- If distinct builder/reviewer delegation is unavailable, the lead agent stops implementation and reports the delegation blocker; it must not silently fall back to single-agent delivery.
- These delegation rules apply to every approved implementation ticket, even when the lead could make the change directly. No additional product-owner prompt is required to spawn the agents.
- Every builder handoff must include a complete change manifest grouped as created, modified, deleted, and renamed files. For every listed file, give one brief explanation of what changed and why. Also summarize migrations/data/API effects and tests added or changed. Persist this manifest in the ticket's validation record; a chat-only summary is not sufficient.
- The independent reviewer uses the builder's manifest as a navigation checklist but must reconcile it against the actual Git diff and report any omitted, unexpected, or inaccurately described file.
- Every implementation ticket uses a ticket-specific branch in the normal checkout. Do not create a Git worktree for sequential ticket delivery. The builder commits only that ticket's scoped changes before reviewer handoff and records the exact commit SHA in the validation record.
- After the builder commits, the lead pushes the ticket branch to GitHub and waits for its Vercel Preview deployment to reach `READY`. A failure to push or obtain a usable preview is a delivery blocker and must be reported; testable work must not remain local-only.
- The reviewer reviews the exact pushed commit, not an uncommitted working tree, reconciles the manifest, and includes the matching Vercel Preview in hosted verification. Review corrections create new ticket-branch commits, are pushed again, and invalidate approval of earlier commits and previews until re-reviewed.
- Product-owner acceptance is requested against the exact independently reviewed commit and its Vercel Preview URL. The product owner's manual acceptance surface is Vercel, not localhost.
- Product-owner acceptance applies to the exact independently reviewed commit. After acceptance, the lead immediately merges that commit into `master`, pushes `master` to GitHub, waits for the founder Vercel deployment to reach `READY`, performs the required hosted smoke/security checks, and records the resulting `master` commit SHA and deployment URL before dispatching dependent work.
- The Vercel `production` target is currently the owner-only founder-testing environment, not a public or commercial launch. Ticket Preview URLs are temporary review artifacts; no separate persistent staging environment is required yet.
- Do not automatically repeat the complete local suite after a clean merge of the exact reviewed commit. Re-run the full or combined suite when the merge changes the reviewed result, resolves conflicts, integrates separately developed behavior, or otherwise creates material regression risk. Always verify the resulting Vercel deployment and its required hosted flows.
- An accepted ticket must never remain solely as uncommitted changes on `master`. Do not begin dependent implementation from an uncommitted or unmerged ticket.
- An accepted or testable ticket must never remain only in the local repository. Local `master` must not remain ahead of `origin/master` after accepted work; if push or deployment fails, stop and report the blocker.
- Approved planning/governance changes that define a ticket contract are committed separately before the implementation branch when practical. Never bundle unrelated user changes into a ticket commit; if clean separation is not safe, stop and resolve the dirty-worktree blocker explicitly.
- Return to the product owner only for a material decision, a genuine blocker, or final acceptance.
- Before requesting acceptance, provide the Vercel Preview URL, mobile demo path, changed files, tests run, hosted and local results, known limitations, and the precise decision requested.
- Use the lifecycle in Product Plan section 15.1: draft, approved, in development, testable, accepted.

## Engineering rules

- Keep AI calls and business rules server-side, behind domain-service interfaces.
- Use migrations for database changes. Enable RLS with explicit ownership policies on exposed user-data tables.
- Never expose service-role credentials or make authorization decisions from user-editable metadata.
- Prefer small vertical slices with automated tests. Test mobile flows at a 390px viewport.
- Preserve unrelated user changes. Do not refactor broadly without an approved ticket.
