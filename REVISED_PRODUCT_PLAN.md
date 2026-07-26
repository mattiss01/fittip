# FitTip: Revised Product and Technical Plan

**Revision source:** product-owner answers, 13 July 2026  
**Audience:** the lead Codex agent, builders, reviewers, and the product owner  
**Current stage:** planning only — no application code has been built

## 1. The product in one paragraph

FitTip is a mobile-first personal training-planning web app for a sporty person who regularly pursues several different challenges: for example, improve flexibility, prepare for a football season, run a marathon, or get stronger. It acts in the tone of a serious coach. It learns the user's goals, priorities, schedule, equipment, preferences, past training, feedback, and longer-term patterns. It then creates a detailed seven-day plan, lets the user log what actually happened, conducts a short coaching conversation when needed, and proposes a revised plan after the user explicitly asks it to replan.

The first release is a personal hosted tool, not a public multi-user product. It must nevertheless preserve history and use a clean user/ownership boundary so it can grow later.

## 2. Product outcome and differentiator

### Intended outcome

The user always knows what training is most useful *now*, even when goals compete, life changes, a workout is skipped, equipment differs, or training feels unexpectedly easy or hard.

### Differentiator

FitTip is not a fixed workout logger or generic chatbot. Its value is the combination of:

1. A durable, reviewable memory of the user and their constraints.
2. Multiple active goals with explicit priority and limited attention.
3. Plans generated for the user's actual possibilities rather than a generic program.
4. A strict distinction between what was planned and what was actually done.
5. Interactive replanning, with concise recommendations, alternatives when uncertain, and a side-by-side diff before changes are accepted.

## 3. Decisions already made

| Area | Decision |
|---|---|
| First user | The product owner: sporty, exploratory, pursuing changing challenges across sports. |
| Tone | Serious coach: precise, direct, encouraging without hype or vague motivational language. |
| Initial audience | Founder-led early beta: the product owner first, then a small number of self-registering testers using mobile browsers. |
| Training scope | Goal- and sport-agnostic from the data model and user experience. Do not position strength as the primary experience. |
| Goals | Multiple concurrent goals; at most 3 core goals, plus lower-attention supporting goals. Priorities are editable. |
| Plan horizon | Detailed plan: next 7 days. Longer horizon: high-level roadmap for following weeks/months. |
| Initial-plan source | AI-generated, with user edits and conversational feedback. |
| Replanning | Explicit user action; may change any *future, unlocked* aspect of the plan. |
| Locks | User can lock a session and/or activity so replanning cannot change it. |
| Training records | Plan and actual completion are separate, permanent historical records. |
| Logging | Quick post-workout summary first; optional detailed/per-set logging as a second mode. |
| Coaching chat | Core feature. It can gather facts, ask clarifying questions, explain choices on request, and initiate a proposal — it does not silently rewrite plans. |
| Exercise source | No pre-existing exercise library in v1. The AI creates personalized activities/exercises based on the user context. |
| Memory | Core feature: stored user facts, preferences, constraints, and observed patterns influence future plans. |
| Language | English only initially. |
| Devices | Mobile browser first; desktop must remain functional. |
| Accounts | Public self-service email/password accounts, verified email, username-free profiles, and per-user data isolation from the first beta build. |
| Business direction | Validate a real business hypothesis through founder-led early beta, then broader public beta and app-store distribution. |
| Future | User-controlled sharing, shared workouts/plans/groups; no coach-role implementation now. |

## 4. Critical requirement clarifications

These are the product-safe interpretations of broad requirements. Keep them in the design and do not silently simplify them away.

### 4.1 “Every kind of sport should be possible”

FitTip must be **sport-agnostic**, not falsely claim instant expert-level programming for every sport. The v1 data model, plan UI, logs, and AI context must work for any named sport or activity. Examples: running, football preparation, strength work, mobility, hiking, swimming, martial arts drills.

However, each sport needs different measurements and safety knowledge. Therefore:

- V1 supports arbitrary activities through a flexible activity schema and free-text coaching context.
- The app must label plans as suggestions and allow correction.
- High-quality sport-specific templates, metrics, and evaluators are later capability packs, not a precondition for the base product.
- Do not hard-code the app around sets/reps/weight. These are one measurement mode among several.

### 4.2 “No pre-existing exercise library”

Do not ship a global curated catalog in v1. Instead, the AI may create activities for the user's plan and store them in that user's personal activity catalog. Each generated activity contains the metadata needed to display, log, compare, and reuse it.

This is still not permission for the AI to invent unsafe or unusable prescriptions. Generated activities must be structured, validated, editable, and reusable. If the user says “I do not know this exercise” the coaching chat should explain it, offer alternatives, or replace it.

### 4.3 “Founder-led beta first, then an App Store and Google Play business”

A hosted app accessible from multiple devices needs persistent identity and per-user data isolation. A single shared password or seeded owner profile is suitable only for a private personal experiment; it would require a disruptive rewrite before inviting real testers or selling the app.

**Revised MVP decision:** implement public self-service email/password registration, verified email, an authenticated `user_id` on every owned record, and strict per-user authorization/row-level security from the first beta build. Email remains the login identity; no display name or public handle is collected. Social discovery and payments remain out of scope.

The MVP is therefore a **commercially aware early beta**: a small, usable product with public self-service accounts and production-shaped data, privacy, and AI-cost foundations—but without the feature breadth of a finished consumer company.

### 4.4 Health and pain reports

If the user reports pain, illness, severe fatigue, or injury, the plan must become conservative: rest, reduced load, or alternatives that avoid the reported limitation. The app must not diagnose conditions, claim safety, or produce rehabilitation treatment. For severe, worsening, or acute symptoms, it should clearly recommend stopping/consulting a qualified professional.

## 5. Business validation strategy and end-state constraints

### 5.1 Product strategy

Build the smallest **real** product, not a throwaway personal demo and not the complete eventual company. The product owner uses it first to expose workflow problems; a small number of self-registering early-beta users then validate whether the outcome is useful beyond the founder's preferences.

The eventual market message cannot be “an app for every sport and every person.” The product architecture stays sport-agnostic, but the business must eventually choose a narrow initial customer and promise. A working hypothesis is:

> An adaptive AI training coach for active people balancing several goals and a changing real-life schedule.

This is a hypothesis, not permanent positioning. Test it with real behavior before committing to a brand, paid acquisition, or a large feature set.

### 5.2 Validation stages

| Stage | Audience | Objective | Evidence to collect | Exit decision |
|---|---|---|---|---|
| Founder use | Product owner, 2–4 weeks of real training | Prove the daily workflow is personally useful | Plans created, sessions logged, replans requested/accepted, friction notes | Keep/change the core loop |
| Early beta | A small number of self-registering people with varied goals/sports | Find repeated value outside founder context | Onboarding completion, weekly active use, logging/replan frequency, qualitative interviews | Choose initial customer wedge and fix retention blockers |
| Public beta | Limited self-serve audience | Validate onboarding, reliability, privacy, and willingness to return | Activation, week-2/week-4 retention, support load, AI cost/user | Decide whether to invest in native launch and monetization |
| Store launch | Public iOS/Android users | Validate a scalable business | Conversion, retention, paid conversion, churn, support and safety metrics | Iterate pricing, positioning, and acquisition |

### 5.3 Metrics to instrument from the early beta

Use privacy-conscious, event-based product analytics. Do not send raw sensitive notes to analytics services.

- `signup_completed`
- `intake_completed`
- `goal_created`, `goal_priority_changed`
- `plan_proposed`, `plan_accepted`, `plan_edited`, `plan_discarded`
- `session_logged` with status only (not raw note content)
- `replan_requested`, `replan_proposed`, `replan_accepted`, `replan_discarded`
- `coach_question_answered`
- `memory_proposed`, `memory_confirmed`, `memory_rejected`
- AI request latency/error/validated-output outcome and cost estimate

The first product questions are: do users return weekly, do they log enough context for replanning, do they accept meaningful plan changes, and would they be disappointed if the product disappeared? Add a short in-app feedback prompt after repeated use; do not optimize vanity metrics such as downloads before retention exists.

### 5.4 Build now versus defer

| Build in early beta | Design for now, implement later |
|---|---|
| Public email/password accounts, verified email, minimal profiles, and per-user authorization | Referrals, growth loops, social login, passkeys |
| Privacy/consent records and deletion-capable data model | Polished self-service export/deletion UX |
| Secure server-side AI, request limits, cost/usage telemetry | Subscription checkout and entitlement management |
| Mobile-first responsive web experience | Native iOS/Android client, push notifications, offline mode, watch integrations |
| Versioned plans/logs/memory and safety rules | Social graph, groups, sharing controls, coach roles |
| Domain/API services independent of web UI | Dedicated sport capability packs and deep wearable integrations |

### 5.5 App-store and privacy readiness requirements

These are architecture requirements from the first beta, even though app-store submission is later:

1. Every user-owned record has a user id and authorization is enforced server-side.
2. The app records explicit consent before sending training notes, chat content, or health-adjacent context to an LLM provider; users can withdraw consent.
3. The data model and backend service support full account/data deletion, including a defined approach for backups and retained security logs.
4. Maintain a data inventory: data collected, purpose, processors/subprocessors, retention period, and deletion behavior.
5. Do not make medical claims. Safety messages and conservative planning behavior are testable product requirements.
6. Track every AI request's provider/model/prompt version, validation result, cost estimate, and failure status without recording secrets.
7. Keep business rules in server/domain services behind an API boundary so a future native client can reuse them.
8. Do not request device permissions or collect location, wearable, HealthKit, or Health Connect data until a user-facing feature needs it and its disclosure/consent flow is designed.

Before public launch, add a public privacy policy, terms/support contact, accurate store data disclosures, self-service account deletion, abuse/support processes, and a full security review. App-store rules and laws change; re-check current official Apple, Google Play, and jurisdiction-specific requirements immediately before release.

## 6. Users, goals, and memory

### 6.1 Goal model

A goal is not just a title. It guides planning and should contain:

- Title and free-text desired outcome
- Category: performance/event, skill, strength, endurance, mobility, body composition, recovery/general fitness, other
- Related sport(s) or activity areas (free text/tags)
- Start date, optional target date, and target/event details
- Priority: `core` or `supporting`
- Rank: core goals use rank 1–3; only three may be marked core
- Target metric when appropriate: e.g. marathon time, pull-ups, weekly run distance, mobility test
- Status: active, paused, achieved, abandoned
- User-provided rationale and constraints

The user can add, pause, resume, edit, and reorder goals. A replan must use only active goals. It must explain tradeoffs when core goals conflict.

### 6.2 Memory model

Memory must be explicit, inspectable, and editable—not an opaque accumulation of chat history.

Store four classes of memory:

| Memory type | Examples | Source | Planning behavior |
|---|---|---|---|
| Profile fact | preferred language, unit preference, training experience | onboarding/user edit | Always available context |
| Constraint | only 30 minutes weekdays; no pool this month; equipment at home | user statement/user edit | Enforced unless expired/overridden |
| Preference | enjoys running outdoors; dislikes burpees; prefers Sundays off | user statement or confirmation | Strong planning preference |
| Observed pattern | often misses Thursday; handles easy runs well; recovery poor after late football | derived from logs, with evidence | A proposed signal, confirmable by user |

Every memory record needs: source, confidence, created/updated timestamp, optional expiry, and status (`active`, `proposed`, `rejected`, `archived`).

Rules:

- The AI can propose a new memory from conversation/logs but should not treat a weak inference as permanent fact.
- The user can view, edit, disable, or delete every memory record.
- A user statement is stronger than an inferred pattern.
- Planning context includes active memory, but not unlimited raw chat history.

## 7. Core user journeys

### 7.1 First coaching conversation and initial plan

1. User opens the private app on mobile.
2. The coach asks a compact, adaptive intake: current goals, priorities, target dates, current fitness/activity, available days/time, equipment/locations, preferences, limitations, and relevant upcoming commitments.
3. The user can write naturally; the AI extracts structured facts and asks follow-up questions only for material gaps or ambiguities.
4. The user reviews extracted goals, constraints, and preferences before they become active memory.
5. The system creates a high-level roadmap and a detailed 7-day proposal.
6. The plan screen shows goals addressed, sessions, activity details, expected duration, and concise rationale.
7. The user can chat, edit, choose between alternatives, lock items, or accept the plan.

### 7.2 Complete/log a session

1. User opens Today or a planned session.
2. They see what was planned and choose **Quick summary** or **Detailed log**.
3. Quick summary captures what happened, duration, completion state, perceived effort, and optional contextual signals/notes.
4. Detailed log adds activity-by-activity performance, sets/reps/load where relevant, distance/duration/pace where relevant, or custom measurements.
5. The user saves the factual completion. It never alters the plan record.
6. The app may ask one short follow-up if the note contains information critical to safe/useful replanning.

### 7.3 Replan interactively

1. User taps **Replan** or asks the coach to adapt the plan.
2. The coach receives the active goals, active memory, upcoming unlocked sessions, completed session summaries, current roadmap, and new input.
3. If uncertainty materially affects the plan, it asks a focused question and may offer alternatives. Example: “Do you want to preserve Saturday football, reduce the run volume, or move the long run?”
4. It produces a proposal for the requested scope, normally the remaining week and/or next detailed 7-day period.
5. The user sees a side-by-side comparison: current versus proposed, each changed/removed/added item, concise reasons, and options where available.
6. The user accepts, edits, partially chooses options, or discards the proposal.
7. Acceptance creates a new plan version. Historical plans and completions stay unchanged.

### 7.4 User reports illness, pain, or severe fatigue

1. User logs the issue via session feedback or chat.
2. The AI identifies the signal, records it as a temporary/reviewable constraint, and asks only necessary safe questions.
3. The app does not diagnose. It explains that it will use a conservative plan and recommends professional help for severe/acute/worsening symptoms.
4. It proposes rest, reduced intensity, postponement, or non-conflicting alternatives within the user's approved scope.
5. User reviews and accepts/discards the changed plan.

## 8. Mobile-first information architecture

Primary tabs:

1. **Today** — next session, status, quick log/start action, urgent coach message if a clarification blocks planning.
2. **Plan** — current 7-day detailed plan, locks, roadmap entry point, replan action.
3. **Coach** — persistent conversation, suggestions, questions, and requested explanations.
4. **Progress** — history, plan-versus-actual, basic trends, observed patterns.
5. **You** — active goals, priorities, memory, availability, equipment/possibilities, and preferences.

### Essential screens and states

- Empty / onboarding
- Coaching intake and fact-review step
- Plan proposal and accepted weekly plan
- Session detail
- Quick summary log
- Detailed activity log
- Replan request / clarifying question
- Plan diff / alternatives / acceptance
- Goal management and priority ordering
- Memory management
- History and a plan-version detail

### UI rules

- Design for a phone width first; no critical functionality requires hover.
- Keep primary actions large and thumb-reachable.
- Do not bury coaching chat behind settings.
- Never imply a factual completion based only on a plan.
- Labels must clearly say `planned`, `completed`, `partially completed`, `skipped`, `locked`, and `proposed`.
- Recommendations are concise by default; “Why?” opens reasoning/chat context.

## 9. Plan, activity, and log design

### 9.1 Two planning horizons

**Roadmap (weeks/months):** a flexible high-level view with phases, major milestones, intended focus, and review points. It is a strategy, not a dated immutable prescription.

**Detailed plan (7 days):** dated sessions with the activities to perform, their targets, duration, intent, and optional alternatives. Only this detailed plan is the operational source for Today and logging.

### 9.2 Generic activity schema

An activity is a user-specific, AI-generated prescription. It includes:

```ts
type PlannedActivity = {
  id: string;
  name: string;
  sportOrDomain: string;
  intent: string;
  instructions?: string;
  estimatedMinutes?: number;
  measurementMode: "sets_reps_load" | "time_distance_pace" | "duration_intensity" | "skill_repetitions" | "custom";
  target: Record<string, unknown>;
  alternatives: Array<{ name: string; reason: string }>;
  locked: boolean;
};
```

Examples:

- 100 push-ups, potentially distributed in sets, logged as reps + perceived effort.
- 30-minute easy run, logged as duration/distance/pace + perceived effort.
- 20 minutes of football ball-control drills, logged as duration + self-rated quality.
- 15-minute flexibility routine, logged as duration + comfort/range feedback.

The UI selects an appropriate logging form from `measurementMode`. It must also offer a generic actual-description and notes field, so no sport is excluded.

### 9.3 Personal activity catalog

When the AI proposes a new activity, it creates a user-owned activity definition or reuses a prior matching one. The user can rename, edit, archive, and tell the coach not to use it again. This supplies consistency without a shipped global exercise library.

Store aliases and a normalized name to avoid accidental duplicates, but do not merge user activities automatically without review.

### 9.4 Session fields

Every planned session contains:

- Date, title, sport/domain, focus, expected duration
- Goal allocation: which goals it serves and relative attention
- Activities in order
- Recovery/effort intent where applicable
- Session-level alternatives
- User lock state and notes

Every completed session contains:

- Link to planned session when relevant (nullable for unplanned training)
- Actual date/time/duration
- Status: completed, partially completed, skipped, replaced, rest
- Actual activities and metrics
- Perceived exertion (1–10), feeling relative to expectation, energy, soreness, mood/stress, sleep quality, enjoyment, and pain/illness flags — all optional except status
- Free-text note and skip reason when relevant

## 10. AI system specification

### 10.1 AI capabilities

1. Conversational intake and ongoing coaching.
2. Structured extraction of goals, constraints, preferences, and signals from user text.
3. Follow-up questions when a material decision is ambiguous.
4. High-level roadmap generation.
5. Detailed 7-day plan proposal generation.
6. Plan adaptation from plan-versus-actual history, current memory, and new input.
7. Concise explanation on proposal; deeper reasoning only when asked.
8. Pattern detection that creates *proposed* memories with evidence.

### 10.2 AI boundaries

The server—not the model—must:

- Authenticate owner access and scope data.
- Decide which records are eligible for replanning.
- Prevent changes to past/completed or locked entries.
- Validate every structured model response.
- Enforce maximum duration, session count, date range, and data shape.
- Persist proposals/version changes transactionally.
- Deliver safety copy based on recognized risk signals.

The model must not:

- Directly run database queries or write database records.
- Treat chat text as an instruction to bypass constraints.
- Modify accepted history, completions, or locked items.
- Claim diagnosis, treatment, or medical certainty.
- Replan silently without explicit proposal/acceptance.

### 10.3 Required structured outputs

Use strict server-side schemas (for example Zod) for all AI actions. The app must never parse informal prose as a plan.

Minimum output types:

- `ExtractedFacts`: candidate goals, constraints, preferences, and cited source text.
- `CoachQuestion`: one or more targeted questions plus alternatives when suitable.
- `RoadmapProposal`: phases/milestones/review points, with uncertainty notes.
- `DetailedPlanProposal`: exactly one 7-day date range, sessions, generic activities, and goal allocation.
- `ReplanProposal`: source plan id, scope, changes, alternatives, concise reasons, and proposed detailed plan.
- `MemoryProposal`: observed pattern/fact, confidence, evidence ids, expiry suggestion.
- `SafetySignal`: severity, safe response category, and whether planning should pause.

### 10.4 Context construction

Build model context from structured, limited records—not entire unbounded history:

1. Active goals and priorities.
2. Active profile/memory entries, including equipment and availability.
3. Current roadmap summary.
4. Current detailed plan and locks.
5. Recent completed-session summaries and relevant logs.
6. Recent accepted plan changes.
7. Current conversation turn plus a concise conversation summary.

Include the timestamp and timezone. Prefer recent and goal-relevant history. Log which context record ids informed each proposal.

### 10.5 Model/provider architecture

Put all provider calls behind a server-only interface:

```ts
interface CoachAI {
  extractFacts(input: CoachingInput): Promise<ExtractedFacts>;
  askOrPlan(input: PlanningInput): Promise<CoachQuestion | DetailedPlanProposal>;
  createReplan(input: ReplanInput): Promise<ReplanProposal>;
  detectMemory(input: MemoryInput): Promise<MemoryProposal[]>;
}
```

Prompts, output schemas, provider code, retry policy, and test fixtures belong under a dedicated `src/lib/ai/` module. Keep secrets server-side. Store model/prompt version and validation outcome with a proposal for debugging.

## 11. Data model and history rules

### Core entities

```text
Owner/User
  ├─ Profile
  ├─ Goal (many; max 3 active core)
  ├─ MemoryItem (many)
  ├─ RoadmapVersion (many)
  ├─ WeeklyPlanVersion (many)
  │    └─ PlannedSession → PlannedActivity
  ├─ CompletedSession → CompletedActivity → ActualMetric/Set
  ├─ Conversation → Message
  ├─ AIProposal (plan, replan, memory, roadmap)
  └─ AuditEvent
```

### Non-negotiable invariants

1. Plans, completions, and proposals are separate records.
2. Accepting a changed plan creates a new version with a parent/source reference.
3. Completed sessions are never changed by replanning.
4. Future locked session/activity content is immutable to a replan.
5. Every proposal stores its input snapshot or input record references and its validation status.
6. Proposed AI facts/patterns are distinguishable from user-confirmed memory.
7. Use a `user_id` ownership relation even in the one-owner MVP.

### Suggested tables

- `profiles`, `goals`, `memory_items`
- `roadmap_versions`, `roadmap_phases`
- `weekly_plan_versions`, `planned_sessions`, `planned_activities`
- `personal_activities` (AI-created/user-edited activity definitions)
- `completed_sessions`, `completed_activities`, `actual_metrics`
- `conversations`, `messages`, `conversation_summaries`
- `ai_proposals`, `proposal_options`, `proposal_sources`
- `audit_events`

Use PostgreSQL, UUID primary keys, UTC timestamps, and ISO local dates paired with the owner's timezone. Use JSONB only for flexible validated schemas such as sport-specific targets; retain normalized records for plan/session/version relationships.

## 12. Architecture recommendation

Build a mobile-first TypeScript web monolith:

- **Next.js + TypeScript**: responsive application and server routes/actions.
- **PostgreSQL with Supabase**: persistent database, migrations, and future auth/row-level security.
- **Vercel**: hosted application deployment.
- **Zod**: browser input, API input, database-boundary, and AI-output schemas.
- **Tailwind CSS plus accessible components**: fast mobile UI implementation.
- **React Hook Form**: detailed/editable forms.
- **Vitest**: unit/integration tests.
- **Playwright**: phone-sized end-to-end testing.

Keep these layers separate:

```text
UI components
  → authenticated server routes/actions
    → domain services (goal, plan, log, memory, proposal)
      → repositories/database
    → AI adapter (only through validated input/output contracts)
```

No React component contains plan-versioning, memory, safety, or AI business rules. No client receives an AI API key.

## 13. MVP milestone sequence

### M0: Foundation, early beta, and commercial-ready core

- Initialize the repository, strict TypeScript, lint/format, test runner, and CI checks.
- Implement basic public email/password registration with verified email, minimal profile creation, and per-user authorization/row-level security. Add account recovery as a separate ticket before external MVP use.
- Set up database migrations, environment documentation, secure deployment, and separate development/production environments.
- Create a data inventory, an AI-data consent record, a deletion-capable backend design, and a privacy-policy outline.
- Add server-side AI request limits and privacy-conscious event instrumentation (without raw notes).
- Add `AGENTS.md`, ADR directory, and this plan to the repository.

**Exit:** registered and email-verified users can access only their own data; confirmation/recovery email and registration-abuse controls are approved for the hosted environment; consent and AI usage are recorded; typecheck, lint, tests, and build run locally/CI.

### M1: Goals, possibilities, and editable memory

- Mobile onboarding/coaching intake.
- Goal CRUD with priority/order validation: max 3 active core goals.
- Store availability, time limits, equipment/locations, preferences, and limitations as memory items.
- Fact-review UI so extracted information is confirmed before it becomes active.

**Exit:** the user can accurately express changing goals and constraints, and inspect/edit the stored memory.

### M2: AI-generated roadmap and 7-day plan proposal

- Implement structured AI adapter with fixtures and mocked provider tests.
- Generate a roadmap and a detailed next-seven-day proposal.
- Allow plan/session/activity edits and locks before/after acceptance.
- Store accepted version and personal AI-generated activity definitions.

**Exit:** user can discuss goals, accept a real 7-day plan, and see a rough longer-term direction.

### M3: Mobile logging and plan-versus-actual history

- Quick summary logging flow first.
- Detailed optional activity/metric logging flow.
- Support planned, partial, skipped, replaced, unplanned, and rest outcomes.
- Build session and plan version history.

**Exit:** facts of completed training are captured independently of what was planned.

### M4: Interactive replan and alternatives

- Build deterministic proposal/version/diff/acceptance flow first.
- Add AI-generated replan proposals only after these records work.
- Ask focused questions on material ambiguity; show options when there are reasonable tradeoffs.
- Enforce locks and completed-history invariants.

**Exit:** user can report a missed, easy, hard, sick, or time-constrained session and accept an explainable new 7-day plan.

### M5: Memory and coach quality

- Pattern-detection proposals with evidence and confirmation controls.
- Coach chat summaries, plan explanations on request, and memory management polish.
- Safety behavior and error/loading states.
- Mobile usability/accessibility pass.

**Exit:** memory clearly improves future plans without becoming opaque or uncontrollable.

### Later (explicitly out of early beta)

- Notifications/calendar integration
- Wearables/data imports
- Referrals, growth loops, social login, and passkeys
- User-controlled sharing, groups, shared plans/workouts
- Coach-client roles
- Subscription billing and entitlement management
- Data export/deletion UI and public privacy/support pages (required before public launch)
- Native iOS/Android client, push notifications, offline mode, and watch integrations
- Specialized sport capability packs and analytics

## 14. Acceptance criteria for the first complete vertical slice

The first end-to-end slice should be: **an owner creates up to three prioritized goals and constraints, receives a 7-day AI plan proposal, accepts it, logs a session, then requests and accepts a replan.**

It is done only when:

1. It works at a 390px-wide mobile viewport, with one registered and verified user unable to access another user's data.
2. The user can create core and supporting goals; attempting a fourth core goal produces a clear validation message.
3. The plan is dated, contains generic activities appropriate to the selected data, and shows goal allocation.
4. The user can lock one upcoming session/activity.
5. The user can log a session as partially completed with an effort score and free-text note.
6. Replan cannot change the completion record or locked content.
7. Replan presents a side-by-side diff and at least one alternative when a meaningful tradeoff exists.
8. Accepting the replan creates a new plan version; the previous plan remains viewable.
9. All AI plan payloads are schema-validated and rejected safely on failure.
10. The core flow has automated unit tests and a Playwright happy-path test.
11. The flow records AI-data consent and emits only privacy-safe product events.

## 15. Agent operating protocol

### Lead agent

- Read this file fully before choosing stack details or creating tickets.
- Maintain a backlog of small vertical slices.
- Create an ADR for decisions that affect future architecture.
- Do not authorize broad refactors while implementing a feature.
- Check every handoff against task acceptance criteria.
- Treat product-owner approval of a dependency-ready ticket as authorization to dispatch it immediately: record `in development`, assign one builder, and start without requesting a second confirmation.
- Automatically assign an independent reviewer after the builder handoff; involve the product owner again only for a material decision, a genuine blocker, or final acceptance.

### Builder agent

- Implement only one approved ticket.
- Inspect `AGENTS.md` and relevant existing code before edits.
- Add/update tests for changed domain behavior.
- Report changed files, commands run, results, and known limitations.

### Reviewer/QA agent

- Verify tests and actual diff against acceptance criteria.
- Prioritize history/versioning, mobile usability, authorization, malformed AI output, locks, and plan-versus-actual behavior.
- Return either approval or focused correction tasks; do not start unrelated work.

### Collaboration rules

1. One agent owns a feature area at a time.
2. Use isolated Git worktrees for genuinely independent parallel tasks.
3. Do not place AI calls directly in UI components.
4. Do not add a global exercise library merely for convenience; use the personal AI-generated activity model.
5. Do not call a feature done without running the stated checks.

### 15.1 Collaborative development and decision protocol

FitTip is developed through short, reviewable vertical slices. The product owner approves product behavior before it is built and accepts the resulting behavior before the next dependent slice starts. This plan remains the source of truth for product direction. Feature briefs, ADRs, tickets, and validation records make individual decisions traceable without silently changing this plan.

The builder may choose a reversible implementation detail that has no user-visible, privacy, cost, data-model, or future-architecture consequence. All other meaningful decisions are explicitly surfaced with a recommendation and alternatives. The builder must never silently expand product scope.

Keep the following repository structure:

```text
docs/
  product/       # approved feature briefs and user journeys
  decisions/     # ADRs for consequential technical/product decisions
  backlog/       # prioritised, small implementation tickets
  validation/    # test scenarios, demo evidence, known limitations
```

Every feature brief states: user problem, intended outcome, user flow, affected data and rules, open decisions with a recommendation, non-goals, acceptance criteria, and validation plan. Every ADR states: status, context, decision, alternatives, consequences, reversal approach where relevant, and product-owner approval reference. Every ticket links to its approved feature brief and ADRs.

| Decision class | Examples | Required handling |
|---|---|---|
| Product approval | user flows, labels, coach behavior, defaults, feature scope | Product-owner approval before implementation |
| Safety/privacy/cost approval | data collection, consent language, AI provider/model, retention, external services | Product-owner approval before implementation |
| Architectural approval | auth model, schema ownership, API boundary, deployment | ADR plus product-owner approval before implementation |
| Reversible implementation detail | internal file layout, component names, test helpers | Builder decides; record only if useful |

Feature lifecycle:

1. **Draft:** Produce a feature brief and list every material open decision.
2. **Approved:** The product owner confirms the brief and decisions; only then may dependent implementation start.
3. **In development:** Implement the approved scope and raise material discoveries immediately.
4. **Testable:** Provide a mobile demo path, automated-test results, changed-data notes, and known limitations in a validation record.
5. **Accepted:** The product owner confirms visible behavior and agreed criteria; follow-up changes become new tickets.

Approval is the automatic dispatch trigger. When a ticket's dependencies are satisfied, the lead agent moves it directly from **approved** to **in development**, assigns one builder, and begins delivery. After the builder handoff, the lead agent assigns an independent reviewer without waiting for another product-owner instruction. The product owner is not responsible for operationally starting approved work.

Review a feature brief before each independently valuable slice. Demonstrate every user-visible flow at a 390px mobile viewport before requesting acceptance. Review database migrations, authorization, consent, AI data flow, and new external services before they reach a shared or production environment. At handoff, provide changed files, commands/tests run, results, known limitations, and the exact acceptance decision requested. No feature is complete merely because code exists or a happy path works.

Before application-feature implementation, complete and approve: the M0 architecture decision brief; an M0/M1 backlog of independently testable tickets; `AGENTS.md` containing the invariants and this protocol; and the first feature brief for public email/password registration and an isolated username-free profile.

## 16. First prompt for the lead Codex agent

```text
You are the technical lead for FitTip. Read REVISED_PRODUCT_PLAN.md completely.

The repository is new. Do not attempt to build the whole application.

First, inspect the repository and produce a concise implementation plan for M0 and M1 only. Create:
1. AGENTS.md with the product invariants and collaboration rules from the plan.
2. An ADR proposing the exact stack, public email/password authentication approach for cross-device use, database access pattern, consent/deletion design, and test commands.
3. A prioritized set of small tickets for M0 and M1. Every ticket must state scope, non-goals, acceptance criteria, and test plan.

Make reversible defaults where the plan does not prescribe a detail. Flag only decisions that cannot be safely inferred.

Do not implement application features until this planning output is reviewed. Preserve the required product properties: sport-agnostic plans, up to three core prioritized goals, editable inspectable memory, AI-created personal activities rather than a global exercise catalog, explicit proposal acceptance, locks, and immutable planned-versus-actual history.
```

## 17. Remaining decisions worth making before M2

These do not block foundation work, but should be decided before generating real plans:

1. Default measurement units: metric, imperial, or selected during intake.
2. Which registration-abuse protection and transactional email provider are acceptable before public hosted registration is enabled.
3. Whether chat can create a plan automatically after the user confirms facts, or always requires a visible “Generate plan” action. Recommendation: visible action.
4. The maximum daily time/session duration and maximum weekly days that the planner may propose by default.
5. The exact pain/illness threshold at which the app pauses planning and directs the user to professional help.
6. Whether the initial AI provider/model is chosen for quality, cost, or existing access; keep the adapter provider-neutral regardless.

## 18. Explicit non-requirements for now

Do not delay the core loop for referrals, reminders, billing, social sharing, groups, coaching roles, wearable integrations, native-app packaging, social login/passkeys, or a polished exercise-media library. Stage public account recovery after the basic local authentication slice but complete it before external MVP use. Do not defer authenticated user isolation, consent, privacy-ready data handling, or AI-cost observability. Build the trustworthy personal coach loop first: goals and memory → proposal → actual log → interactive replan → versioned history.
