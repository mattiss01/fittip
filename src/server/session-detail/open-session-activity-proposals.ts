import "server-only";

import {
  createSessionActivityRepository,
  SessionActivityAuthenticationError,
  SessionActivityPersistenceError,
  type SessionActivityProposalView,
} from "@/server/repositories/session-activity-repository";

export { SessionActivityAuthenticationError };

/**
 * The Plan's one read of coach suggestions (A7-4): each session's newest
 * suggestion nobody has accepted or dismissed, so one the owner saved past or
 * closed unanswered is back when they open the session again.
 *
 * A read and nothing else, so the Plan page can hold it without holding the
 * repository's writes or the paid request path. A suggestion that cannot be
 * read leaves the box empty rather than taking the Plan down — it stays stored
 * and undecided — but a lost sign-in is not swallowed, because the page's own
 * redirect is the honest answer to that.
 */
export async function readOpenSessionActivityProposals(
  sessionIds: readonly string[],
): Promise<SessionActivityProposalView[]> {
  try {
    const repository = await createSessionActivityRepository();
    return await repository.listOpenProposals(sessionIds);
  } catch (error) {
    if (error instanceof SessionActivityPersistenceError) return [];
    throw error;
  }
}
