import "server-only";

import {
  createSessionActivityRepository,
  SessionActivityPersistenceError,
  type SessionActivityRepository,
} from "@/server/repositories/session-activity-repository";

/**
 * The form field a session editor carries when the owner accepted a coach's
 * suggestion into its activity list and has not saved yet.
 */
export const ACTIVITY_PROPOSAL_FIELD = "activityProposalId";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ATTEMPTS = 3;

/**
 * Record that the owner saved a coach's list, after the save has landed.
 *
 * The order is the point (A7-3 review): the decision is final and is not
 * written in the plan's transaction, so deciding first could leave a list that
 * never reached the plan recorded as "accepted" for good. Saving first can
 * only err the other way — a saved list whose proposal stays undecided — and
 * that is retried here, since the function replays the same decision safely.
 *
 * The id comes from the form, so it is checked against the session the form
 * saved: the database confirms only that the proposal is the owner's, and an
 * edit to one session must not mark another session's suggestion accepted. A
 * proposal whose session has since been deleted (its link cleared) is let
 * through, since there is no other session it could be confused with.
 *
 * Returns whether every decision stands. A form without the field has nothing
 * to record and answers `true`; an id the form made up, or a proposal already
 * dismissed, answers `false` without retrying, because no retry changes it.
 * Nothing here throws: the plan is already saved, and a failure to record the
 * decision must not be reported as a failure to save.
 */
export async function recordAcceptedSessionActivities(
  formData: FormData,
  createRepository: () => Promise<SessionActivityRepository> = createSessionActivityRepository,
): Promise<boolean> {
  const sessionId = formData.get("sessionId");
  let allRecorded = true;
  for (const value of new Set(formData.getAll(ACTIVITY_PROPOSAL_FIELD))) {
    if (value === "") continue;
    if (
      typeof value !== "string" ||
      !UUID_PATTERN.test(value) ||
      typeof sessionId !== "string"
    ) {
      allRecorded = false;
      continue;
    }
    if (!(await recordOne(value, sessionId, createRepository))) {
      allRecorded = false;
    }
  }
  return allRecorded;
}

async function recordOne(
  proposalId: string,
  sessionId: string,
  createRepository: () => Promise<SessionActivityRepository>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const repository = await createRepository();
      const proposal = await repository.getProposal(proposalId);
      if (
        proposal === null ||
        (proposal.sessionId !== null && proposal.sessionId !== sessionId)
      ) {
        return false;
      }
      await repository.decide(proposalId, "accepted");
      return true;
    } catch (error) {
      // Only an opaque failure may be transient. A conflict (already
      // dismissed, or gone) and a lost sign-in answer the same every time.
      if (!(error instanceof SessionActivityPersistenceError)) return false;
    }
  }
  return false;
}

/** Appended to a save's own message when the decision could not be written. */
export const ACCEPTANCE_NOT_RECORDED =
  " The coach's suggestion could not be marked as used, but your session is saved.";
