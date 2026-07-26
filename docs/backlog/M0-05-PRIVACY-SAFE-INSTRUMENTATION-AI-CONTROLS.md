# M0-05: Privacy-safe instrumentation and AI request controls

**Status:** proposed - not approved for implementation

**Milestone:** M0

**Priority:** P0

**Depends on:** [M0-02 accepted](M0-02-DATA-AUTHORIZATION-FOUNDATION.md),
[M0-02-C1 accepted](M0-02-C1-REMOVE-USERNAME.md), and the
[M0-04 design accepted](M0-04-PRIVACY-CONSENT-DELETION-DESIGN.md)

**Current dependency state:** M0-02 and M0-02-C1 are accepted. M0-04 remains
proposed, so this ticket is not dependency-ready.

**Blocks:** M0-06, any friend/hosted/external AI request, and any external
product-event sink. Owner/synthetic local AI is separately gated by ADR-006
and M2-01.

## Outcome

Create a server-only, provider-neutral contract for privacy-safe product events
and controlled AI requests. The implementation authorized by this brief would
be limited to schemas, policy interfaces, deterministic in-memory/test
adapters, safe error behavior, and automated tests.

It would not send a production AI request, select a model, persist a new record,
or send telemetry to an external service. The result gives later product
features one reviewed boundary instead of allowing each feature to invent its
own analytics fields, consent check, rate limit, budget rule, or AI audit
format.

This ticket remains the pre-friends/hosted production-shaped control gate.
[ADR-006](../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md) and M2-01 may establish a
smaller owner/synthetic local boundary first; that local slice does not accept,
implement, or replace M0-05.

## Dependency and authorization boundary

M0-04 is a design ticket only. Accepting its design would not authorize consent
or deletion schema, a consent UI, a privileged deletion operation, processor
configuration, or an external data transfer.

M0-05 can implement pure contracts and local/test adapters after the M0-04
design is accepted. This dependency applies to M0-05 itself, not to the
separately approved ADR-006/M2-01 local-owner slice. A real effective-consent
lookup, persistent event or AI
audit store, deletion worker, analytics sink, or production AI path also needs
the later privacy implementation brief identified by M0-04. That implementation
ticket does not yet exist in the backlog. The lead agent must decide whether to
add it and where it sits in the dependency graph; this draft does not create or
approve it.

If the accepted M0-04 design requires a persistent subject mapping, consent
event store, deletion marker, or audit record before even the contract-only
slice is useful, M0-05 returns to planning and adds that accepted
implementation ticket as a dependency. Design acceptance must never be treated
as schema or UI authorization.

## Scope

### 1. Product-event policy boundary

Define and test:

- an exact event-name and property allowlist;
- a default-deny schema parser that strips nothing silently and rejects the
  whole event when an unknown field is present;
- an authenticated, user-scoped pseudonymous subject boundary;
- a server-only collector and sink interface;
- retention and per-subject deletion hooks;
- environment and release separation;
- bounded, non-blocking behavior when collection is unavailable; and
- tests proving that forbidden content cannot enter a valid event.

### 2. AI request-control boundary

Define and test:

- verified authentication and independent owner authorization;
- an effective AI-consent gate supplied by a server-only dependency;
- per-user and per-operation rate-limit interfaces;
- concurrency, input-size, time, retry, and budget controls;
- schema-validated request and response envelopes;
- idempotency and correlation behavior;
- privacy-safe technical telemetry and audit records; and
- fail-closed behavior before any provider adapter could be invoked.

### 3. Local and test implementation

The ticket may add:

- TypeScript schemas and types;
- pure policy functions;
- injected clocks and deterministic identifiers;
- bounded in-memory counters and sinks used only by tests/local development;
- a fake AI adapter that returns fixtures and never uses a network; and
- architecture tests proving browser-reachable modules cannot import the
  server-only controls.

## Non-goals

- No analytics SDK, cookie, browser beacon, tag manager, tracking pixel,
  session replay, fingerprinting, advertising identifier, or external
  telemetry sink.
- No production AI provider, model selection, prompt content, prompt template,
  API key, network request, streaming response, retry integration, or provider
  account.
- No migration, table, RLS policy, queue, cache, cron job, durable limiter,
  audit store, consent store, deletion store, or subject-mapping store.
- No user-facing consent, privacy, analytics, AI, quota, or cost UI.
- No approval of an analytics, monitoring, hosting, AI, or key-management
  provider.
- No change to M0-04's design-only status or authorization boundary.
- No training plan, goal, memory, session, chat, or coaching behavior.

## Product-event data contract

### Common envelope

Every accepted product event uses this conceptual contract:

| Field | Rule |
|---|---|
| `eventId` | Server-generated UUID; unique per accepted event |
| `eventName` | Closed enum from the allowlist below |
| `schemaVersion` | Positive integer tied to the event schema |
| `occurredAt` | Server timestamp in UTC; never accepted from the browser as authoritative |
| `environment` | Closed enum: `local`, `test`, `preview`, or `production` |
| `release` | Non-secret commit/release identifier; no branch URL or repository token |
| `subjectKey` | Environment-scoped pseudonymous identifier; never raw Auth `user_id`, email, or profile data |
| `correlationId` | Optional server-generated request correlation identifier; never placed in a public URL |
| `properties` | Exact per-event allowlisted object; unknown or nested extra fields reject the event |

The browser may request that a product action occur. It may not construct or
send the final analytics envelope. The authenticated server derives the event
name from the completed domain outcome, derives the subject from verified Auth
identity, selects allowed properties, and assigns time/environment/release.

### Event allowlist

Properties not listed are forbidden. Counts are non-negative bounded integers.
Enums are closed and versioned.

| Event | Allowed event-specific properties |
|---|---|
| `signup_completed` | `authMethod: "email_password"` |
| `intake_completed` | `completionMode: "initial" \| "resumed"` |
| `goal_created` | `priority: "core" \| "supporting"` |
| `goal_priority_changed` | `fromPriority`, `toPriority`; both use the priority enum |
| `plan_proposed` | `proposalKind: "initial" \| "replan"` |
| `plan_accepted` | `proposalKind` |
| `plan_edited` | `proposalKind` |
| `plan_discarded` | `proposalKind` |
| `session_logged` | `status: "completed" \| "partially_completed" \| "skipped" \| "replaced" \| "rest"` |
| `replan_requested` | no event-specific properties |
| `replan_proposed` | no event-specific properties |
| `replan_accepted` | no event-specific properties |
| `replan_discarded` | no event-specific properties |
| `coach_question_answered` | no event-specific properties |
| `memory_proposed` | no event-specific properties |
| `memory_confirmed` | no event-specific properties |
| `memory_rejected` | no event-specific properties |
| `ai_request_completed` | `operation`, `outcome`, `latencyBucket`, `inputSchemaVersion`, `outputSchemaVersion`, `promptVersion`, `providerCode`, `modelCode`, `tokenUsageState`, `costState`, `validationResult` |

The M1-M5 tickets may propose new event versions or properties. They may not
reuse a free-form field or append properties at runtime. Sport/domain, goal
title, activity name, plan/session counts, text length, pain flags, and memory
type are intentionally absent because they can expose or enable inference about
a person's training or health.

### Denylist

The parser, unit fixtures, reviews, and secret scans must explicitly reject or
detect:

- email, password, password hash, confirmation/recovery code, PKCE verifier,
  access token, refresh token, cookie, authorization header, API key,
  connection string, SMTP credential, or deployment-protection secret;
- raw Supabase Auth `user_id`, profile identifier, name, address, IP address,
  user agent, device identifier, fingerprint, location, referrer URL, query
  string, or full route containing identifiers;
- raw notes, chat messages, prompts, model responses, goal titles, activity
  names, plan content, memory content, reasons, explanations, free text, or
  uploaded content;
- pain, illness, injury, fatigue, sleep, mood, stress, body-composition, or
  other health-adjacent values or derived labels;
- provider request/response bodies, raw provider errors, stack traces with user
  input, database rows, export contents, or deletion details; and
- arbitrary nested objects, arrays, dynamic keys, or caller-supplied metadata.

A hash of low-entropy or sensitive content is still forbidden. It can permit
dictionary recovery or stable cross-context tracking and is not a safe
substitute for minimization.

## Pseudonymous identity boundary

The event contract exposes only `subjectKey`. The implementation must inject a
`SubjectKeyService` and must not let a client choose the key.

Two designs remain for product-owner/privacy/architecture approval:

1. **Recommended for a later persistent implementation:** a random,
   environment-specific subject key stored in a user-owned mapping with
   least-privilege access and an explicit deletion path. This supports key
   rotation and per-subject deletion but requires a separately approved
   migration and privacy implementation.
2. **Alternative:** a versioned keyed derivation from `user_id` using an
   environment-specific server secret. This avoids a mapping table but requires
   secure historical-key handling to delete old events and creates additional
   linkability/rotation risk.

For M0-05 contract tests, an injected deterministic fake may return synthetic
keys. It must never receive real user data, persist between test runs, or imply
that either production design is approved.

Subject keys, event stores, and correlation identifiers are isolated by
environment. Preview/test events must never be merged into a production user
history. Anonymous operational traffic is not assigned a stable product
subject and is handled only under the separately approved security-log policy.

## Collection, retention, deletion, and failure behavior

### Server-only interfaces

The implementation should expose the equivalent of:

```ts
interface ProductEventPolicy {
  validate(candidate: unknown): ProductEvent;
}

interface ProductEventSink {
  emit(event: ProductEvent): Promise<void>;
  deleteSubject(subjectKey: string): Promise<DeletionResult>;
}
```

An external sink must additionally prove:

- authenticated ingestion;
- environment and tenant isolation;
- idempotency by `eventId`;
- deletion by `subjectKey`;
- a documented retention control;
- access logging and least privilege; and
- a contract/DPA, region, transfer, subprocessor, secondary-use, and cost
  decision accepted through M0-04 and a later implementation brief.

### Retention proposal

No duration is approved by this draft. The recommendation for product/legal
review is:

| Category | Proposed default | Approval note |
|---|---:|---|
| Raw allowlisted product events | 30 days | Must align with the M0-04 inventory, purpose, legal basis, and deletion design |
| AI technical request records | 30 days | No raw AI input/output; extend only for a documented operational need |
| Aggregates | 90 days | Only approved coarse aggregates with a re-identification review |
| Local/test in-memory buffers | Process lifetime | Clear on restart and after each automated test |

The effective configuration must have an expiry mechanism, a testable purge
hook, and a per-subject deletion hook. A provider without deletion and
retention controls is not eligible.

### Event failure behavior

Instrumentation must never be required to complete signup, save a factual
user action, accept a plan, or sign out. Validation or sink failure:

- drops the product event;
- returns no raw telemetry error to the user;
- emits at most one bounded, content-free operational diagnostic through an
  approved local/server log path;
- does not retry indefinitely or spill to an unapproved durable queue; and
- cannot cause recursive logging.

The application must not silently broaden fields to make a rejected event pass.

## AI request contracts

### Request gate

Before an AI adapter could run, the server must evaluate these checks in order:

1. Verify the current authenticated claims.
2. Resolve all requested record identifiers through owner-scoped repositories
   and reject anonymous, missing, or cross-user access.
3. Read the effective AI-consent state from the approved server-only privacy
   boundary. The required consent scope and version must be current.
4. Validate operation, request schema/version, input size, context-reference
   count, and allowed date/time bounds.
5. Reserve the user's rate and concurrency allowance atomically.
6. Reserve estimated budget for the request under the approved rate card and
   account/user ceilings.
7. Bind or retrieve an idempotency record scoped to user, operation, and
   schema version.
8. Only then invoke the injected AI adapter.

In this ticket the final step uses a fake fixture adapter only. Missing,
withdrawn, stale, or unreadable consent; missing limiter/budget configuration;
ownership uncertainty; invalid input; exhausted quota; or an unavailable
required control fails closed before the adapter.

### Request envelope

| Field | Rule |
|---|---|
| `requestId` | Server-generated UUID |
| `correlationId` | Server-generated identifier shared only across approved technical records |
| `idempotencyKey` | Opaque, length-bounded key scoped server-side to user and operation; never a content hash |
| `userId` | Server-internal verified owner id; never sent as product telemetry |
| `operation` | Closed enum such as `extract_facts`, `ask_or_plan`, `create_replan`, or `detect_memory` |
| `inputSchemaVersion` | Approved schema version |
| `outputSchemaVersion` | Expected strict response schema version |
| `promptVersion` | Opaque approved prompt/template version; no prompt content |
| `consentScopeVersion` | Effective scope/version used by the gate |
| `contextReferences` | Owner-verified record ids and versions; bounded in count and never included in product analytics |
| `requestedAt` | Server timestamp |
| `deadlineMs` | Approved bounded execution deadline |
| `payload` | Strict operation-specific server schema; never logged or copied into telemetry |

Caller-supplied idempotency keys are optional. If accepted, they are validated,
bounded, and namespaced to the authenticated user. The same key with a
different operation or schema is a conflict. A completed identical request
returns the prior safe result; concurrent duplicates do not create multiple
provider calls or charges. Failed validation and denied gates never create a
replayable AI result.

### Response envelope

| Field | Rule |
|---|---|
| `requestId` | Matches the server request |
| `operation` | Matches the request operation |
| `outputSchemaVersion` | Matches the validated schema |
| `status` | `validated`, `rejected`, `denied`, or `failed` |
| `proposal` | Present only after strict validation; remains a proposal and cannot directly mutate user data |
| `validation` | Coarse result and safe issue codes/field paths; never invalid raw values |
| `providerMetadata` | Approved technical identifiers only; no raw provider body |

Every model output is untrusted. It is size-bounded, parsed as the expected
structured response, schema-validated, checked against server-owned business
rules, and either returned as a proposal or rejected in full. Prose fallback is
not parsed as a plan and partial invalid content is not persisted.

## AI rate, concurrency, budget, and retry decisions

### Proposed rate defaults

These numbers are explicit recommendations, not approved configuration:

| Control | Recommended default | Behavior |
|---|---:|---|
| Per user, short window | 20 requests per rolling 10 minutes | Deny with a safe retry-after category |
| Per user, daily window | 100 requests per rolling 24 hours | Deny until capacity returns |
| Concurrent AI work per user | 1 request | Reject or return the in-flight idempotent result; do not create an unbounded queue |
| Request payload | 64 KiB serialized maximum | Reject before context construction/provider work |
| Context references | 100 maximum | Reject rather than silently truncating records |
| Provider attempts | 1 initial attempt | No automatic retry until provider-specific idempotency and billing behavior are approved |
| Execution deadline | 60 seconds | Cancel where supported and record a coarse timeout |

The product owner must approve or revise each default. Per-operation overrides
may be stricter. Raising a ceiling, adding a queue, or adding retries is a
cost/architecture change and requires review.

The interface must support an atomic `reserve`, `commit`, and `release/expire`
model so concurrent requests cannot race past a limit. In-memory counters are
valid only for deterministic tests and single-process local development. Any
shared or production limiter requires a later approved provider or migration
and must document clock source, atomicity, outage behavior, privacy, retention,
region, and cost.

### Budget behavior

The budget gate accepts an estimated upper-bound cost, currency, rate-card
version, user ceiling, environment ceiling, and remaining amount. It must:

- treat missing or stale price data as unknown, never as zero;
- deny when an estimate cannot be made under the approved policy;
- reserve before the provider call and reconcile estimated versus reported
  usage afterward;
- prevent retries or concurrency from double-spending a reservation;
- generate an alertable coarse outcome near and at the ceiling; and
- fail closed for AI while leaving non-AI account functions available.

Exact per-user daily and total monthly AI ceilings remain a product/cost
decision for the provider/model ticket. This contract must be present before
that ticket can authorize a real call.

## AI technical telemetry and auditability

The AI technical record may contain only:

- request/correlation/idempotency identifiers;
- environment and release;
- server-derived pseudonymous subject key where approved;
- operation and request/response schema versions;
- provider code, model code, prompt version, and provider API version;
- start/end timestamps and latency bucket or duration;
- provider attempt count;
- input/output/cached token counts when the provider reports them;
- cost estimate, reported cost if available, currency, and rate-card version;
- gate, provider, validation, and final outcome codes;
- safe validation issue codes and schema field paths without rejected values;
- budget/rate-limit reservation outcome; and
- deletion/retention state.

Unknown token or price information is recorded as `unknown`, not `0`. Provider
and model codes remain `fixture`/`not_called` in M0-05. Raw input, output,
prompt, note, chat, health content, secrets, headers, URLs, and provider errors
are forbidden.

An audit trail must make it possible to answer: who was authorized, which
consent scope applied, which versions and limits applied, whether any adapter
was invoked, whether output validation passed, what proposal identifier was
created later, and how deletion/retention was handled. It must not recreate the
user's content.

## Security, privacy, and cost boundary

- All controls and sinks are server-only. Client bundles receive no secret,
  budget state, raw provider error, or cross-user identifier.
- Authentication is not authorization. Every context reference is resolved
  under verified `user_id`; RLS remains the database backstop after a future
  migration.
- Event collection has a default-deny schema. AI processing has a fail-closed
  gate.
- Consent withdrawal blocks future provider-bound requests immediately after
  the approved effective-state boundary records it. It does not erase
  historical consent evidence or silently delete the account.
- Product analytics and operational/security logs remain different contracts,
  purposes, access groups, and retention schedules.
- No provider, processor, region, transfer, DPA, secondary-use term, retention
  setting, or spend is approved here.
- No AI content is used for provider training or secondary use unless a future
  provider decision explicitly approves it.

## Acceptance criteria

1. M0-04 is accepted as a design and the lead records whether a later privacy
   implementation ticket is an additional dependency.
2. Product events use the exact default-deny envelope and allowlist; unknown
   events or properties are rejected in full.
3. Tests prove every denylisted secret, identity, free-text, health, and
   provider-content category cannot enter a valid event.
4. The final event is constructed only on the authenticated server and uses no
   raw Auth `user_id` or email as `subjectKey`.
5. Local/test subjects, events, rate counters, and fixtures are isolated from
   production and cleared deterministically.
6. Event sink failure cannot fail a completed product action, recurse, or
   create an unapproved durable queue.
7. Event retention, expiry, and per-subject deletion are explicit interfaces;
   no external sink or duration is silently selected.
8. AI requests fail closed on missing authentication, cross-user references,
   ineffective consent, invalid schema, exhausted rate/concurrency, unknown or
   exceeded budget, and unavailable required controls.
9. Request and response envelopes are strict and versioned; invalid AI output
   cannot become a proposal or write user data.
10. Idempotent duplicates cannot create multiple fake-adapter invocations,
    quota charges, or budget reservations.
11. Technical telemetry records the approved versions, latency,
    token/cost-state, error/outcome, and validation result without raw content
    or secrets.
12. The browser-import boundary, unit tests, typecheck, lint, formatting,
    production build, and existing M0 regression suites pass.
13. No migration, production provider call, analytics SDK/sink, external
    account, remote configuration, secret, or cost was introduced.

## Test and validation plan

### Product-event tests

- Table-driven valid event cases for every event/version/property enum.
- Unknown event, unknown property, nested-extra, overlong value, invalid enum,
  caller timestamp/environment/subject, and malformed identifier rejection.
- Corpus tests containing emails, UUIDs, passwords, JWT-like strings,
  authorization headers, URLs, IPs, notes, chat, prompts, plan/activity text,
  and health terms in every candidate field.
- Server derivation tests proving the browser cannot choose subject, event
  outcome, environment, release, or server time.
- Duplicate `eventId`, environment isolation, retention expiry,
  `deleteSubject`, sink outage, timeout, and recursion-guard tests.

### AI control tests

- Anonymous, unverified/missing claim, owner, and cross-user reference cases.
- Granted, withdrawn, stale-version, missing, and consent-reader-outage cases.
- Short/daily window edges, concurrent race, expiry/release, operation
  override, limiter outage, and multi-instance-in-memory prohibition.
- Missing price, stale rate card, insufficient user/environment budget,
  reservation race, reconciliation, timeout, and no-double-charge cases.
- New idempotency key, replay, concurrent duplicate, changed operation/schema,
  expired key, and malformed key cases.
- Oversized request/output, excess context references, invalid JSON, unknown
  fields, schema-invalid payload, business-rule-invalid proposal, provider
  timeout, and safe error mapping.
- Telemetry snapshot tests use synthetic content and assert the complete
  denylist is absent.

### Repository checks

Run the existing exact-pinned commands plus focused new tests:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npx supabase db lint --local --level warning --fail-on warning
npx supabase db advisors --local --type all --level warn --fail-on warn
npx supabase test db --local supabase/tests/database
git diff --check
```

No network is needed for the fake AI adapter or in-memory event sink.

## Suggested implementation and handoff

Suggested ownership boundaries:

```text
src/server/instrumentation/
  product-event-schema.ts
  product-event-policy.ts
  product-event-sink.ts
  subject-key-service.ts
src/lib/ai/
  contracts/
src/server/ai/
  request-gate.ts
  rate-limit-policy.ts
  budget-policy.ts
  usage-recorder.ts
  fixture-adapter.ts
```

Names are reversible. The important boundary is that browser modules cannot
import server collectors, subject-key services, consent readers, budget state,
or AI adapters.

The builder handoff must include:

- exact branch/commit and changed files;
- accepted decision values and any ADR;
- contract and denylist summary;
- proof that only in-memory/test adapters exist;
- exact commands/results and regression counts;
- synthetic leakage/secret-scan evidence;
- rate/concurrency/idempotency/budget race evidence;
- confirmation of no migration, network AI call, analytics SDK/sink, external
  resource, secret, or cost;
- known limitations; and
- the exact request to accept M0-05 or return focused corrections.

An independent reviewer must inspect the contract for field creep, attempt to
inject denylisted data, and verify that every denied AI request stops before
the fake adapter.

## Open decisions

### Product and analytics

1. Approve the event names and exact properties, including whether
   `intake_completed` belongs in the initial allowlist before M1.
2. Decide whether product analytics is enabled by default for early beta,
   consent-based, or disabled until a later analytics notice decision.
3. Approve the proposed 30-day raw-event and 90-day aggregate durations, or
   choose alternatives after M0-04 legal/privacy review.

### Privacy and data architecture

4. Choose random persisted subject mapping (recommended) or versioned keyed
   derivation, and approve the required deletion/rotation design.
5. Decide whether M0-05 needs the missing privacy implementation ticket before
   contract implementation or only before persistent/production use.
6. Approve the exact deletion response, retention enforcement, aggregate
   threshold, and access roles for future event and AI technical records.

### AI rate, budget, and reliability

7. Approve or revise 20 requests/10 minutes, 100 requests/24 hours, and one
   concurrent request per user.
8. Approve or revise the 64 KiB input, 100 context-reference, one-attempt, and
   60-second limits.
9. Set per-user daily and total monthly AI cost ceilings when a provider/model
   is proposed; approve fail-closed behavior when cost is unknown.
10. Decide whether future transient retries are allowed and, if so, under
    which provider idempotency/billing guarantees.

### Provider and storage

11. Keep external analytics, limiter, audit storage, monitoring, AI provider,
    and model unselected until separately approved.
12. Decide which material choices require an ADR before an implementation
    ticket becomes dependency-ready.

## Current primary sources reviewed

- [Supabase changelog - breaking changes](https://supabase.com/changelog?types=breaking-change)
- [Supabase secure product configuration](https://supabase.com/docs/guides/security/product-security)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [OWASP API4:2023 - Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)

The 26 July 2026 changelog review found relevant platform changes to default
Data API exposure and free-tier Auth email-template customization. Neither
change authorizes an external service or alters this contract-only scope.

## Approval gate

The product owner must:

1. accept the completed M0-04 design;
2. resolve or assign the open product/privacy/cost/architecture decisions;
3. decide the missing privacy implementation dependency;
4. approve this exact contract-only scope; and
5. approve any required ADR.

Only then may the lead mark M0-05 `approved`; it becomes `in development` only
when all recorded dependencies are satisfied. Approval remains local/test-only
and does not authorize a migration, real AI call, provider/model, analytics
sink, hosted limiter, external telemetry, secret, account, or spend.
