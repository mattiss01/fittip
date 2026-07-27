# M0-06A: Founder-hosted staging

**Status:** accepted

**Milestone:** M0

**Priority:** P0

**Depends on:** [M0-03 accepted](../product/F-001-PUBLIC-ACCOUNT-AUTHENTICATION.md),
[M0-02-C1 accepted](M0-02-C1-REMOVE-USERNAME.md), and
[ADR-007 accepted](../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md)

**Approval:** The product owner approved the complete founder-hosted FitTip MVP
plan and requested implementation on 26 July 2026

**Validation:** [M0-06A validation](../validation/M0-06A-VALIDATION.md)

**Acceptance:** The product owner accepted M0-06A on 27 July 2026

**Blocks:** hosted M1 testable releases

## Outcome

Make the accepted FitTip authentication foundation continuously reachable from
the generated public Vercel URL, backed by a separate disposable hosted
Supabase project. Only the configured product-owner `user_id` may enter the
authenticated app. Local signup remains testable; hosted signup is closed at
both the application and Supabase Auth layers.

This is a founder-staging exception, not M0-06 acceptance or a production
release. It may contain only the product owner's data and synthetic data.

## Approved resources and boundaries

| Item | Approved value |
|---|---|
| Source | `https://github.com/mattiss01/fittip`, branch `master` |
| Web host | New Vercel project `fittip` in the existing product-owner account |
| Web URL | Generated public production `vercel.app` URL; no custom domain |
| Database/Auth | New Supabase project `FitTip Founder Staging` |
| Supabase organization | Existing product-owner free organization |
| Region | `eu-central-1` (Frankfurt) |
| Plan | Free initially; no paid add-on or overage approval |
| Data | Product-owner or synthetic only; disposable; no backup promise |
| Registration | Disabled in hosted UI/routes and Supabase Auth |
| Owner bootstrap | Administrative dashboard creation; owner enters password privately |
| Email | No hosted confirmation/recovery dependency; no custom SMTP |
| Analytics/monitoring | No external sink or drain |
| AI | No provider, model, key, call, or spend in this ticket |

The unrelated existing Supabase project is explicitly out of scope and must
not be linked, queried, migrated, configured, renamed, paused, or deleted.

## Scope

### Planning and configuration

1. Record ADR-007 and reconcile the Product Plan, M0/M1 backlog, M1 staging
   boundaries, M2 backlog, and M0-06 boundary.
2. Add documented server-only founder-staging configuration with strict
   validation and safe local defaults.
3. Document only variable names and classifications. Never record values,
   project keys, passwords, tokens, or owner email.

### Hosted access control

1. Add a server-only runtime policy with two modes:
   - local/default: existing M0-03 signup and multi-user isolation tests remain;
   - `founder-staging`: signup closed and owner allowlist required.
2. Validate `FITTIP_OWNER_USER_ID` as a canonical UUID when founder staging is
   active. Missing, malformed, or ambiguous configuration fails closed.
3. Disable hosted signup visibly and behaviorally:
   - the sign-in page has no create-account link;
   - `/signup` redirects to `/`;
   - `POST /auth/signup` returns a generic denial without calling Supabase.
4. After sign-in, callback, and on every protected request, compare the
   verified Auth subject to the configured owner id. A mismatch signs out or
   redirects with generic credentials behavior and never creates a profile.
5. Keep RLS ownership policies as the database authorization boundary.
   Application allowlisting is an additional hosted-staging restriction, not
   a replacement for RLS.
6. Do not authorize from email, request parameters, cookies other than the
   verified Supabase session, `user_metadata`, or `raw_user_meta_data`.

### Public-host safety

1. Add `robots` metadata and `X-Robots-Tag: noindex, nofollow, noarchive`.
2. Preserve private/no-store headers for authentication and protected routes.
3. Keep user-facing authentication failures generic.
4. Use exact HTTPS Site URL and exact callback allowlist entries; no wildcard,
   localhost, or preview origins in hosted Auth configuration.
5. Verify no private page content is returned to anonymous or non-owner
   requests even if proxy interception is bypassed. Protected Server
   Components and Route Handlers must enforce authorization themselves.

### Resource creation and release

1. Immediately before creation, retrieve and repeat the live Supabase project
   cost and obtain the required confirmation. Stop if it is not `$0` or if the
   free-project slot is unavailable.
2. Create the exact approved Supabase project, wait for healthy status, and
   record its non-secret project reference in the handoff.
3. Apply only committed migrations through the supported current Supabase
   migration workflow.
4. Verify remote migration state, exposed-table grants, RLS, advisors, and the
   `profiles` owner/cross-user behavior.
5. Disable new Auth signups and anonymous sign-ins before publishing the
   Vercel URL.
6. Create the owner through Supabase Dashboard administration. The product
   owner enters the email/password privately; no agent receives or records the
   password. Record only the resulting owner UUID in the Vercel server-only
   environment.
7. Create/link the Vercel project, set the exact environment values, build the
   reviewed commit, and deploy `master`.
8. Set the Supabase Site URL and exact callback URL to the final generated
   Vercel origin, then redeploy if configuration changes require it.

## Non-goals

- No friend, reviewer, or other real-person account.
- No public registration, invitation product, account recovery, password
  change UI, custom SMTP, sender domain, or deliverability work.
- No production Supabase project, staging/production split, branch database,
  backup/export job, restore drill, SLA, or durability claim.
- No custom domain, password-protected Vercel deployment, CAPTCHA, WAF policy,
  external monitoring, analytics, log drain, or alerting service.
- No AI adapter, provider account, model, prompt, key, content transfer, or
  budget.
- No M1/M2 product behavior, schema, navigation, goal, memory, intake, plan, or
  coaching feature.
- No mutation of the unrelated existing Supabase project.
- No claim of legal compliance or readiness for friends, commercial use, or
  public beta.

## Runtime behavior

### Configuration contract

| Variable | Required locally | Required in founder staging | Classification |
|---|---:|---:|---|
| `FITTIP_RUNTIME_MODE` | no | yes, exact `founder-staging` | server-only |
| `FITTIP_OWNER_USER_ID` | no | yes, canonical UUID | server-only |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes, exact hosted HTTPS URL | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes, environment-specific publishable key | public |

No secret/service-role/database credential is required by application runtime.

### Route matrix

| Route/action | Local/default | Founder staging |
|---|---|---|
| `GET /` | Sign-in plus create-account link | Sign-in only |
| `GET /signup` | Signup form | `303` redirect to `/` |
| `POST /auth/signup` | Existing validated signup | Generic closed-registration redirect; zero Auth signup calls |
| `POST /auth/signin` | Existing user-scoped sign-in | Only configured owner may complete sign-in |
| `GET /auth/callback` | Existing confirmed user flow | Only configured owner may complete callback |
| `/home/**` | Any valid isolated user | Configured owner only |
| `POST /auth/signout` | Existing signout | Existing signout |

The hosted owner check must exist in the protected page/domain boundary as
well as the proxy. Proxy is defense in depth, never the only authorization
gate.

## Acceptance criteria

1. ADR-007 and backlog/product-plan references distinguish historical local
   staging, founder-hosted staging, and the later external-use baseline.
2. Local signup/sign-in tests remain unchanged in behavior and pass.
3. Founder-staging configuration fails closed when mode or owner id is invalid.
4. Hosted signup UI is absent, `/signup` redirects, and signup POST never calls
   Supabase.
5. Anonymous and non-owner sessions cannot render `/home`, create a profile, or
   retain a hosted FitTip session.
6. The configured owner can sign in, create/ensure exactly one owned profile,
   view `/home`, refresh the session, and sign out.
7. The production build uses only the hosted publishable key in public code.
   No secret, service-role key, database password, management token, owner
   email, or environment value is committed or exposed.
8. The remote schema contains exactly the reviewed committed migration set.
9. RLS is enabled; owner access succeeds; anonymous and cross-user access are
   denied on the hosted project.
10. Supabase Auth new-user signup and anonymous signup are disabled before the
    public Vercel URL is handed over.
11. Hosted Auth has exact HTTPS Site URL/callback configuration without
    wildcard or localhost entries.
12. The deployed app is `noindex`, returns private/no-store headers where
    sessions are involved, and passes the 390px hosted smoke path.
13. The handoff states that data is disposable and reports the free-tier pause
    and upgrade triggers.
14. M0-03B, M0-04, M0-05, and M0-06 remain proposed and mandatory before
    friends, public registration, commercial use, or production.

## Test plan

### Automated local

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- supported local Supabase start/reset/lint/advisor commands discovered through
  installed CLI `--help`
- `npm run test:e2e` at 390px with local signup, confirmation, sign-in,
  protected route, and signout
- founder-mode unit/route/proxy/page tests for invalid configuration, closed
  signup, owner success, non-owner denial, generic errors, and headers
- pgTAP owner, anonymous, and cross-user authorization tests

### Hosted

- compare remote/local migration lists;
- run database advisors and inspect grants/RLS;
- verify direct Supabase signup is disabled;
- verify anonymous `/`, `/signup`, signup POST, and `/home`;
- verify owner sign-in, profile creation, session refresh, `/home`, and signout;
- verify a controlled non-owner synthetic session is denied and removed if a
  safe admin-created fixture is available, then delete that fixture;
- inspect response headers, robots behavior, Vercel build/runtime logs, and the
  390px page;
- scan tracked files, client assets, logs, screenshots, and test artifacts for
  secret patterns and environment values.

## Implementation sequence

1. Commit the approved planning artifacts.
2. Dispatch a `gpt-5.6-terra` builder in an isolated branch/worktree.
3. Implement runtime policy, route/page/proxy/domain enforcement, headers,
   documentation, and tests.
4. Run the complete local suite and provide a builder handoff.
5. Dispatch an independent reviewer; correct all blocking findings.
6. Obtain live cost confirmation and create/configure Supabase.
7. Bootstrap the owner privately and configure the server-only owner UUID.
8. Create/configure Vercel, deploy the reviewed commit, and run hosted checks.
9. Mark this ticket `testable` only after the public hosted path passes.
10. Request product-owner acceptance; do not start M1 until acceptance.

## Upgrade triggers

A new product-owner cost decision is required when any of these occurs:

- the free Supabase project pauses once and the interruption is unacceptable;
- disposable records are no longer acceptable or backups are required;
- any free quota, platform restriction, or fair-use limit approaches;
- the environment becomes commercial or Vercel Hobby terms no longer fit;
- a friend, external user, public registration, custom domain, custom SMTP,
  monitoring sink, or production claim is proposed.

The default response is to keep the relevant feature closed, not to upgrade or
incur spend automatically.

## Handoff

Before requesting acceptance, provide:

- branch, commit, changed files, and deployed immutable commit;
- generated Vercel URL and non-secret Supabase project reference/region;
- environment variable names/scopes with all values redacted;
- migration, grants, RLS, advisor, Auth closure, and hosted smoke evidence;
- local and hosted commands/tests with results;
- 390px mobile demo path;
- confirmation that owner password/email and all credentials were never
  received, printed, committed, or logged;
- known limitations, disposable-data statement, current free-tier status, and
  upgrade triggers; and
- the exact decision: accept M0-06A or return focused corrections.
