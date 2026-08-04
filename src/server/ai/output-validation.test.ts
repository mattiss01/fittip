import { describe, expect, it } from "vitest";

import {
  COACH_AI_FIXTURE_CASES,
  COACH_AI_FIXTURE_CONTEXT,
  COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
  findCoachAIFixtureCase,
} from "@/server/ai/fixtures/fixture-corpus";
import {
  COACH_AI_MAX_OUTPUT_BYTES,
  COACH_AI_REJECTION_REASONS,
  validateCoachAICandidate,
} from "@/server/ai/output-validation";

function validate(fixtureName: string) {
  const fixture = findCoachAIFixtureCase(fixtureName);
  return validateCoachAICandidate({
    operation: fixture.operation,
    body: fixture.body,
    context: COACH_AI_FIXTURE_CONTEXT,
  });
}

describe("the authored fixture checklist", () => {
  it.each(COACH_AI_FIXTURE_CASES.map((entry) => [entry.name, entry] as const))(
    "handles %s as authored",
    (_name, fixture) => {
      expect(
        validateCoachAICandidate({
          operation: fixture.operation,
          body: fixture.body,
          context: COACH_AI_FIXTURE_CONTEXT,
        }),
      ).toMatchObject(fixture.expected);
    },
  );

  it("names every rejection reason the validator can produce", () => {
    // A reason with no fixture is a failure mode nobody wrote down, which is
    // the gap this corpus exists to make visible.
    const covered = new Set(
      COACH_AI_FIXTURE_CASES.flatMap((entry) =>
        entry.expected.outcome === "rejected" ? [entry.expected.reason] : [],
      ),
    );

    expect(
      [...COACH_AI_REJECTION_REASONS].filter((r) => !covered.has(r)),
    ).toEqual([]);
  });

  it("covers both operations with an accepted case", () => {
    const accepted = COACH_AI_FIXTURE_CASES.filter(
      (entry) => entry.expected.outcome === "accepted",
    ).map((entry) => entry.operation);

    expect(new Set(accepted)).toEqual(
      new Set(["create_roadmap", "create_seven_day_plan"]),
    );
  });

  it("gives every case a reason for being on the list", () => {
    for (const entry of COACH_AI_FIXTURE_CASES) {
      expect(entry.note.length).toBeGreaterThan(20);
    }
  });
});

describe("accepted output", () => {
  it("returns a proposal carrying only the schema's fields", () => {
    const result = validate("valid_roadmap");
    if (result.outcome !== "accepted") throw new Error("expected acceptance");
    if (!("phases" in result.proposal)) throw new Error("expected a roadmap");

    expect(Object.keys(result.proposal).sort()).toEqual([
      "phases",
      "schemaVersion",
      "summary",
    ]);
    expect(Object.keys(result.proposal.phases[0]).sort()).toEqual([
      "endDate",
      "focus",
      "goalId",
      "startDate",
      "title",
    ]);
  });

  it("rebuilds the proposal rather than passing the parsed body through", () => {
    const result = validateCoachAICandidate({
      operation: "create_seven_day_plan",
      body: JSON.stringify({
        schemaVersion: "fittip.seven-day-plan.v1",
        startDate: "2026-08-04",
        sessions: [
          {
            date: "2026-08-04",
            title: "Easy aerobic run",
            intent: "Conversational effort.",
            durationMinutes: 45,
            goalId: COACH_AI_FIXTURE_TARGETABLE_GOAL_ID,
          },
        ],
      }),
      context: COACH_AI_FIXTURE_CONTEXT,
    });

    if (result.outcome !== "accepted") throw new Error("expected acceptance");
    if (!("sessions" in result.proposal)) throw new Error("expected a plan");
    expect(Object.keys(result.proposal.sessions[0]).sort()).toEqual([
      "date",
      "durationMinutes",
      "goalId",
      "intent",
      "title",
    ]);
  });
});

describe("size bounding", () => {
  it("rejects on size before it tries to parse", () => {
    // Unparseable and oversized at once. Reporting size proves the size check
    // ran first, which is the point: nothing parses an unbounded body.
    const result = validateCoachAICandidate({
      operation: "create_roadmap",
      body: "{".repeat(COACH_AI_MAX_OUTPUT_BYTES + 1),
      context: COACH_AI_FIXTURE_CONTEXT,
    });

    expect(result).toEqual({ outcome: "rejected", reason: "too_large" });
  });

  it("measures bytes rather than characters", () => {
    const body = "🏔".repeat(COACH_AI_MAX_OUTPUT_BYTES / 3);

    expect(
      validateCoachAICandidate({
        operation: "create_roadmap",
        body,
        context: COACH_AI_FIXTURE_CONTEXT,
      }),
    ).toEqual({ outcome: "rejected", reason: "too_large" });
  });
});

describe("goal reference checking", () => {
  it("rejects every proposal when the owner has nothing targetable", () => {
    const result = validateCoachAICandidate({
      operation: "create_roadmap",
      body: findCoachAIFixtureCase("valid_roadmap").body,
      context: { ...COACH_AI_FIXTURE_CONTEXT, targetableGoals: [] },
    });

    expect(result).toEqual({
      outcome: "rejected",
      reason: "unowned_goal_reference",
    });
  });
});
