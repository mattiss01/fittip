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
import { synthesizePlanBody } from "@/server/ai/fixtures/synthetic-plan";
import { synthesizeRoadmapBody } from "@/server/ai/fixtures/synthetic-roadmap";

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
  /**
   * Answer with a proposal derived from the request's own context instead of a
   * corpus literal. Every corpus body has fixed dates and fixed goal ids, so a
   * real owner rejects all of them; this is what makes the surface reviewable
   * without a provider. Still a pure function of its input, and still no
   * socket.
   */
  readonly synthesizeFromContext?: boolean;
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

    if (script.synthesizeFromContext) {
      return {
        body:
          operation === "create_roadmap"
            ? synthesizeRoadmapBody(request.context)
            : synthesizePlanBody(request.context),
        reportedInputTokens: script.reportedInputTokens ?? null,
        reportedOutputTokens: script.reportedOutputTokens ?? null,
      };
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
