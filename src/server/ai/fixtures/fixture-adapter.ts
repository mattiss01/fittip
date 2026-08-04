import "server-only";

import type {
  CoachAI,
  CoachAICandidate,
  CoachAIOperation,
  CoachAIRequest,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import {
  findCoachAIFixtureCase,
  type CoachAIFixtureCase,
} from "@/server/ai/fixtures/fixture-corpus";

/**
 * A deterministic adapter over the authored corpus.
 *
 * It is a pure function of its script: same script, same body, every time, with
 * no clock, no randomness, no environment read, and no socket. It declares
 * `kind: "fixture"`, which is what tells the domain service that the live
 * enablement gate does not apply — there is no provider to reach and nothing to
 * spend.
 */

export type CoachAIFixtureScript = {
  /** A case name from the corpus. */
  readonly caseName?: string;
  /** Simulates a provider that never answered. */
  readonly failWith?: "unavailable";
  /** Simulates a provider that reported no usage; unknown is never zero. */
  readonly reportedInputTokens?: number | null;
  readonly reportedOutputTokens?: number | null;
};

export class FixtureCoachAI implements CoachAI {
  readonly kind = "fixture" as const;
  readonly providerCode = "fixture";
  readonly modelCode = "fixture-corpus-v1";

  constructor(
    private readonly script: Partial<
      Record<CoachAIOperation, CoachAIFixtureScript>
    >,
  ) {}

  createRoadmap(request: CoachAIRequest): Promise<CoachAICandidate> {
    return this.#respond("create_roadmap", request);
  }

  createSevenDayPlan(request: CoachAIRequest): Promise<CoachAICandidate> {
    return this.#respond("create_seven_day_plan", request);
  }

  async #respond(
    operation: CoachAIOperation,
    request: CoachAIRequest,
  ): Promise<CoachAICandidate> {
    // A request routed to the wrong method is a caller bug, not a provider
    // failure, and it must not silently produce a plausible answer.
    if (request.operation !== operation) {
      throw new CoachAIError("invalid_input");
    }

    const script = this.script[operation];
    if (!script || script.failWith === "unavailable") {
      throw new CoachAIError("provider_unavailable");
    }

    const fixture: CoachAIFixtureCase = findCoachAIFixtureCase(
      script.caseName ?? "",
    );
    if (fixture.operation !== operation) {
      throw new CoachAIError("invalid_input");
    }

    return {
      body: fixture.body,
      reportedInputTokens: script.reportedInputTokens ?? null,
      reportedOutputTokens: script.reportedOutputTokens ?? null,
    };
  }
}
