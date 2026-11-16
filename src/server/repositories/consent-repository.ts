import "server-only";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import { COACH_NOTICE_VERSION } from "@/lib/coach-notice";
import { TERMS_VERSION } from "@/lib/legal";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";

/**
 * `terms`: the Terms, accepted before the app opens. `health`: the explicit
 * consent to storing health information, given on its own line beside them
 * and also required (owner, 15 Nov 2026). `coach`: what the coach is sent,
 * agreed or declined on its own.
 */
export type ConsentKind = "terms" | "health" | "coach";
export type ConsentDecision = "agreed" | "declined";

/**
 * The decision in force for one kind. A decision made against an older
 * version of the text is no decision: the person has not read what is now
 * true.
 */
export type ConsentState =
  | { status: "undecided" }
  | { status: ConsentDecision; decidedAt: string };

const CURRENT_VERSION: Record<ConsentKind, string> = {
  terms: TERMS_VERSION,
  health: TERMS_VERSION,
  coach: COACH_NOTICE_VERSION,
};

export class ConsentAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "ConsentAuthenticationError";
  }
}

export class ConsentPersistenceError extends Error {
  constructor() {
    super("The decision could not be read or saved.");
    this.name = "ConsentPersistenceError";
  }
}

/**
 * A person's decisions about the terms and about the coach (ADR-043 decision
 * 5). Append-only: agreeing, declining and withdrawing each add a row, and
 * per kind the latest is in force. The database refuses every coach spend
 * unless the latest coach row agrees (`reserve_ai_spend`, PT403), and refuses
 * a declined terms row; this is the application's own reading, which also
 * knows the current versions.
 */
export class Consents {
  constructor(private readonly client: ServerUserClient) {}

  async current(kind: ConsentKind): Promise<ConsentState> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("consent_decisions")
      .select("decision, version, decided_at")
      .eq("user_id", userId)
      .eq("kind", kind)
      .order("decided_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ConsentPersistenceError();
    if (data === null || data.version !== CURRENT_VERSION[kind]) {
      return { status: "undecided" };
    }
    if (data.decision !== "agreed" && data.decision !== "declined") {
      throw new ConsentPersistenceError();
    }
    return { status: data.decision, decidedAt: data.decided_at };
  }

  /** Records a decision against the text as it reads today. */
  async record(kind: ConsentKind, decision: ConsentDecision): Promise<void> {
    if (
      (kind !== "terms" && kind !== "health" && kind !== "coach") ||
      (decision !== "agreed" && decision !== "declined") ||
      (kind !== "coach" && decision !== "agreed")
    ) {
      throw new ConsentPersistenceError();
    }
    const userId = await this.getVerifiedUserId();
    const { error } = await this.client.from("consent_decisions").insert({
      user_id: userId,
      kind,
      decision,
      version: CURRENT_VERSION[kind],
    });
    if (error) throw new ConsentPersistenceError();
  }

  private async getVerifiedUserId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new ConsentAuthenticationError(error);
      }
      throw new ConsentAuthenticationError();
    }
  }
}

export async function createConsents(): Promise<Consents> {
  return new Consents(await createServerUserClient());
}
