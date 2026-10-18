import "server-only";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";
import {
  parseCancellationReason,
  SessionCancellationValidationError,
  type SessionCancellation,
} from "@/server/rolling-plan/session-cancellation";

export class SessionCancellationAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "SessionCancellationAuthenticationError";
  }
}

export class SessionCancellationPersistenceError extends Error {
  constructor() {
    super("The cancellation reason could not be read or saved.");
    this.name = "SessionCancellationPersistenceError";
  }
}

/**
 * Why a session was cancelled, read and edited apart from the plan. The
 * session's own page uses this, and since 17 Oct 2026 the coach's context
 * reads the reasons of cancelled sessions ahead (owner; ADR-013 seventh
 * amendment). The plan read and every snapshot still go through
 * `rolling-plan-repository`, which never touches the table, so a reason
 * reaches a coach only through that one deliberate read.
 */
export class SessionCancellations {
  constructor(private readonly client: ServerUserClient) {}

  /** The owner's reason for this session, or null when none was given. */
  async get(sessionId: string): Promise<SessionCancellation | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("rolling_plan_session_cancellations")
      .select("reason")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new SessionCancellationPersistenceError();
    return data === null ? null : { reason: data.reason };
  }

  /**
   * The owner's reasons for these sessions, by session id; a session with
   * none is absent. Read for the coach's context (owner, 17 Oct 2026, ADR-013
   * seventh amendment): a day called off for a trip is one the coach must
   * not fill again.
   */
  async listReasons(
    sessionIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (sessionIds.length === 0) return new Map();
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("rolling_plan_session_cancellations")
      .select("session_id, reason")
      .eq("user_id", userId)
      .in("session_id", [...sessionIds]);
    if (error) throw new SessionCancellationPersistenceError();
    return new Map(data.map((row) => [row.session_id, row.reason]));
  }

  /**
   * Replaces the reason on the owner's own cancelled session; a blank one
   * clears it. The database refuses any other session. Returns what is now
   * stored, or null when nothing is.
   */
  async set(sessionId: string, reason: unknown): Promise<string | null> {
    const parsed = parseCancellationReason(reason);
    await this.getVerifiedUserId();
    const { error } = await this.client.rpc("set_session_cancellation_reason", {
      p_session_id: sessionId,
      // The generated signature types this as non-null text; null is what
      // the function reads as "cleared".
      p_reason: parsed as string,
    });
    if (error) {
      if (error.code === "22023")
        throw new SessionCancellationValidationError();
      throw new SessionCancellationPersistenceError();
    }
    return parsed;
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new SessionCancellationAuthenticationError(error);
      }
      throw new SessionCancellationAuthenticationError();
    }
  }
}

export async function createSessionCancellations(): Promise<SessionCancellations> {
  return new SessionCancellations(await createServerUserClient());
}
