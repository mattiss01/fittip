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
  CANCELLATION_REASONS,
  parseSessionCancellation,
  SessionCancellationValidationError,
  type CancellationReason,
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
 * Why a session was cancelled, read and edited apart from the plan. Only the
 * session's own page uses this: the plan read, the coach's context, and every
 * snapshot go through `rolling-plan-repository`, which never touches the
 * table, so a stored reason cannot reach a coach by accident (owner,
 * 29 Sep 2026; see the migration `session_cancellation_reason`).
 */
export class SessionCancellations {
  constructor(private readonly client: ServerUserClient) {}

  /** The owner's reason for this session, or null when none was given. */
  async get(sessionId: string): Promise<SessionCancellation | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("rolling_plan_session_cancellations")
      .select("reason, note")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new SessionCancellationPersistenceError();
    if (data === null) return null;
    const reason = data.reason;
    if (
      reason !== null &&
      !(CANCELLATION_REASONS as readonly string[]).includes(reason)
    ) {
      throw new SessionCancellationPersistenceError();
    }
    return { reason: reason as CancellationReason | null, note: data.note };
  }

  /**
   * Replaces the reason on the owner's own cancelled session; neither a pick
   * nor a note clears it. The database refuses any other session.
   */
  async set(
    sessionId: string,
    reason: unknown,
    note: unknown,
  ): Promise<SessionCancellation> {
    const parsed = parseSessionCancellation(reason, note);
    await this.getVerifiedUserId();
    const { error } = await this.client.rpc("set_session_cancellation_reason", {
      p_session_id: sessionId,
      // The generated signature types these as non-null text; null is what
      // the function reads as "cleared".
      p_reason: parsed.reason as string,
      p_note: parsed.note as string,
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
