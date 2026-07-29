# M0-04: Privacy, consent, and deletion-operation design

**Status:** proposed — design only; not approved for implementation

**Milestone:** M0

**Priority:** P0

**Depends on:** [M0-02 accepted](M0-02-DATA-AUTHORIZATION-FOUNDATION.md) and [M0-02-C1 accepted](M0-02-C1-REMOVE-USERNAME.md)

**Blocks:** the pre-friends/hosted privacy implementation, M0-05's
production-shaped boundary, any friend/external AI-data transfer, and external
MVP use. ADR-006 separately permits owner/synthetic local AI under its narrower
controls.

## Outcome

Produce an approved, implementable privacy design before FitTip creates
consent/deletion schema or sends friend/external user content to an AI provider
or operates a hosted MVP. The design
must define the user notice, separate AI-data consent and withdrawal records,
deletion request/operation lifecycle, data inventory, processor/data-flow map,
retention categories, backup/security-log handling, access/export boundary,
and audit evidence.

This ticket creates reviewed design artifacts only. It does not create tables,
migrations, pages, legal text, processor accounts, provider configuration, or
deletion jobs. Any schema or user-visible implementation requires a later
dependency-ready brief and separate product-owner approval.

[ADR-006](../../decisions/ADR-006-LOCAL-OWNER-AI-MVP.md) permits a narrower local
exception, and [ADR-007](../../decisions/ADR-007-FOUNDER-HOSTED-STAGING.md)
permits the disposable owner-only hosted topology. Neither exception satisfies
or changes this ticket's required pre-friends/public/commercial privacy work.

## Product design versus legal advice

This brief translates FitTip's product plan into questions, records, and
technical controls. It is not legal advice and does not determine FitTip's
controller identity, lawful bases, Article 9 condition, required wording,
retention periods, processor terms, transfer safeguards, or jurisdictional
obligations. Those decisions require the product owner and qualified legal
review before external use.

Training notes, pain/illness/injury signals, and inferences can reveal physical
or mental health status. The design must conservatively inventory them as
potential data concerning health and must not assume that ordinary account
consent alone authorizes their processing or transfer.

## Approval and implementation boundary

Approval of M0-04 would accept the completed design and its resolved decision
record. It would not by itself authorize schema or application implementation.

The later implementation brief must:

- link to the accepted M0-04 design and any required ADR;
- specify exact migrations, ownership, grants, RLS, server operations, UI
  behavior, and tests;
- preserve immutable consent evidence without making it a hidden substitute
  for user control;
- use a server-only privileged deletion operation with no secret in the
  browser and no public definer function;
- identify the exact processors and environments before external mutation; and
- return for approval if the provider's current deletion, backup, logging, or
  session behavior differs from the accepted design.

## Required design artifacts

M0-04 should produce a small reviewed set under a future `docs/privacy/`
directory or equivalent:

1. Data inventory and retention schedule.
2. Processor/subprocessor and data-flow map.
3. Notice and AI-consent UX specification with wording placeholders.
4. Deletion and withdrawal operations runbook/state model.
5. Access/export boundary and audit-evidence specification.
6. Product/legal/processor decision record showing owner, date, source, status,
   and review trigger for every unresolved item.

No placeholder becomes approved wording, duration, lawful basis, vendor, or
transfer mechanism simply because it appears in an artifact.

## User-facing privacy notice design

Before external use, a clear notice must be reachable before or when personal
data are collected and remain reachable while signed in. The approved notice
design must map each required disclosure to its authoritative source and to
the data inventory, including:

- controller identity and contact route;
- categories of data and source;
- purpose and legal basis for each processing purpose;
- whether providing data is required and what happens if it is not provided;
- recipients/processors and international-transfer information where
  applicable;
- retention period or understandable criteria;
- access, correction, erasure, restriction, objection, portability, consent
  withdrawal, and complaint routes as applicable;
- automated/AI involvement stated accurately without overstating model
  autonomy; and
- notice version/effective date and a material-change process.

The notice is layered for a 390px screen: a concise first layer with direct
links to complete detail. It must not use a consent checkbox to imply
acceptance of unrelated privacy information.

## Account creation and AI-data consent separation

- Account creation, authentication, and access to non-AI account functions do
  not require AI-data consent.
- AI consent is requested only before the first transfer of training notes,
  chat content, health-adjacent context, or other approved user content to an
  LLM provider.
- Declining or withdrawing AI consent leaves the account and locally stored
  data available subject to the approved product boundary; it disables future
  AI-bound transfers and clearly explains which FitTip functions are
  unavailable.
- Consent is a specific affirmative action. No preselected control, bundled
  account agreement, silence, or continued use records consent.
- The presented purpose, data categories, provider/recipient category,
  relevant risks/transfer information, notice version, and consent version are
  inspectable before action.
- Withdrawal must be as easy to reach as consent. It stops future AI-bound
  transfer after the withdrawal is recorded; it does not rewrite the historical
  fact that consent was previously given.
- Withdrawal is separate from deletion. The user may withdraw without deleting
  the account, and may request deletion regardless of consent status.
- If a new purpose, materially different data category, provider role, or
  consent text requires renewed consent, the old record remains historical and
  the AI boundary remains closed until the new version is accepted.

Whether consent is the correct Article 6 basis and which Article 9 condition
applies to health data remain legal decisions. The system must support the
product-plan consent gate without asserting that the gate alone establishes
legal compliance.

## Proposed record semantics for later approval

The design must describe, without yet creating schema:

### Consent evidence

- immutable event identifier and owner `user_id`;
- scope/purpose identifier, consent-text version, notice version, and locale;
- `granted` or `withdrawn` event with server timestamp and collection channel;
- minimum evidence of the affirmative action, without copying sensitive
  content into the audit record; and
- supersession/re-consent relationship rather than overwriting history.

The current effective state is derived from the event history. A withdrawal
record must not delete the earlier grant evidence, and the record must not be
used for unrelated analytics or authorization beyond the AI-transfer gate.

### Deletion request and operation

- stable operation identifier, authenticated requester, request channel, and
  timestamps;
- state model such as `requested`, `identity_verified`, `scheduled`,
  `executing`, `blocked`, `completed`, and `failed`;
- per-system step results that make retries idempotent without storing deleted
  user content in the operation log;
- reason category for a narrowly justified hold/exception, decision owner, and
  review date, without exposing it to ordinary users or analytics; and
- completion evidence that is minimized or de-identified after the account
  link is no longer needed, subject to legal approval.

Exact names, fields, status transitions, retention, and ownership policies
belong to the later schema brief.

## Deletion request and operation workflow

The accepted design must specify this end-to-end sequence:

1. A signed-in user starts deletion through an authenticated route; support
   handling for a user who cannot sign in is documented separately.
2. FitTip performs recent-authentication or equivalent identity verification
   appropriate to the risk, shows consequences, and receives explicit final
   confirmation.
3. FitTip immediately prevents new AI requests and defines whether ordinary
   account access freezes now or after a cancellation/grace period.
4. A server-only operation records a minimal request and revokes affected Auth
   sessions before deleting the Auth user. Supabase documents that deleting an
   Auth user alone does not immediately invalidate existing JWTs.
5. The operation inventories and deletes/reconciles user-owned application
   rows, Storage objects, queued jobs, derived/search/vector data, cached data,
   analytics identifiers, AI-provider retained content, email-provider data,
   and other approved processors in a defined order.
6. The Auth identity is deleted only when dependencies permit it. Supabase
   Storage objects owned by the user must be deleted or reassigned first, and
   `on delete cascade` behavior must be verified rather than assumed to cover
   external systems.
7. Each step is retry-safe. A partial failure remains blocked from normal use,
   is visible to an authorized operator, and resumes without recreating erased
   content.
8. Completion is communicated through an approved safe channel that does not
   require a deleted account session.
9. Backup expiry and security-log exceptions follow the approved retention
   design; a restore procedure re-applies completed deletion markers so erased
   active data is not silently resurrected.

The workflow must distinguish deletion from reversible account deactivation
and must not advertise immediate erasure from every backup unless the approved
provider design can prove it.

## Data inventory

For every current or planned category, record:

| Field | Required question |
|---|---|
| Data category and example | What exact fields/content exist, including derived data? |
| Data subject/source | Who the data concerns and whether the user, system, or inference supplied it |
| Purpose and necessity | Why it is needed and what fails without it |
| Legal basis / Article 9 condition | Decision and reviewer; never inferred by engineering |
| System and owner key | Where it lives and how it is tied to `user_id` |
| Recipients/processors | Who receives it and for which operation |
| Region/transfer | Storage/processing location and approved safeguard |
| Retention trigger | Event that starts retention and approved duration/criteria |
| Deletion behavior | Immediate, queued, backup-expiry, legal/security hold, or external request |
| Access/export behavior | Included, transformed, excluded, and reason |
| Security classification | Access boundary, logging prohibition, and incident impact |
| Decision status | Proposed, legally reviewed, product-approved, implemented, revalidated |

Minimum categories include Supabase Auth identity/session/audit data; minimal
profile; goals and memory; plans/proposals/completions/personal activities;
chat and summaries; pain/illness/injury and other health-adjacent content; AI
request inputs/outputs and technical metadata; consent/withdrawal evidence;
deletion operations; product events; support/email delivery; application,
security, and infrastructure logs; caches/queues; Storage; exports; and
backups.

## Processor and data-flow map

Start with the proposed flow, not an approved vendor claim:

```text
User browser
  -> FitTip web/server host (provider and region TBD)
    -> Supabase Auth/Postgres/Storage (project and region TBD)
    -> LLM provider only after effective AI consent (provider/model/region TBD)
    -> transactional email provider (TBD before public/external use)
    -> privacy-safe analytics/monitoring only if separately approved (TBD)
```

The accepted map must inspect actual M0-03 traffic and show any direct browser
to Supabase Auth edge separately; the simplified proposed diagram does not
declare that all identity data is relayed through the FitTip server.

For each edge, document data fields, purpose, direction, encryption, identity
key, credential boundary, processor/controller role, subprocessors, region,
transfer mechanism, retention/deletion API or manual path, DPA/terms version,
and failure/retry owner. Record whether the vendor may train on, review, or
otherwise use content; the recommended default is no secondary training/use
of FitTip user content unless separately and explicitly approved.

## Retention categories and conservative defaults

Do not put unapproved numbers into code or public copy. The design must assign
an owner and approval state to each duration or criterion.

- **Active account data:** retain only while necessary for the approved user
  purpose; delete through the account workflow.
- **AI content and derived output:** minimize input, avoid duplicate raw
  storage, and use the shortest provider/application retention compatible with
  the approved feature and incident/debug needs.
- **Consent evidence:** retain an auditable version history for the approved
  accountability period, with access restricted and no raw user content.
- **Deletion operations:** retain only the minimal evidence needed to complete,
  retry, and demonstrate the operation; minimize/de-identify after completion
  where approved.
- **Product analytics:** event allowlist only, no raw notes/chat/health content,
  and a separately approved retention rule.
- **Security/abuse logs:** collect only fields necessary for security, restrict
  access, define a short operational window plus any justified hold, and never
  treat “security” as indefinite blanket retention.
- **Backups:** document provider schedule, immutability, expiry, restore access,
  and maximum deletion tail. Backups are not an active archive; restored data
  must be reconciled against completed deletion operations before service.
- **Legal claims/obligations:** any exception must name the legal ground,
  narrowed fields, access, owner, end condition, and review rather than keeping
  an entire account by default.

## Data access and export boundary

The design must support authenticated access handling before public launch,
even if polished self-service UI is deferred:

- distinguish a GDPR access response from a machine-readable portability
  export and from an ordinary in-product download;
- verify identity without collecting unnecessary new identity documents;
- inventory data held directly and by processors, including meaningful
  metadata and derived/inferred data where applicable;
- define redaction for other people's rights, secrets, internal security
  material, and privileged material, with a review reason;
- provide a common, readable structure and, where portability applies, a
  structured machine-readable format;
- track request, verification, search scope, processor follow-up, response,
  exceptions, and completion without placing export contents in logs; and
- protect generated exports with short-lived access, encryption, expiry, and
  deletion.

The product owner and legal reviewer must decide which rights and deadlines
apply. Engineering must not promise a universal export scope or legal outcome.

## Auditability and authorization

- Every future owned privacy record uses `user_id`, explicit least-privilege
  grants, RLS ownership policies, and an independent server ownership check.
- Ordinary users can inspect their effective consent and withdrawal history as
  approved; they cannot read another user's records or privileged operational
  notes.
- Privileged deletion work runs only in a server/worker boundary. A
  service-role/secret key never reaches the browser and is not used for normal
  user reads.
- Audit records contain identifiers, versions, transitions, and coarse results,
  not passwords, tokens, raw notes, prompts, chats, health details, provider
  payloads, or export archives.
- Changes to notice, consent, inventory, retention, processor, and deletion
  designs are versioned with author, approver, effective date, and reason.
- Tests must cover owner access, anonymous/cross-user denial, privileged
  operation isolation, replay/idempotency, and absence of sensitive content.

## Non-goals

- No migration, table, RLS policy, function, trigger, queue, scheduled job, API
  route, page, component, privacy policy, consent wording, or retention timer.
- No actual AI request, analytics event, user export, deletion, or processor
  notification.
- No approval or creation of Supabase/Vercel/LLM/SMTP/analytics projects,
  regions, contracts, DPAs, transfer mechanisms, or paid services.
- No legal conclusion, medical claim, cookie design, terms of service, DPIA,
  breach process, child-user flow, native-app disclosure, or store submission.
  The decision record may identify one of these as a required later gate.
- No assumption that account creation consent authorizes AI processing or that
  withdrawal automatically deletes account data.

## Acceptance criteria

1. The six design artifacts exist, link to each other, and contain no
   contradictory category, processor, retention, or deletion rule.
2. Every personal-data category known from the Product Plan appears in the
   inventory with purpose, owner key, recipients, retention/deletion, access,
   security, legal-review owner, and decision status.
3. The processor map follows every approved/proposed transfer and labels all
   vendors, roles, regions, subprocessors, terms, and transfer safeguards as
   approved or unresolved.
4. Account creation and AI-data consent are separate; declining/withdrawing
   consent blocks future AI transfer without deleting the account.
5. Consent and withdrawal evidence is versioned, inspectable, and append-only
   in the design; no wording or lawful basis is silently approved.
6. The deletion workflow covers identity verification, session revocation,
   application rows, Storage, external processors, caches/queues, Auth identity,
   retries, partial failure, completion notice, backups, logs, and restore
   reconciliation.
7. The design explicitly reflects Supabase's JWT-after-user-deletion and
   Storage-owner constraints.
8. Every retention category has an approval owner and trigger; no duration is
   presented as approved until product/legal/provider review records it.
9. Access and portability boundaries include secure identity verification,
   processor data, derived data, third-party redaction, machine-readable
   output, export security, and audit evidence.
10. A threat/privacy review covers enumeration, cross-user access, privilege
    escalation, deletion replay/partial failure, backup restoration, export
    leakage, stale consent, and sensitive logging.
11. A later implementation brief can derive exact schema/UI/operations/tests
    without making a new hidden product, privacy, processor, or retention
    decision.
12. The product owner and legal reviewer receive one concise unresolved
    decision list and the exact approval boundary.

## Validation plan

- Markdown/link/table validation and consistency review across Product Plan,
  ADRs, backlog, and all six design artifacts.
- Traceability check: each notice disclosure, consent field, deletion step,
  retention category, processor edge, and export field maps to inventory rows
  and a decision source.
- Two-user authorization tabletop: user A, user B, anonymous caller, normal
  server session, and privileged deletion worker.
- Lifecycle tabletop: grant, withdraw, re-consent to a new version, request
  deletion, partial processor failure, retry, completion, backup restore, and
  re-erasure.
- Data minimization review for notices, consent evidence, logs, audit records,
  deletion records, AI envelopes, analytics events, and exports.
- Provider-capability review against current Supabase Auth/deletion/session,
  Storage, backup, SMTP, hosting, LLM, and analytics documentation before any
  implementation brief is approved.
- Independent privacy/security review, followed by product-owner review of the
  open decisions. Legal validation is recorded separately; a technical review
  must not impersonate it.

## Open product, legal, and processor decisions

1. **Controller and contacts:** legal entity/person, privacy contact, support
   route, applicable establishments/jurisdictions, and supervisory authority.
2. **Purpose and lawful bases:** basis per account, coaching, analytics,
   security, support, AI, and deletion processing; Article 9 condition for
   health data; whether a DPIA or other assessment is required.
3. **AI-consent scope:** one narrow MVP AI-processing scope or separate scopes;
   exact data categories, purpose, decline/withdraw experience, re-consent
   triggers, age boundary, and approved wording.
4. **Processors and transfers:** hosting, Supabase project/region, LLM,
   transactional email, analytics/monitoring, subprocessors, DPAs, transfer
   mechanisms, government-access/risk review, and secondary-use/training terms.
5. **Retention:** duration or criteria for every category, deletion grace
   period if any, provider deletion capability, backup expiry, security-log
   window, legal holds, and record-review cadence.
6. **Deletion UX and operation:** recent-auth method, immediate freeze versus
   cancellation window, confirmation channel, operator/support path, completion
   evidence, and maximum stated timeline.
7. **Access/export:** manual versus self-service initial route, formats, scope,
   identity verification, secure delivery, expiry, and redaction/escalation.
8. **Audit evidence:** how long consent/deletion evidence remains linkable to a
   user and when/how it is minimized or de-identified.

## Short primary-source context

- [GDPR official text on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/)
  — especially Articles 5, 6, 7, 9, 12–15, 17, 20, 25, 28, 30, and 32.
- [EDPB Guidelines 05/2020 on consent](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en)
  — conditions and withdrawal of consent.
- [EDPB Guidelines 4/2019 on data protection by design and by default](https://www.edpb.europa.eu/documents/guideline/guidelines-42019-on-article-25-data-protection-by-design-and-by-default_en).
- [EDPB Guidelines 01/2022 on the right of access](https://www.edpb.europa.eu/documents/guideline/guidelines-012022-on-data-subject-rights-right-of-access_en).
- [Supabase Auth user management and deletion](https://supabase.com/docs/guides/auth/managing-user-data)
  and [Auth sessions](https://supabase.com/docs/guides/auth/sessions).
- [Supabase current Auth changelog](https://supabase.com/changelog?tags=auth).

## Approval gate

The product owner must resolve or explicitly assign every open decision, obtain
appropriate legal review, approve the final design artifacts, and identify
which decisions require an ADR. M0-04 then becomes accepted as a **design
ticket only**. Schema, UI, deletion-operation, processor, and external-service
work remain blocked until a later implementation brief is independently
approved.
