import { describe, expect, it } from "vitest";

import type { CoachAIContext } from "@/server/ai/contracts";
import {
  COACH_AI_FIXTURE_LIBRARY_SQUAT_ID,
  COACH_AI_FIXTURE_PLAN_CONTEXT,
  COACH_AI_FIXTURE_SESSION_CONTEXT,
  COACH_AI_FIXTURE_SESSION_SAFETY_CONTEXT,
} from "@/server/ai/fixtures/fixture-corpus";
import { synthesizeSessionActivitiesBody } from "@/server/ai/fixtures/synthetic-session-activities";
import { validateSessionActivitiesCandidate } from "@/server/ai/output-validation";

/**
 * The example coach must pass the real validator in every shape a session can
 * take, or a founder without a provider sees a failure instead of a list.
 */

type Detail = NonNullable<CoachAIContext["sessionDetail"]>;

function withSession(
  base: CoachAIContext,
  edit: (detail: Detail) => Detail,
): CoachAIContext {
  return {
    ...base,
    sessionDetail: edit(base.sessionDetail as Detail),
  };
}

function accept(context: CoachAIContext) {
  const result = validateSessionActivitiesCandidate({
    body: synthesizeSessionActivitiesBody(context),
    context,
  });
  if (result.outcome !== "accepted") {
    throw new Error(`rejected: ${result.reason}`);
  }
  return result.proposal;
}

describe("synthesizeSessionActivitiesBody", () => {
  it("links same-sport library entries for an empty session", () => {
    const proposal = accept(COACH_AI_FIXTURE_SESSION_CONTEXT);

    expect(proposal.activities).toEqual([
      expect.objectContaining({
        personalActivityId: COACH_AI_FIXTURE_LIBRARY_SQUAT_ID,
        name: "Back squat",
        target: null,
      }),
    ]);
    expect(proposal.summary).toContain("example coach");
  });

  it("proposes one timed block when nothing in the library fits", () => {
    const proposal = accept(
      withSession(COACH_AI_FIXTURE_SESSION_CONTEXT, (detail) => ({
        ...detail,
        library: [],
      })),
    );

    expect(proposal.activities).toEqual([
      expect.objectContaining({
        personalActivityId: null,
        name: "Lower body main block",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 60, intensity: "moderate" },
      }),
    ]);
  });

  it("returns a session's own activities unchanged, the flat sets form as one group", () => {
    const proposal = accept(
      withSession(COACH_AI_FIXTURE_SESSION_CONTEXT, (detail) => ({
        ...detail,
        session: {
          ...detail.session,
          activities: [
            {
              personalActivityId: COACH_AI_FIXTURE_LIBRARY_SQUAT_ID,
              name: "Back squat",
              sport: "Strength",
              measurementMode: "sets_reps_load",
              target: { sets: 3, reps: 5, load: 80, load_unit: "kg" },
            },
            {
              personalActivityId: null,
              name: "Tennis drill",
              sport: "Tennis",
              measurementMode: "unmeasured",
              target: null,
            },
          ],
        },
      })),
    );

    expect(proposal.activities.map((activity) => activity.target)).toEqual([
      { groups: [{ sets: 3, reps: 5, load: 80 }], load_unit: "kg" },
      null,
    ]);
  });

  it("acknowledges a safety signal, so the validator's requirement holds", () => {
    const proposal = accept(COACH_AI_FIXTURE_SESSION_SAFETY_CONTEXT);

    expect(proposal.safetyConsiderations).toHaveLength(1);
  });

  it("refuses a context that carries no session", () => {
    expect(() =>
      synthesizeSessionActivitiesBody(COACH_AI_FIXTURE_PLAN_CONTEXT),
    ).toThrow();
  });
});
