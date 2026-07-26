# ADR-007: Founder-hosted staging

**Status:** accepted

**Date:** 26 July 2026

**Approval:** The product owner approved the founder-hosted FitTip MVP plan in
chat and explicitly requested implementation

**Supersedes:** only ADR-006's prohibition on hosted use for the narrow
founder/synthetic staging scope; ADR-006 remains the historical local-AI
decision

## Context

Running FitTip and its database only on the product owner's laptop makes the
MVP inconvenient to use and prevents realistic testing across devices. The
product owner wants an always-reachable staging app before inviting friends or
completing the full external-use privacy and deployment program.

The repository already uses Next.js, Supabase Auth, committed Postgres
migrations, and explicit RLS ownership policies. Replatforming would repeat
accepted authentication and authorization work without improving the founder
MVP.

## Decision

- Create one Vercel project named `fittip` under the product owner's existing
  Vercel account and deploy `master` to its generated public `vercel.app` URL.
- Create a separate Supabase project named `FitTip Founder Staging` in
  `eu-central-1` (Frankfurt) under the existing free organization. Never reuse
  or mutate the unrelated existing Supabase project.
- Start on free tiers. Confirm the live Supabase project cost immediately
  before creation and do not enable paid features or overage without a later
  product-owner decision.
- Classify this environment as disposable founder staging, not production.
  Migrations preserve schema; owner and synthetic records have no backup or
  durability promise.
- The environment may process only the product owner's own data and synthetic
  data. Friend data, external users, public registration, external analytics,
  commercial use, and public beta remain prohibited.
- The generated Vercel URL may be public, but FitTip application access is
  owner-only. Supabase Auth registration is disabled before publication, and
  the owner account is created administratively with the product owner entering
  the password privately.
- Hosted runtime authorization uses the verified Supabase `user_id`, never
  email or user-editable metadata. Every authenticated application boundary
  denies users other than the configured owner.
- Hosted signup is disabled both in FitTip and in Supabase Auth. Local
  development retains the accepted M0-03 signup and Mailpit confirmation flow.
- Only the hosted Supabase URL and publishable key may be exposed through
  `NEXT_PUBLIC_` configuration. The owner id is server-only. No secret,
  database password, management token, service-role key, or future AI key may
  enter the client bundle, repository, logs, screenshots, or test artifacts.
- The exact hosted Site URL and callback path are allowlisted. The public site
  is marked `noindex`, and authenticated responses remain private/no-store.
- M1 may be implemented and made testable in founder staging after M0-06A is
  accepted. M2 may later make server-side AI calls there only through its own
  approved provider/model/key/data-use/budget gates.
- M0-03B, M0-04 and its required implementation, M0-05, and M0-06 remain
  mandatory before any friend, external registration, commercial/public use,
  or production claim.

## Runtime contract

Hosted deployments use these variables:

| Variable | Visibility | Meaning |
|---|---|---|
| `FITTIP_RUNTIME_MODE` | server-only | Exact value `founder-staging` enables the hosted restrictions; local or absent preserves local development behavior |
| `FITTIP_OWNER_USER_ID` | server-only | Exact UUID of the administratively created owner; missing or invalid configuration fails closed |
| `NEXT_PUBLIC_SUPABASE_URL` | deliberately public | Exact hosted Supabase HTTPS API origin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | deliberately public | Environment-specific publishable client key; never a secret/service-role key |

M0-06A introduces no database-service credential or privileged Supabase client
into application code.

## Alternatives considered

### Keep the MVP local

Rejected because it requires the product owner's laptop and local database to
remain running.

### Replatform hosting, database, or authentication

Rejected for this slice. Netlify, Cloudflare, Railway, Neon, Clerk, and
Firebase can support parts of the architecture, but changing now would repeat
accepted Next.js/Supabase Auth/RLS work.

### Protected Vercel preview

Not selected. The product owner chose a public generated URL protected by
FitTip sign-in rather than Vercel login.

### Durable paid staging

Not selected. The product owner chose free tiers and accepted disposable
staging records. Upgrade when pausing or limits interfere with testing.

## Consequences

- M0-06A becomes the narrow remote-resource and hosted-access ticket before M1.
- The public URL exposes only generic sign-in behavior; signup and all
  authenticated product routes remain closed to non-owners.
- Free Supabase projects may pause after low activity. One disruptive pause,
  a durability requirement, quota pressure, or external use triggers a new
  cost decision.
- Vercel must be upgraded before the environment becomes commercial or its
  free-plan terms no longer fit the actual use.
- Remote migrations are allowed only against the named founder-staging project
  under an approved ticket. Production remains nonexistent.

## Reversal

Disable or delete the Vercel project and disposable Supabase project without
changing committed migrations or accepted product history. Local development
continues to work. Recreating staging requires a fresh cost confirmation,
project identifiers, migration verification, Auth closure, owner bootstrap,
and hosted validation.

## Approval boundary

This ADR approves only the exact founder-hosted staging topology above. It does
not approve paid plans, a custom domain, custom SMTP, recovery, backups,
monitoring drains, analytics, an AI provider/model/key, friends, public
registration, production, commercial use, or any requirement owned by M0-03B
through M0-06.
