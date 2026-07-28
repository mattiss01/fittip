# M1-03: Quick training logging

**Status:** approved — queued until M1-01 is accepted; product-owner approval recorded 28 July 2026

**Milestone:** M1 — manual training planning and tracking

**Priority:** P1

**Feature brief:** [F-002 approved](../product/F-002-MANUAL-TRAINING-PLANNING-TRACKING.md)

**Depends on:** [M1-01 accepted](M1-01-TRAINING-RECORDS-FOUNDATION.md)

**Blocks:** [M1-04](M1-04-TODAY-HISTORY-NAVIGATION.md) and [M1-05](M1-05-M1-VALIDATION-SLICE.md)

## Outcome

The owner can record what actually happened after a planned or unplanned
training session. Saving an actual record never edits the source plan.

## Proposed quick-log flow

1. Open a planned session from **Today** or **Plan**, or choose **Log unplanned
   training**.
2. Select one factual outcome:
   `completed`, `partially_completed`, `skipped`, `replaced`, `rest`, or
   `unplanned`.
3. Confirm actual date/time and optional duration.
4. Add optional perceived effort, feeling relative to expectation, and a short
   note.
5. For completed/partial/replaced/unplanned training, optionally record
   activity results using the accepted sport-agnostic measurement modes.
6. Review the source plan and actual summary as visibly separate sections.
7. Choose **Save actual**. FitTip creates an immutable factual completion.
8. A later correction creates an explicit revision and retains the prior fact.

## Scope

- Quick log for planned and unplanned training.
- Status-specific required/optional fields and safe validation.
- Actual duration, effort, feeling, note, skip/replacement reason, and optional
  activity measurements.
- Optional structured pain/illness/injury/severe-fatigue signal only if its
  exact privacy and safety behavior is approved for this ticket.
- Completion revision/correction history using the accepted M1-01 contract.
- Idempotent save and duplicate-submission protection.
- Owner-scoped server actions/repositories and RLS regression tests.
- Mobile form, accessible controls, honest errors, and `390x844` browser
  evidence.

## Rules

- A completion may reference a planned session but never becomes part of the
  plan version.
- Logging does not mark, rewrite, remove, or unlock planned content.
- A skipped record is factual and remains distinct from deleting a planned
  session.
- A replaced session preserves what was planned and records what was actually
  done.
- Free text is never written to application logs, analytics, snapshots, or
  external services.
- Safety behavior is conservative and non-diagnostic. M1 adds no automated
  medical interpretation or training prescription.

## Non-goals

- Detailed per-set logging as the primary flow.
- AI extraction, coaching, plan changes, replanning, pattern detection, or
  memory creation.
- Performance dashboards, streaks, scores, public sharing, or comparisons.
- Device, wearable, location, HealthKit, Health Connect, or calendar data.
- External analytics, monitoring content, friend data, or public registration.

## Acceptance criteria

1. At `390x844`, the owner can log a planned session in under one focused form.
2. Completed, partial, skipped, replaced, rest, and unplanned outcomes each
   enforce the approved field rules.
3. The saved plan version remains byte-for-byte/domain-equivalent after
   logging.
4. Replaced training shows both the original plan and actual replacement.
5. An unplanned completion requires no planned-session id.
6. A correction retains the original completion and exposes revision history.
7. Duplicate submit/retry creates one factual result.
8. Malformed measurements and out-of-range effort/duration fail safely.
9. Anonymous and cross-user access are denied.
10. Notes, sensitive flags, credentials, and identifiers do not enter logs,
    analytics, or client-side error payloads.

## Test and validation plan

- Domain matrix for every status and field combination.
- Plan immutability and completion-revision tests.
- Idempotency, stale correction, malformed measurement, and safe-error tests.
- Owner, anonymous, and cross-user database/repository tests.
- Component accessibility and mobile keyboard tests.
- Playwright at `390x844`: planned complete, partial, skipped, replacement,
  unplanned log, and correction-history path.
- Content/log/secret/external-request scan.
- Existing lint, typecheck, unit, formatting-baseline, build, and regression
  commands.

## Implementation sequence and file guidance

1. Approve statuses, exact fields, correction semantics, safety/privacy
   handling, and visible copy.
2. Add completion domain service/server actions over M1-01 repositories.
3. Add one reusable quick-log form with status-driven sections.
4. Integrate source-plan display without changing plan ownership.
5. Add automated and 390px evidence.
6. Produce `docs/validation/M1-03-VALIDATION.md` at testable status.

## Open product, safety, and privacy decisions

1. **Required fields.** Recommendation: status only is always required;
   replacement requires an actual description; other details remain optional.
2. **Effort scale.** Recommendation: optional 1–10 perceived effort with a
   visible **Not recorded** state.
3. **Feeling.** Recommendation: optional
   `much_easier`, `easier`, `as_expected`, `harder`, `much_harder`.
4. **Correction behavior.** Recommendation: append-only revision with reason
   and current pointer; never destructive in-place editing.
5. **Notes.** Approve length, retention classification, prohibited
   logging/analytics, and later access/deletion handling.
6. **Pain/illness flags.** Recommendation: include optional structured flags
   with static non-diagnostic stop/seek-help copy for severe, acute, or
   worsening reports; do not interpret them or modify the plan in M1.
7. **Detailed measurements.** Recommendation: optional activity summary now;
   detailed per-set capture remains a later secondary mode.
8. **Success behavior.** Recommendation: return to Today with a concise actual
   summary and a link to history.

## Approval

The product owner approved this ticket and its listed outcome, required-field,
effort/feeling, correction, note/privacy, pain/illness, measurement-depth, and
mobile-copy recommendations in chat on 28 July 2026. The ticket remains queued
and must not enter development until M1-01 is accepted.
