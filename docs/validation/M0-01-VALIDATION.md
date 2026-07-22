# M0-01 validation record

**Ticket:** [M0-01 Repository and tooling baseline](../backlog/M0-01-REPOSITORY-TOOLING-BASELINE.md)  
**Validation date:** 22 July 2026  
**Lifecycle state:** accepted  
**Independent review:** approved, 22 July 2026  
**Accepted by:** product owner, 22 July 2026 — “I accept M0-01.”

## Demo

- Local route: [http://localhost:3000/](http://localhost:3000/)
- Mobile evidence: [390px screenshot](M0-01-390px.png)
- Viewport verified: `390x844`
- Product name verified: document title and page heading are exactly `FitTip`.
- Browser result: meaningful FitTip foundation content rendered, no framework error overlay, and no page errors.

The product owner confirmed the exact human-facing capitalization `FitTip` on 22 July 2026 before M0-01 acceptance. The app, tests, governance documents, and mobile evidence were updated and revalidated; lowercase technical identifiers remain unchanged.

## Selected versions

| Tool | Selected version | Verification |
|---|---:|---|
| Node.js | `24.18.0` LTS | Official Node release archive; invoked directly for the clean install and all final checks |
| npm | `11.16.0` | Bundled with Node.js 24.18.0 and recorded in `packageManager` |
| Next.js | `16.2.11` Active LTS | Current official July 2026 security release |
| React / React DOM | `19.2.7` | Current React 19.2 patch listed by the official React versions page |
| TypeScript | `5.9.3` | Exact direct dependency |
| Vitest | `4.1.10` | Exact patched direct dependency |

The machine-wide runtime is Node.js `22.14.0` with npm `10.9.2`. Final acceptance checks used temporary Node.js `24.18.0` and npm `11.16.0` binaries, without modifying the machine installation.

## Commands and results

| Check | Command or equivalent target-runtime invocation | Result |
|---|---|---|
| Clean install | `npm ci` | Pass with Node.js 24.18.0/npm 11.16.0; lockfile installed without an engine warning |
| Lint | `npm run lint` | Pass |
| Typecheck | `npm run typecheck` | Pass with strict TypeScript |
| Unit test | `npm run test:run` | Pass; 1 file and 1 test |
| Format | `npm run format:check` | Pass |
| Production build | `npm run build` | Pass; `/` and `/_not-found` prerendered statically without environment variables |
| Development server | `npm run dev -- --hostname 127.0.0.1` | Pass |
| Mobile smoke check | `agent-browser` `0.27.0` at `390x844` | Pass; content present, overlay check `OK`, no page errors |
| Dependency audit | `npm audit --json` | 3 reported entries: 0 critical, 2 high, 1 moderate; disposition below |

The final quality commands were executed through the selected Node.js 24.18.0 binary against the same scripts and configuration named above.

## Dependency and audit disposition

The first install exposed a direct critical advisory in Vitest `4.0.18`. Vitest was updated to the exact patched version `4.1.10`; the critical finding is no longer present.

The final npm audit reports three related entries in the current Next.js dependency graph:

- `postcss <8.5.10`: moderate advisory `GHSA-qx2v-qp2m-jg93`, nested under Next.js.
- `sharp <0.35.0`: high advisory `GHSA-f88m-g3jw-g9cj`, pulled by Next.js.
- `next`: high aggregate entry because of the two transitive packages above.

Next.js `16.2.11` is the current official Active LTS security release. npm offers no compatible Next.js upgrade for these transitive findings and suggests a breaking downgrade to Next.js `9.3.3`; that suggestion was rejected because it would discard the approved App Router architecture and current security line. M0-01 contains no image input or untrusted CSS serialization. Re-run the audit and take the first compatible patched Next.js release before shared deployment in M0-06.

npm 11.16.0 also blocks unreviewed dependency install scripts by default. The clean install reported blocked scripts for `sharp@0.34.5` and `unrs-resolver@1.12.2`; M0-01's tests and production build pass without approving them. Any later need to execute those scripts requires an explicit, version-pinned review rather than a blanket script allowance.

## Changed files

### Application and tooling

- `.gitignore`
- `.nvmrc`
- `.prettierignore`
- `.prettierrc.json`
- `README.md`
- `eslint.config.mjs`
- `next.config.ts`
- `package.json`
- `package-lock.json`
- `postcss.config.mjs`
- `tsconfig.json`
- `vitest.config.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/page.test.tsx`
- `src/test/setup.ts`

### Governance and evidence

- `docs/backlog/M0-01-REPOSITORY-TOOLING-BASELINE.md`
- `docs/backlog/M0-M1-BACKLOG.md`
- `docs/validation/M0-01-VALIDATION.md`
- `docs/validation/M0-01-390px.png`

`next-env.d.ts` and build output are generated locally and ignored by Git.

## Scope and limitations

- The root page is intentionally neutral and contains no authentication, onboarding, training, navigation, analytics, or AI behavior.
- No Supabase or Vercel configuration, environment value, credential, secret, CI workflow, Playwright setup, or component library was added.
- No database, consent, authorization, deployment, or product behavior was introduced.
- Dependency versions and the audit disposition must be rechecked before M0-06 deployment because security advisories and patches change over time.

## Decision record

The product owner accepted M0-01 on 22 July 2026 after reviewing the implementation outcome and validation evidence.
