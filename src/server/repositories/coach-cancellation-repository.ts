import "server-only";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";

/** A cancellation the coach's proposal made, once the owner accepted it. */
export type CoachCancellation = { replacedBySessionId: string | null };

/** What these reads need of a plan session, as the plan read returns it. */
export type CoachCancellationSession = {
  id: string;
  localDate: string;
  title: string;
  status: "active" | "cancelled";
  cancelledAt: string | null;
};

export class CoachCancellationAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "CoachCancellationAuthenticationError";
  }
}

export class CoachCancellationPersistenceError extends Error {
  constructor() {
    super("What the coach's proposal cancelled could not be read.");
    this.name = "CoachCancellationPersistenceError";
  }
}

/**
 * What a finished review cancelled, and what replaced it (ADR-033). Read-only:
 * `finish_plan_proposal_review` is the table's one writer.
 *
 * Kept apart from `session-cancellation-repository` on purpose. That one holds
 * the owner's own words about why, and its reach is pinned by
 * `src/architecture/session-cancellation-boundary.test.ts`; this one holds no
 * text at all, only which session stood in for which, so the Plan and Today
 * can leave a replaced session off its day.
 */
export class CoachCancellations {
  constructor(private readonly client: ServerUserClient) {}

  /**
   * Which of these cancelled sessions the coach's proposal cancelled, by
   * session id, with the session that replaced it or null for a suggested
   * cancel. A record counts only while it is about the session's current
   * cancellation: one brought back and later cancelled by hand is the
   * owner's own cancellation again, and is absent here.
   */
  async list(
    sessions: readonly { id: string; cancelledAt: string | null }[],
  ): Promise<Map<string, CoachCancellation>> {
    const cancelled = sessions.filter(
      (session): session is { id: string; cancelledAt: string } =>
        session.cancelledAt !== null,
    );
    if (cancelled.length === 0) return new Map();
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("plan_proposal_cancellations")
      .select("session_id, replaced_by_session_id, cancelled_at")
      .eq("user_id", userId)
      .in(
        "session_id",
        cancelled.map((session) => session.id),
      );
    if (error) throw new CoachCancellationPersistenceError();
    const current = new Map(
      cancelled.map((session) => [session.id, Date.parse(session.cancelledAt)]),
    );
    return new Map(
      data
        .filter(
          (row) => Date.parse(row.cancelled_at) === current.get(row.session_id),
        )
        .map((row) => [
          row.session_id,
          { replacedBySessionId: row.replaced_by_session_id },
        ]),
    );
  }

  /**
   * The ids of these sessions to leave off their day: cancelled by a coach's
   * replacement that is, among `sessions`, still active and on the same day.
   * A replacement cancelled or moved since no longer stands beside it, so the
   * old session shows again, with its own Reactivate (ADR-033).
   */
  async listHiddenByReplacement(
    sessions: readonly CoachCancellationSession[],
  ): Promise<Set<string>> {
    const coach = await this.list(sessions);
    const byId = new Map(sessions.map((session) => [session.id, session]));
    return new Set(
      [...coach]
        .filter(([sessionId, cancellation]) => {
          const replacement =
            cancellation.replacedBySessionId === null
              ? undefined
              : byId.get(cancellation.replacedBySessionId);
          return (
            replacement !== undefined &&
            replacement.status === "active" &&
            replacement.localDate === byId.get(sessionId)?.localDate
          );
        })
        .map(([sessionId]) => sessionId),
    );
  }

  /**
   * The session a coach's replacement stands in for, found among
   * `sessions`, while it is still cancelled by that replacement; null
   * otherwise. One brought back since, or cancelled again by hand, no longer
   * matches the record.
   */
  async findStandingInFor(
    replacementId: string,
    sessions: readonly CoachCancellationSession[],
  ): Promise<{ sessionId: string; title: string } | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("plan_proposal_cancellations")
      .select("session_id, cancelled_at")
      .eq("user_id", userId)
      .eq("replaced_by_session_id", replacementId)
      .order("cancelled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new CoachCancellationPersistenceError();
    if (data === null) return null;
    const old = sessions.find((session) => session.id === data.session_id);
    return old !== undefined &&
      old.status === "cancelled" &&
      old.cancelledAt !== null &&
      Date.parse(old.cancelledAt) === Date.parse(data.cancelled_at)
      ? { sessionId: old.id, title: old.title }
      : null;
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new CoachCancellationAuthenticationError(error);
      }
      throw new CoachCancellationAuthenticationError();
    }
  }
}

export async function createCoachCancellations(): Promise<CoachCancellations> {
  return new CoachCancellations(await createServerUserClient());
}
