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
- These delegation rules apply to every approved Tier 1 and Tier 2 implementation ticket, even when the lead could make the change directly. No additional product-owner prompt is required to spawn the agents.
- Ceremony scales with risk. Every tier still requires a ticket-scoped branch, a green continuous-integration run for the reviewed commit, honest evidence, and the product owner's acceptance of visible behavior.
  - **Tier 1** — schema, migrations, authorization, RLS, privacy, consent, credentials, external services, AI providers, spend, or anything irreversible. Full protocol: approved ticket, distinct builder, distinct independent reviewer, Preview verification, product-owner acceptance.
  - **Tier 2** — user-visible behavior built on an already accepted schema and authorization boundary. Approved ticket, distinct builder, distinct independent reviewer, Preview verification, acceptance. The ticket and the validation record stay short: acceptance criteria, the CI run, evidence CI cannot produce, and known limitations.
  - **Tier 3** — copy, styling, documentation, tests, tooling, and dependency bumps that change no user-visible behavior beyond presentation. The lead may implement directly. A green CI run plus the product owner's confirmation on the Preview replaces the builder and reviewer split. Record one entry in the milestone validation record rather than a separate document.
- The lead states the tier when it dispatches a ticket, and the product owner may raise it at any time. Choose the higher tier when in doubt. A change that turns out to touch schema, authorization, privacy, or spend stops immediately and is re-dispatched as Tier 1, whatever it was called at dispatch.
- Tiering never lowers the evidence bar. It changes how many agents are involved and how much is written down, not whether the work is correct, tested, or honestly reported.
- Every builder handoff must include `git diff --stat` for the ticket's commit range, plus one line for each file whose purpose is not evident from its path and diff, and a note of any file deleted or renamed. Do not restate the diff in prose; the diff is the record of what changed, and duplicating it costs the builder to write and the reviewer to read. Also summarize migrations, data, and API effects and the tests added or changed. Persist this in the ticket's validation record; a chat-only summary is not sufficient.
- The independent reviewer reads the actual Git diff as the source of truth and uses the builder's summary only for navigation. Report any file whose stated purpose is wrong, any change outside the ticket's scope, and anything present that the summary does not account for.
- Every implementation ticket uses a ticket-specific branch in the normal checkout. Do not create a Git worktree for sequential ticket delivery. The builder commits only that ticket's scoped changes before reviewer handoff and records the exact commit SHA in the validation record.
- After the builder commits, the lead pushes the ticket branch to GitHub and waits for its Vercel Preview deployment to reach `READY`. A failure to push or obtain a usable preview is a delivery blocker and must be reported; testable work must not remain local-only.
- The reviewer reviews the exact pushed commit, not an uncommitted working tree, reconciles the manifest, and includes the matching Vercel Preview in hosted verification. Review corrections create new ticket-branch commits, are pushed again, and invalidate approval of earlier commits and previews until re-reviewed.
- Product-owner acceptance is requested against the exact independently reviewed commit and its Vercel Preview URL. The product owner's manual acceptance surface is Vercel, not localhost.
- Product-owner acceptance applies to the exact independently reviewed commit. After acceptance, the lead immediately merges that commit into `master`, pushes `master` to GitHub, waits for the founder Vercel deployment to reach `READY`, performs the required hosted smoke/security checks, and records the resulting `master` commit SHA and deployment URL before dispatching dependent work.
- The Vercel `production` target is currently the owner-only founder-testing environment, not a public or commercial launch. Ticket Preview URLs are temporary review artifacts; no separate persistent staging environment is required yet.
- Do not automatically repeat the complete local suite after a clean merge of the exact reviewed commit. The `master` continuous-integration run covers the post-merge suite; a red or absent run for the merge commit is a delivery blocker. Re-run the full or combined suite locally only when the merge changes the reviewed result, resolves conflicts, integrates separately developed behavior, or otherwise creates material regression risk. Always verify the resulting Vercel deployment and its required hosted flows.
- An accepted ticket must never remain solely as uncommitted changes on `master`. Do not begin dependent implementation from an uncommitted or unmerged ticket.
- An accepted or testable ticket must never remain only in the local repository. Local `master` must not remain ahead of `origin/master` after accepted work; if push or deployment fails, stop and report the blocker.
- The product owner grants standing authorization to push every intentional FitTip commit and ticket branch to the public `origin` repository at `https://github.com/mattiss01/fittip.git`. Do not request push approval again while `origin` matches that exact URL; push promptly after each commit at the point required by this workflow.
- Standing push authorization does not authorize staging or committing unrelated files, secrets, credentials, local environment data, unapproved third-party payloads, or changes outside the requested scope. Verify the commit contents and remote URL before pushing. Stop and report a blocker if the remote changes, a push would expose sensitive or unapproved material, or Git rejects the update.
- Push documentation and governance commits on `master` after their focused checks pass. They do not require a separate Vercel Preview or hosted application verification unless they also change runtime behavior or an approved ticket explicitly requires it.
- Approved planning/governance changes that define a ticket contract are committed separately before the implementation branch when practical. Never bundle unrelated user changes into a ticket commit; if clean separation is not safe, stop and resolve the dirty-worktree blocker explicitly.
- Return to the product owner only for a material decision, a genuine blocker, or final acceptance.
- Before requesting acceptance, provide the Vercel Preview URL, mobile demo path, changed files, tests run, hosted and local results, known limitations, and the precise decision requested.
- Use the lifecycle in Product Plan section 15.1: draft, approved, in development, testable, accepted.

## Ticket agent brief

- Every implementation ticket opens with an `## Agent brief` section placed immediately after the status header block and before any other section. It is the contract a builder or reviewer needs in order to work, and it is deliberately short: aim for 40 lines and treat 60 as a limit.
- The brief contains only what changes behavior: the outcome in one or two sentences, the tier, the hard constraints, the explicit non-goals, the acceptance criteria, and the exact files or modules expected to change when that is known.
- The brief ends with the line **"Read only this section unless you hit an ambiguity it does not resolve."** That instruction is the point of the section. Everything below it — approval history, rationale, alternatives considered, dependency links, external-use boundaries — exists for the product owner and for audit, and a builder should not load it to make a scoped change.
- Do not restate the brief further down the ticket. If a constraint matters enough to repeat, it belongs in the brief and nowhere else.
- Link sparingly from the brief. A ticket header that links seven documents costs every agent that reads it, because agents follow links. Name a document in the brief only when the work cannot be done correctly without it, and say what the agent needs from it.
- The lead names the applicable project skills in the brief rather than leaving skill selection to the builder.
- Tickets already `accepted` are permanent history and are not retrofitted. A `proposed` ticket gains its brief when it is approved for implementation, so the brief is written against the scope actually being dispatched rather than against a draft.
- A ticket that cannot be summarized in a 40-line brief is usually too large to be one ticket. Treat that as a signal to split it, not as a reason to write a longer brief.

## Continuous integration

- `.github/workflows/ci.yml` runs on `master`, on `ticket/**` and `chore/**` branches, and on pull requests into `master`. It covers Prettier, ESLint, TypeScript, the Vitest suite, the production build, every migration applied from zero, database lint, the security and performance advisors, the pgTAP suite, the concurrency harnesses, and the 390px production browser flows.
- The green CI run for the exact reviewed commit is the automated-test evidence for that ticket. Record its run URL in the validation record instead of pasting suite output. A red or absent run for that SHA is a delivery blocker.
- The builder runs the narrow tests it needs while implementing, and does not execute the complete suite by hand to produce evidence. Push the ticket branch and let CI establish the result.
- The independent reviewer reads the exact diff, reconciles it against the manifest, and confirms the CI run is green for that SHA. It does not re-execute the suites CI already ran. Reviewing still requires judgment CI cannot supply: authorization, ownership predicates, product invariants, history and versioning behavior, and honest empty, error, and offline states.
- Do not write "re-run lint, typecheck, tests, build, and the browser flow" into a reviewer checklist. Name the CI run instead, plus whatever genuinely needs a human or a hosted environment.
- CI does not replace exact-commit independent review, Vercel Preview verification, hosted smoke and security checks, or product-owner acceptance.
- CI proves that an assertion holds. It cannot judge whether a mobile surface looks or feels correct. Visual layout, spacing, focus and touch affordances, copy tone, and the 390px acceptance pass remain the product owner's manual check on the Vercel Preview.
- The pipeline requires no repository secret. Each Docker job starts its own disposable local Supabase stack and derives that container's ephemeral coordinates. Do not add a repository secret, hosted project, deployment step, or paid resource to CI without separate product-owner approval.
- Changing `.github/**` is a tooling and supply-chain change. Commit it separately from product changes, and never weaken a check merely to make a branch green.

## Project skill workflow

- Project-scoped skills under `.agents/skills` are the FitTip source of truth when the same skill name also exists globally. The lead names every applicable project skill explicitly in the builder or reviewer handoff so skill selection is deterministic.
- A selected skill supplements this agreement, approved feature briefs, ADRs, tickets, and validation requirements. It never overrides them or expands approved scope.
- A builder and an independent reviewer may use the same skill for different purposes, but each must apply it independently. Skill guidance never replaces exact-commit review, automated tests, RLS/ownership checks, hosted evidence, or product-owner acceptance.
- Use `vercel-react-best-practices` whenever an implementation or review materially changes React components, Next.js pages, Server Actions, data fetching, server/client boundaries, or bundle behavior. Prioritize authentication, request isolation, serialization, waterfalls, and bundle rules; apply lower-impact micro-optimizations only when evidence justifies them. Record the relevant rules checked in the ticket validation record.
- Use `frontend-design` whenever an approved ticket creates or materially reshapes user-visible UI. The skill may propose tokens, typography, layout, interaction, copy, and one FitTip-specific visual signature, but any new visible direction or behavior still requires product-owner approval before implementation. Preserve the serious-coach tone, 390px mobile path, keyboard focus, reduced motion, and honest empty/error states.
- `sleek-design-mobile-apps` is an optional external design service, not a default implementation tool. Do not authenticate, create a project, send content, incur cost, or store Sleek output without explicit product-owner approval of the provider, purpose, data sent, credential scopes, and spend. Start with synthetic content only, never send real user or sensitive training data, and treat generated screenshots/HTML as reviewable design proposals rather than application source of truth.
- `find-skills` is lead-agent research only. It may identify and assess candidate skills, but no agent may install, update, remove, or execute a newly discovered skill without product-owner approval. Report the source, reputation, license, permissions/external access, expected value, and overlap with existing project skills first.
- Adding, updating, or removing project skill files or `skills-lock.json` is a separately committed governance and supply-chain change. Preserve the lockfile hashes and do not silently replace a project skill with a global copy.

## Engineering rules

- Keep AI calls and business rules server-side, behind domain-service interfaces.
- Use migrations for database changes. Enable RLS with explicit ownership policies on exposed user-data tables.
- Never expose service-role credentials or make authorization decisions from user-editable metadata.
- Prefer small vertical slices with automated tests. Test mobile flows at a 390px viewport.
- Preserve unrelated user changes. Do not refactor broadly without an approved ticket.
