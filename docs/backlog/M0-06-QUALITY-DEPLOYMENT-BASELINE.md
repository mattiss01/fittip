# M0-06: Quality and deployment baseline

**Status:** proposed - not approved for implementation

**Milestone:** M0

**Priority:** P0

**Depends on:** [M0-03 accepted](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md),
[M0-03B accepted](M0-03B-ACCOUNT-RECOVERY.md),
[M0-04 design accepted](M0-04-PRIVACY-CONSENT-DELETION-DESIGN.md), and
[M0-05 accepted](M0-05-PRIVACY-SAFE-INSTRUMENTATION-AI-CONTROLS.md)

**Current dependency state:** Only M0-03 is accepted. M0-03B, M0-04, and M0-05
remain proposed.

**Blocks:** external registration, friend/external MVP use, commercial use,
and production. It does not block approved owner/synthetic local work under
ADR-006 or disposable founder-hosted work under ADR-007/M0-06A.

## Outcome

Establish a repeatable quality, environment, deployment, and operational
baseline for FitTip's first hosted release. The baseline must prove that the
accepted local authentication and authorization work survives a protected
hosted environment without mixing production and test data, leaking secrets,
or opening registration before recovery, privacy, email, abuse, and validation
gates pass.

This brief exposes the decisions needed to create remote resources. It does not
select or create a hosting account/project, Supabase project, source-control or
CI service, SMTP provider, sender domain, CAPTCHA provider, monitoring service,
analytics service, DNS record, secret, paid plan, or external user.

ADR-001 accepts Next.js/Vercel and Supabase as the architecture direction. That
does not identify an account, team, organization, project reference, region,
plan, integration, domain, or billing owner. Those exact remote choices remain
inside this ticket's approval gate.

[ADR-006](../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md) permits independently
approved local M1/M2/M3 development. ADR-007 and M0-06A separately permit one
disposable founder-hosted environment with only the product owner or synthetic
data. That narrow environment satisfies no M0-06 criterion and may not add an
external user, public registration, commercial use, production claim,
analytics sink, paid plan, or unlisted remote resource.

## Dependency and external-registration gate

M0-06 cannot become dependency-ready until M0-03B, the M0-04 design, and M0-05
are accepted. M0-04 acceptance is design-only and does not authorize the
privacy schema or user-facing privacy behavior needed for a hosted external
flow.

Before external registration is enabled, the lead must identify and obtain
approval for the later privacy implementation ticket required by M0-04. That
ticket must implement at least the accepted notice/AI-consent boundary and any
deletion-capable records/operations that M0-04 makes mandatory for external
use. The missing ticket is an open dependency/decision, not silently part of
M0-06.

The production registration control remains disabled, closed, or otherwise
inaccessible to external users until all of these are true:

1. M0-03B recovery is accepted and passes hosted confirmation/recovery email.
2. M0-04 is accepted and its required external-use privacy implementation is
   accepted.
3. M0-05 is accepted and any persistent controls required for external use are
   implemented through an approved dependency.
4. A custom Auth SMTP path and exact sender domain are approved and validated.
5. Auth rate limits and a CAPTCHA/bot-risk decision are approved and tested.
6. Redirect allowlists, environment separation, headers, logs, alerts,
   backup/rollback, and access controls pass this ticket.
7. The consolidated M0 validation record is independently reviewed.

No preview URL, unadvertised URL, or "small beta" label bypasses this gate.

## Scope

### Quality and release controls

- CI gates for dependency installation, formatting, lint, typecheck, unit and
  integration tests, production build, local database reset/lint/advisors,
  pgTAP authorization tests, and 390px browser tests.
- A protected preview/staging release path with synthetic accounts and data.
- A separately approved production promotion with an auditable commit and
  migration set.
- Branch/environment protection, concurrency control, least-privilege secrets,
  and independent approval before production mutation.

### Hosted environment baseline

- Separate local, preview/staging, and production configuration.
- A production Supabase project that is never used by local or preview tests.
- A non-production Supabase project or approved isolated branching design that
  never receives production data or production credentials.
- Exact Auth Site URL and redirect allowlists.
- Custom SMTP, sender-domain/DNS, template, delivery, and abuse decisions.
- Protected hosted mobile smoke tests for signup, confirmation, sign-in,
  sign-out, recovery, privacy, and cross-user isolation.

### Operations

- Supported migration promotion and forward-fix/restore procedures.
- Backup capability and restore-drill validation.
- Security headers and cache controls.
- Privacy-reviewed operational logs, monitoring, and alerts.
- Dependency/advisory policy.
- Incident, rollback, credential-rotation, and registration-disable runbooks.
- Cost ceiling and owner/access matrix.
- One consolidated M0 validation record.

## Non-goals

- No M1 training, M2 goal/memory/intake, M3 AI, navigation, or other product
  feature.
- No production AI provider call, model, prompt, analytics SDK, external
  product-event sink, or user-content telemetry.
- No selection or creation of an email, CAPTCHA, monitoring, analytics, or AI
  service in this draft.
- No reuse, cleanup, or mutation of the unrelated Supabase project previously
  found in the connected account.
- No production-data copy into local, preview, staging, branch seed, test
  fixture, log, screenshot, or support tool.
- No self-service account settings, export, deletion UI, public marketing
  launch, native app, billing, social login, MFA product feature, or broad
  penetration test.
- No promise of legal compliance, zero downtime, instant rollback, instant
  backup erasure, or permanent service availability.

## Environment matrix

Exact project names, references, domains, regions, plans, and owners require
approval and must be recorded without secrets.

| Boundary | Web/runtime | Supabase/data | Email and Auth | Access and data |
|---|---|---|---|---|
| Local | Developer machine; local `.env.local`; no externally reachable tunnel | Local Supabase CLI/Docker only | Mailpit capture; local exact redirects | Developers; synthetic fixtures only; resettable |
| Test/CI | Ephemeral runner; no deploy secrets on untrusted changes | Fresh local Supabase stack or isolated disposable test instance | Mailpit/fake delivery only | Synthetic accounts; destroyed after run |
| Preview | Protected deployment for a reviewed commit | Dedicated non-production project or approved isolated preview branch; unique endpoint/keys | No real recipient delivery unless an approved sandbox/allowlist is used | Team/reviewer only; synthetic data; no external signup |
| Staging | Protected stable release candidate | Dedicated non-production project or approved persistent branch, isolated from production | Approved test sender and recipient allowlist | Named reviewers; synthetic data; reset/reseed procedure |
| Production | Approved domain and release; registration initially disabled | Dedicated production project with separate credentials, region, backups, and access | Approved custom SMTP, verified domain, confirmation and recovery templates | Approved operators and invited test identities only after every gate passes |

Preview/staging must never point to the production Supabase URL, database,
Storage, Auth tenant, SMTP credential, subject-key secret, or monitoring
dataset. Production must never use local Mailpit, seed data, shared preview
keys, wildcard test recipients, or preview redirect origins.

### Supabase environment options

The product owner must choose one of these after current plan/cost review:

1. **Recommended isolation:** a dedicated non-production Supabase project for
   staging plus a separate production project. Preview runs against local CI or
   approved isolated branches under the non-production boundary.
2. **Higher-isolation option:** dedicated preview/staging and production
   projects, with no branching dependency.
3. **Branching option:** use Supabase preview/persistent branches only after
   confirming current plan cost, branch lifecycle, configuration deployment,
   migration rollback behavior, unique credentials, and hosting-integration
   race handling.

All options keep production separate. A branch with a unique endpoint is still
not permission to copy production user data. The selected environment topology
is consequential architecture/cost and requires an ADR or an explicit
extension of ADR-001.

## CI quality gates

CI provider and repository integration remain open decisions. Any approved
system must implement the following behavior:

| Gate | Required behavior |
|---|---|
| Source | Run on every pull request and protected release branch; use the reviewed commit |
| Install | Selected Node/npm versions; `npm ci`; committed lockfile; install scripts remain controlled |
| Format | `npm run format:check` |
| Static quality | `npm run lint` and `npm run typecheck` |
| Application tests | `npm run test:run` with deterministic, network-free unit/integration tests |
| Production build | `npm run build` with environment-safe configuration validation |
| Local database | Start supported local Supabase; reset all migrations from zero |
| Database quality | Database lint and security/performance advisors fail on configured warnings |
| Authorization | Full pgTAP owner/anonymous/cross-user suite |
| Browser | Local 390px auth/recovery/privacy smoke with Mailpit/fakes |
| Dependency change | Lockfile diff and dependency review; new unresolved critical/high issues block |
| Secrets | Secret-pattern and tracked-environment scan; synthetic leak corpus |
| Docs | Scoped Markdown formatting, relative-link and table validation |

### CI security rules

- Pull requests from untrusted contexts receive no preview, production,
  database, SMTP, CAPTCHA, bypass, or monitoring secret.
- Workflow/action dependencies are version-pinned; if the selected CI supports
  immutable commit pinning, use it and record update ownership.
- User-controlled branch, issue, commit, or pull-request text is never
  interpolated into a privileged shell command.
- Preview and production deployment jobs use separate protected environments,
  separate secrets, minimum token permissions, and serialized production
  concurrency.
- Production promotion requires an explicit named approval after preview or
  staging evidence. A passing pull request alone cannot mutate production.
- Logs and artifacts are treated as potentially accessible records; they do
  not contain environment values, email addresses, tokens, Auth links,
  passwords, database dumps, or browser storage.
- CI artifacts have an approved short retention and are deleted on expiry.

## Protected preview and staging

- All preview/staging routes are protected by an approved access-control method
  that does not rely on secrecy of the URL.
- Access is limited to named team/reviewer identities. Share links and
  automation-bypass credentials are scoped, revocable, and never placed in a
  public issue, URL screenshot, or test output.
- Automated tests pass any bypass secret in an approved header where supported,
  not a query string.
- Preview comments, screenshots, logs, and recordings contain synthetic
  accounts only.
- Preview/staging registration cannot send mail to arbitrary recipients.
- Preview/staging robots indexing is disabled as defense in depth; this is not
  the access-control mechanism.
- Branch teardown deletes or expires associated synthetic data, keys, and
  deployment access.
- A provider limitation that leaves preview or staging publicly reachable is a
  blocker or a separately accepted risk, not an implicit default.

## Configuration and secret handling

### Configuration inventory

For every environment, record:

- variable name and purpose;
- public versus secret classification;
- environment scope;
- service/system owner;
- where it is stored;
- who can read/change it;
- creation and last-rotation date;
- rotation/revocation procedure;
- whether redeployment is required; and
- evidence that it is absent from client bundles, logs, artifacts, and Git.

`NEXT_PUBLIC_` values may contain only deliberately public browser
configuration such as the environment-specific Supabase URL and publishable
key. Secret/`service_role` keys, database passwords/URLs, management access
tokens, SMTP credentials, CAPTCHA secrets, deployment-bypass secrets, and
monitoring ingestion credentials are server/deployment secrets and never use
that prefix.

### Secret rules

- Use platform environment stores only after the platform and access policy are
  approved. Local secrets stay in ignored local files.
- Prefer short-lived or workload identity over personal long-lived tokens when
  the selected provider supports it.
- Scope credentials to one environment and minimum action; production and
  non-production never share a credential value.
- Mark secrets non-readable after creation where supported.
- Do not echo secrets, run shell tracing around them, serialize complete
  environment objects, or upload `.env` files as artifacts.
- Rotate after suspected exposure, operator removal, or scope change; record
  only the rotation event, never the value.
- Production access requires MFA on provider accounts. Shared human accounts
  are prohibited.

## Supported migration promotion

### Promotion path

1. Create each schema change through the installed Supabase CLI's supported
   migration command after checking current `--help`.
2. Apply every migration from zero locally with an explicit local target.
3. Run database lint, advisors, pgTAP, generated-type reproducibility, and the
   application suite.
4. Review the SQL for privileges, RLS, ownership predicates, locks,
   irreversibility, data transformation, estimated duration, and rollback.
5. Apply the exact committed migrations to the approved non-production target
   using an explicit target flag/project reference and protected credentials.
6. Record migration-list/checksum evidence and run hosted authorization,
   recovery, privacy, and application smoke tests.
7. Take or verify the approved pre-production backup/restore point and
   production rollback plan.
8. Promote the same reviewed commit and migration set to production through a
   serialized, approved deployment job.
9. Re-run migration-list, advisors, owner/cross-user checks, application smoke,
   and monitoring verification.

Auth, SMTP, redirect, CAPTCHA, plan, backup, and hosting settings are not
assumed to be database migrations. The implementation must maintain a
versioned, non-secret configuration manifest/checklist and compare each remote
environment against it. Dashboard-only changes need change-owner, timestamp,
before/after evidence, and rollback instructions.

### Rollback and forward correction

- Application rollback redeploys the last known-good immutable release only
  when its schema compatibility is proven.
- Applied migration history is never edited. Ordinary schema correction uses a
  new reviewed forward migration.
- Every risky migration states whether it is backward compatible, how long old
  and new application versions may overlap, and the point after which app
  rollback is unsafe.
- Destructive schema/data changes require a separately approved expand-migrate-
  contract sequence, backup, restore test, and product/data decision.
- Database restore is a disaster-recovery operation, not a routine migration
  rollback. It can cause downtime and data loss after the restore point.
- Registration and AI can be disabled independently during rollback without
  deleting user history.

## Backup and restore validation

Before production data is accepted:

- identify the selected plan's actual backup type, schedule, retention,
  restore granularity, storage coverage, region, access roles, and cost;
- define approved recovery point and recovery time objectives;
- confirm whether Storage objects, Auth configuration, environment variables,
  SMTP/CAPTCHA settings, and external processor data are excluded;
- document a logical export path if required and protect exports as secrets;
- perform a restore drill into an approved isolated non-production target;
- verify migrations, RLS, Auth/profile ownership, checksums/counts using
  synthetic data, and application smoke after restore;
- record downtime and actual recovery timing; and
- reapply completed deletion markers/operations before restored data could
  serve users, as required by M0-04.

Backup contents must not be downloaded to a developer laptop or copied to a
preview environment without separate approval. Backup restoration does not
restore deleted Storage objects according to current Supabase documentation,
so Storage requires its own future backup/deletion design when used.

## Auth email, domain, and deliverability decision

Supabase's built-in hosted sender is development-only, recipient-restricted,
rate-limited, and not an acceptable external-beta dependency. Current
documentation also restricts template customization for new free projects
using default SMTP.

Before external registration, approve:

1. exact transactional email provider and account owner;
2. provider role, subprocessors, region, retention/deletion, DPA/terms,
   secondary use, access, incident path, and recurring/usage cost;
3. sender domain/subdomain, `From`, sender name, `Reply-To`, and support route;
4. DNS ownership and SPF, DKIM, and DMARC records/policy;
5. Supabase custom SMTP host/port/security and credential rotation;
6. confirmation, recovery, and password-change notification templates,
   including exact callback host/path and generic safe copy;
7. bounce, complaint, suppression, and delivery-failure behavior without
   exposing account existence;
8. delivery log fields, access, retention, deletion, alerts, and support
   evidence;
9. approved hourly/daily provider and Supabase limits; and
10. successful delivery/link validation across representative external mailbox
    providers chosen by the product owner.

Options are:

- an approved dedicated transactional provider exposed through custom SMTP
  (recommended);
- another approved SMTP-compatible service with equivalent domain,
  deliverability, privacy, deletion, security, and cost controls; or
- keep external registration disabled.

No vendor is selected by this draft.

## Auth URL and redirect allowlists

- Production `SITE_URL` is the exact approved HTTPS application origin.
- Production additional redirects use exact origins and callback paths. Broad
  `**` wildcards, arbitrary `next` parameters, localhost, preview domains, and
  non-HTTPS origins are absent.
- Local redirects are configured only in local `config.toml`.
- Preview/staging origins are limited to the protected environment and are
  never added to the production allowlist unless an exact risk-reviewed pattern
  is unavoidable.
- Confirmation and recovery templates use the approved redirect variable and
  fixed callback route. The application independently validates same-origin
  destinations and strips Auth parameters from final URLs.
- Redirect configuration is covered by valid, expired, reused, wrong-host,
  wrong-path, wildcard-bypass, and open-redirect tests.
- Environment configuration evidence records origins/paths, never live tokens
  or complete emailed Auth links.

## Auth rate limits and CAPTCHA/bot protection

Supabase Auth endpoint limits and SMTP-provider limits are necessary but do not
by themselves decide the acceptable public-signup risk.

The product owner must choose:

1. **Recommended:** enable one currently supported CAPTCHA/bot-protection
   provider for signup, sign-in where risk warrants, and password recovery;
   approve its accessibility fallback, privacy/processor terms, cookies or
   device signals, region, retention, outage behavior, bypass handling, domain
   allowlist, and cost.
2. Keep registration closed to external users while operating without a
   CAPTCHA provider.
3. Explicitly accept a narrowly defined initial external-beta risk with
   documented Supabase/SMTP rate limits, monitoring, manual disable capability,
   and review date. This option still requires all other M0-06 gates and may be
   rejected by the privacy/security review.

Current Supabase documentation supports hCaptcha and Cloudflare Turnstile; this
statement lists platform options and does not approve either provider.

For the selected option:

- record exact current Auth limits for signup, confirmation, recovery,
  verification, and token refresh;
- tune only after expected beta usage and email-provider capacity are known;
- test ordinary use, bursts, 429 handling, generic enumeration-safe responses,
  CAPTCHA failure/expiry/replay, and provider outage;
- keep CAPTCHA secret verification server/provider-side;
- never log CAPTCHA tokens, IP/device signals, passwords, emails, or raw
  provider errors; and
- provide a one-action runbook to disable new registration while preserving
  existing-user sign-in/recovery as the incident permits.

## Hosted 390px validation

All browser tests use `390x844`, HTTPS, the protected hosted origin, synthetic
accounts, and the exact release candidate.

### Auth and recovery

1. Create an account and verify the generic submitted state.
2. Receive a custom-domain confirmation email at an approved test recipient.
3. Follow the exact allowed callback and reach the protected route.
4. Sign out, confirm protected-route denial, and sign in again.
5. Request recovery for known and unknown emails and compare visible
   response/status/navigation.
6. Complete recovery, require the approved fresh-sign-in/session scope, reject
   old password, and reject expired/reused/wrong-host links.
7. Verify cross-user repository and direct Data API denial with two users.

### Privacy

The accepted M0-04 implementation brief must define the exact hosted path. At
minimum the smoke must prove:

- the current privacy notice is reachable at the approved collection point;
- account access is not bundled with AI consent;
- decline/withdraw leaves non-AI account access available and blocks future
  AI-bound requests;
- notice/consent versions shown match server evidence;
- no raw content enters product events or ordinary logs; and
- the approved deletion/access route or documented manual operation is
  reachable and auditable as required for this beta stage.

M0-04 design acceptance alone cannot satisfy these tests. If the privacy
implementation ticket is absent or unaccepted, hosted external validation and
external registration stay blocked.

### Environment and delivery

- Preview/staging access control rejects an unauthenticated reviewer.
- Production and non-production Supabase identifiers differ.
- Test data, Mailpit, preview redirect, and non-production credentials are
  absent from production.
- Confirmation/recovery delivery, callback host, template, SPF/DKIM/DMARC
  results, bounce handling, and delivery alerts are recorded without exposing a
  live token or full email address.

## Security headers and transport

Implement and test an environment-aware header policy:

- `Content-Security-Policy` with a minimal actual-resource allowlist,
  `default-src 'self'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`, and `object-src 'none'`; add only exact approved
  Supabase/CAPTCHA endpoints. Use nonces/hashes rather than broad
  `unsafe-inline` where the framework supports them.
- `Strict-Transport-Security` only on the approved all-HTTPS production domain;
  `includeSubDomains` requires proof that every subdomain is HTTPS. Preload is a
  separate hard-to-reverse decision.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer` unless an approved narrower need is recorded.
- `Permissions-Policy` disabling camera, microphone, geolocation, and other
  unused capabilities.
- `X-Frame-Options: DENY` as legacy defense in depth with CSP
  `frame-ancestors`.
- private `no-store` cache behavior on credential, callback, recovery,
  consent, deletion, and protected user-data responses.

Roll out CSP in report-only mode against synthetic traffic if needed, but do
not send violation reports to an external sink without approval. The enforcing
policy and 390px Auth/privacy flows must both pass before external use.

Inspect secure cookie behavior, TLS, mixed content, open redirects, source maps,
error pages, and browser bundles. Do not claim a header prevents all
client-side vulnerabilities.

## Logs, monitoring, and alerts

### Approved-field requirement

Operational records may use only reviewed fields:

- server timestamp, environment, service/component, release, severity;
- route template (not full URL/query), method, status class, latency bucket;
- server correlation/request id;
- coarse stable error/outcome code;
- dependency name/code and health state;
- migration/release identifier and coarse result; and
- alert state and runbook reference.

The default denylist includes email, password, Auth token/link/code/verifier,
cookie/header, raw `user_id`, subject mapping, IP address, user agent, query
string, form body, note/chat/prompt/model content, health signals, database row,
provider payload/error, secret, stack trace containing input, and export or
deletion content.

Provider-native Auth, platform, email, or access logs may collect fields FitTip
cannot suppress. Before approval, inspect actual examples; add every field to
the M0-04 inventory; restrict access and retention; document deletion/export
behavior; and reject the provider/configuration if the residual collection is
not acceptable.

### Monitoring and alerts

At minimum, an approved native dashboard or sink must detect:

- deployment/build/migration failure;
- application 5xx and latency/availability degradation;
- Auth signup/sign-in/recovery/verification failure or 429 surge;
- confirmation/recovery delivery failure, bounce, or complaint surge;
- database connection, capacity, backup, restore, and advisor warning;
- RLS/authorization regression signal where safely observable;
- secret/credential expiry or integration health failure;
- product-event pipeline failure without blocking user actions; and
- future AI rate/budget/provider failure without raw AI content.

Each alert has threshold/window, environment, owner, severity, notification
route, acknowledgement target, runbook, test method, and cost. Alerting may use
provider-native facilities if approved; an external log drain or monitoring
vendor requires separate processor/privacy/cost approval.

### Retention proposal

No log retention is approved in this draft. Recommendation for M0-04
product/legal/security review:

| Record | Proposed default |
|---|---:|
| CI/deployment logs and artifacts | 14 days |
| Application operational logs | 14 days |
| Auth/security alert records | 30 days |
| Email delivery diagnostics | 14 days, subject to provider suppression obligations |
| Incident record | Duration set per legal/security need with minimized contents |

Supabase Logs Explorer retention varies by plan, and log drains add a paid
external-processing path. The selected plan must support or be configured to
the approved duration; FitTip must not copy logs indefinitely to compensate.

## Dependency and advisory policy

- Exact-pin direct dependencies and commit the lockfile.
- Use clean deterministic installs in CI.
- Review framework, Supabase CLI/SDK, browser-test, and action release/security
  notes before deployment.
- Run dependency audit and lockfile/dependency review on every change.
- Any new unresolved critical or high-severity advisory blocks merge/deploy.
- Existing findings require a named owner, exploitability assessment, available
  remediation, compensating controls, expiry/review date, and product-owner
  risk acceptance. An automated breaking downgrade is not accepted merely to
  clear a report.
- Recheck the M0-01 Next.js transitive `postcss` and `sharp` findings against
  current patched releases before M0-06 implementation. Patch if a compatible
  version exists; otherwise obtain a time-bounded exception before hosting.
- Review and pin CI actions/build images; remove unused dependencies and
  credentials.
- Dependabot or another update service is optional and requires repository,
  permission, notification, and maintenance-owner approval.

## Incident and rollback runbook

Before external use, assign owners and test a tabletop covering:

1. detection and severity classification;
2. preserve minimized evidence and open an incident record;
3. disable new registration and AI independently;
4. protect users by revoking/rotating exposed credentials and sessions where
   supported, while documenting Supabase JWT-expiry limitations;
5. contain affected deployment, database, email, CAPTCHA, or monitoring
   integration;
6. choose immutable application rollback, forward database correction, or
   disaster restore based on compatibility/evidence;
7. validate RLS, Auth/recovery, privacy gate, migrations, headers, email, and
   monitoring before reopening;
8. assess personal-data impact and route legal/regulatory/user communications
   to the approved owner;
9. reconcile deletion markers after restore; and
10. record root cause, corrective ticket, secret rotations, cost impact, and
    reopening approval.

The runbook includes contacts, provider status/support paths, domain/DNS owner,
project identifiers, backup location, last known-good release, configuration
manifest, and commands with placeholders only. Secrets and live Auth links are
never embedded.

Run at least:

- a failed deployment/migration tabletop;
- a leaked preview/production credential tabletop;
- an SMTP outage/abuse surge with registration disable; and
- a backup restore/deletion-reconciliation drill with synthetic data.

## Cost ceiling

No account, plan, add-on, or spend is approved by this draft.

Recommendation for explicit product-owner decision:

- total recurring M0 hosting/database/email/CAPTCHA/monitoring cost ceiling:
  **EUR 75 per month before tax**;
- additional usage/overage ceiling: **EUR 10 per month** with alerts before the
  threshold where provider controls permit;
- no annual commitment, automatic plan upgrade, paid branch, PITR, log-drain,
  advanced deployment-protection, or monitoring add-on without separate
  approval; and
- project creation is blocked until a current written price estimate shows the
  selected non-production and production topology fits the approved ceiling.

The product owner may revise these values. Current provider prices, included
usage, commercial-use terms, taxes, currency conversion, and cancellation
conditions must be captured on the approval date because they change.

## Access and ownership

The approval record must name:

- billing owner;
- production technical owner;
- backup/restore owner;
- domain/DNS and SMTP owner;
- security/incident owner;
- privacy/legal decision owner; and
- a recovery owner or explicit acceptance of single-owner lockout risk.

Required controls:

- MFA for all provider/source-control accounts with production access;
- no shared human accounts;
- least-privilege roles and separate billing versus deployment authority where
  practical;
- protected production changes and audited access review;
- two recovery-capable owners where provider/organization structure and cost
  permit, otherwise a documented break-glass/recovery plan;
- immediate access removal and credential rotation when an operator leaves;
  and
- quarterly access/secret review during beta, or a product-owner-approved
  alternative cadence.

## Consolidated M0 validation evidence

Create `docs/validation/M0-VALIDATION.md` only during approved implementation.
It must link existing M0-01, M0-02, and M0-03 evidence plus accepted M0-03B,
privacy implementation, M0-05, and M0-06 records.

It records:

- exact release commit, immutable deployment identifiers, hosted routes, and
  validation date;
- approved environment/project/domain identifiers and regions with credentials
  redacted;
- current dependency/status matrix and product-owner approvals;
- CI commands, versions, counts, and results;
- migration list/checksums, clean-reset, non-production promotion, advisors,
  grants/RLS, owner/anonymous/cross-user results;
- 390px hosted auth/recovery/privacy results and screenshots with synthetic
  identities/redaction;
- SMTP/domain/DNS/template/delivery and bot-risk decision evidence;
- redirect allowlist and negative/open-redirect evidence;
- headers, TLS, cache, preview protection, environment-isolation, and secret
  scan evidence;
- log-field samples, retention/access settings, alert tests, and incident
  tabletop results;
- backup/restore/RPO/RTO/deletion-reconciliation evidence;
- dependency findings/exceptions with expiry;
- cost estimate, ceiling/alerts, access/ownership matrix;
- limitations and exact external-registration state; and
- independent review findings/corrections plus the precise product-owner
  acceptance request.

Screenshots, logs, and artifacts contain no complete email, live Auth link,
token, cookie, key, project secret, or user content.

## Acceptance criteria

1. M0-03B, M0-04, and M0-05 are accepted; M0-03 remains accepted and
   unchanged.
2. The lead records and satisfies the separate privacy implementation
   dependency required for hosted external use.
3. Exact remote accounts/projects/regions/plans/domains/providers, costs,
   owners, and required ADRs are product-owner approved before creation or
   mutation.
4. Local, CI, preview/staging, and production configurations and credentials
   are isolated; production identifiers are absent from non-production.
5. Preview/staging is access-protected and contains only synthetic data.
6. CI runs all application, build, database reset/lint/advisor, pgTAP, browser,
   dependency, secret, and documentation gates on the reviewed commit.
7. Untrusted changes cannot access or mutate preview/production secrets or
   environments.
8. The exact committed migration set is validated locally, promoted through
   non-production, then production with approval and checksum/list evidence.
9. Applied migration history remains immutable; application rollback, forward
   correction, and disaster restore boundaries are documented and tested.
10. The approved backup capability meets recorded RPO/RTO and a synthetic
    restore/reconciliation drill passes.
11. Production Auth uses an approved custom SMTP path, verified sender domain,
    SPF/DKIM/DMARC, reviewed templates, delivery monitoring, and tested
    confirmation/recovery.
12. Production Site URL and redirect allowlists contain only approved exact
    HTTPS routes; wrong-host/path, wildcard, reuse, and open redirects fail.
13. Auth rate limits are recorded and the CAPTCHA/bot-risk choice, outage
    behavior, monitoring, cost, and registration-disable path are approved and
    tested.
14. Hosted 390px signup, confirmation, sign-out/in, recovery, privacy, and
    two-user isolation smoke tests pass with synthetic accounts.
15. Required security headers, secure transport/cookies, and private cache
    behavior pass without breaking Auth/privacy flows.
16. Logs use approved fields/retention/access, leakage tests pass, and provider
    residual fields are present in the M0-04 inventory.
17. Required alerts are routed to named owners and test notifications/tabletops
    succeed without user content.
18. New critical/high dependency findings are absent or deployment is blocked;
    existing exceptions are explicit and time-bounded.
19. Incident, registration-disable, credential-rotation, rollback, restore,
    and reopening procedures are complete and rehearsed with synthetic data.
20. Actual selected services fit the product-owner-approved cost ceiling and
    overage alerts; no unapproved add-on or commitment exists.
21. Provider accounts use MFA, least privilege, named owners, recovery access,
    and an access-review record.
22. Consolidated M0 validation is complete and independently reviewed.
23. No production AI call, external product analytics, M1 feature, production
    data copy, secret, or user content was added outside an approved dependency.
24. External registration remains disabled until the product owner accepts the
    consolidated evidence and explicitly authorizes the external-beta opening.

## Validation and test plan

### Local/CI

Verify exact commands against installed CLI `--help`, then run:

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npx supabase start
npx supabase db reset --local
npx supabase db lint --local --level warning --fail-on warning
npx supabase db advisors --local --type all --level warn --fail-on warn
npx supabase test db --local supabase/tests/database
npm run test:e2e
npm audit --json
git diff --check
```

Add focused environment-isolation, configuration-manifest, header, redirect,
log-denylist, registration-disable, migration-checksum, and secret-scan tests.

### Protected hosted preview/staging

- Verify access denial without approved preview credentials.
- Compare redacted environment/project identities and prove no production
  connection.
- Apply migrations and validate current migration list/advisors.
- Run the complete hosted 390px Auth/recovery/privacy and cross-user suite.
- Inspect browser bundles, network requests, response headers, cookies, cache,
  source maps, logs, artifacts, and email templates for leakage.
- Trigger safe synthetic errors, rate limits, email failure, alert delivery,
  rollback, and registration disable.

### Production readiness

- Promote the identical reviewed release and migration set with required
  approval while registration remains disabled.
- Run non-destructive synthetic smoke tests only through the approved path.
- Verify backups/restore evidence, alerts, status/support paths, cost alerts,
  access matrix, and runbooks.
- Have an independent reviewer trace every acceptance criterion and verify the
  consolidated record.

No external test user is invited until final product-owner acceptance and the
separate explicit registration-opening decision.

## Implementation sequence

1. Resolve dependency status, missing privacy implementation, exact service,
   environment, privacy, bot, cost, access, and ADR decisions.
2. Record current prices/terms/capabilities and obtain approval before creating
   any remote resource.
3. Create only the approved non-production and production boundaries; record
   identifiers/owners without secrets and leave production registration off.
4. Configure isolated variables/secrets, preview protection, branch/deployment
   protections, and the configuration manifest.
5. Implement CI gates without granting production deployment to untrusted
   jobs.
6. Promote migrations to non-production and run database/application/390px
   validation.
7. Configure the approved domain, custom SMTP, Auth templates/redirects/limits,
   and CAPTCHA/bot decision; validate delivery and negative cases.
8. Add approved headers, native logs/monitoring/alerts, retention/access, and
   runbooks.
9. Validate backup/restore, rollback, incident, registration-disable, and
   credential-rotation procedures with synthetic data.
10. Promote the exact release to production with registration disabled and run
    safe readiness checks.
11. Build the consolidated M0 validation record and obtain independent review.
12. Request product-owner acceptance. Opening external registration is a
    separate explicit final decision after acceptance.

## Rollback and handoff

The builder handoff must include:

- exact branch/commit and changed files;
- every approved provider/resource/domain/region/plan and owner;
- recurring/usage price estimate and actual alerts/ceilings;
- environment/configuration/secret inventory with values redacted;
- CI workflow and protection summary;
- migration/promotion/rollback/backup evidence;
- hosted 390px Auth/recovery/privacy path and results;
- SMTP/domain/DNS/template/deliverability and bot-risk evidence;
- headers, logs, retention, alerts, dependency, secret-scan, and incident
  evidence;
- consolidated validation record and independent review;
- known limitations and external-registration state; and
- the exact request to accept M0-06 or return focused corrections.

If rollback is required, the handoff identifies the last known-good immutable
release, schema compatibility, required forward migration or restore point,
registration/AI switch state, validation to reopen, and decision owner. It
never contains a credential.

## Open product, architecture, privacy, and cost decisions

### Environment and delivery architecture

1. Exact hosting/source-control/CI accounts, organizations, projects,
   integrations, regions, plans, and billing owners.
2. Dedicated non-production plus production Supabase projects (recommended),
   higher-isolation projects, or approved branching topology.
3. Protected preview/staging method, reviewer access, automation-bypass design,
   artifact retention, and whether plan limits satisfy the boundary.
4. Production promotion approval mechanism and whether an ADR extends ADR-001.

### Privacy and external-use dependency

5. Exact later ticket that implements the accepted M0-04 design for hosted
   notice, consent/withdrawal, deletion-capable behavior, inventory, and tests.
6. Approved operational/Auth/email/provider log fields, retention, access,
   deletion/export behavior, region, subprocessors, and external drains.
7. Whether any real-person beta data may ever enter staging (recommendation:
   no) and the synthetic-data standard.

### Email, domain, and abuse

8. Transactional SMTP provider/account, sender domain, DNS owner, From/Reply-To,
   template copy, support path, deliverability monitoring, DPA/region,
   retention, deletion, and cost.
9. Exact production Site URL, callback paths, preview/staging redirect pattern,
   and domain ownership.
10. CAPTCHA provider versus closed registration versus explicit risk
    acceptance; affected Auth actions, accessibility fallback, privacy,
    outage, rate limits, alert thresholds, and review date.

### Reliability and security

11. Backup plan, retention, RPO/RTO, PITR/manual export need, Storage coverage,
    restore target, and cost.
12. Log/monitoring/alert mechanism, thresholds, notification route, on-call
    owner, retention, and external processor boundary.
13. Security-header policy details, CSP report-only/enforcement path, production
    HSTS subdomain scope, and preload exclusion/decision.
14. Dependency risk disposition for refreshed M0-01 findings and acceptable
    exception process.
15. Named incident, domain, privacy, backup, billing, production, and recovery
    owners; two-owner versus documented single-owner risk.

### Cost and opening

16. Approve or revise the proposed EUR 75/month recurring and EUR 10/month
    overage ceilings.
17. Approve current commercial terms and any paid plan/add-on needed to meet
    environment, preview-protection, backups, or log retention requirements.
18. Define the exact final external-registration opening authority, initial
    tester count, support route, and rollback threshold.

## Current primary sources reviewed

### Supabase

- [Supabase changelog - breaking changes](https://supabase.com/changelog?types=breaking-change)
- [Deployment and branching](https://supabase.com/docs/guides/deployment)
- [Managing environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase branching](https://supabase.com/docs/guides/deployment/branching)
- [Local CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Database backups](https://supabase.com/docs/guides/platform/backups)
- [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Logging and retention](https://supabase.com/docs/guides/telemetry/logs)
- [Log drains](https://supabase.com/docs/guides/telemetry/log-drains)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Secure product configuration](https://supabase.com/docs/guides/security/product-security)

The 26 July 2026 changelog review found relevant breaking changes: new tables
are no longer automatically exposed to the Data API under the new-project
default, and new free projects using default SMTP cannot customize Auth email
templates. The self-hosted Auth/gateway changes are not applicable to the
currently proposed managed-hosting path but must be rechecked if self-hosting
is later proposed.

### Hosting, CI, framework, and security

- [Vercel deployment protection](https://vercel.com/docs/deployment-protection)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [GitHub secure use for Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Next.js response headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP API4:2023 - Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)

These are capability and security references, not provider/account/plan
approval. Recheck them immediately before implementation because plan
entitlements, limits, prices, and deployment behavior change.

## Approval gate

The product owner must:

1. accept M0-03B, the M0-04 design, and M0-05;
2. approve and satisfy the missing privacy implementation dependency;
3. resolve or assign all material environment, external-service, privacy,
   security, ownership, and cost decisions;
4. approve required ADRs and exact remote targets before creation/mutation; and
5. approve this brief.

Only then may the lead mark M0-06 `approved` and dispatch it when every
dependency is satisfied. Approval of implementation would authorize only the
exact named resources and settings. It would not authorize production AI,
external analytics, M1 behavior, unlisted spend, or external registration.

After independent review, the product owner may accept M0-06 while keeping
registration disabled. Enabling external registration requires a final
explicit decision based on the consolidated M0 validation evidence.
