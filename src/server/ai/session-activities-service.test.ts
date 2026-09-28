import { describe, expect, it } from "vitest";

import { createSessionActivitiesCoachAIService } from "@/server/ai/composition";
import type { CoachAIOwnedRecords } from "@/server/ai/context";
import type { CoachAIContextSource } from "@/server/ai/context-source";
import type { SessionActivitiesProposal } from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";

/**
 * A7-2 end to end in fixture mode: the real composition root, the real
 * service, the real assembly, the example coach and the real validator, over a
 * stub source. What it proves is that the third operation is wired through
 * every step rather than falling into another operation's branch.
 */

const OWNER_ID = "9f000000-0000-4000-8000-000000000001";
const OWNER = { id: OWNER_ID } as unknown as CoachAIOwner;
const SESSION_ID = "5d000000-0000-4000-8000-000000000001";
const SQUAT_ID = "5d000000-0000-4000-8000-0000000000a1";
const TODAY = "2026-08-11";

class SessionSource implements CoachAIContextSource {
  async load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords> {
    return {
      ownerId: owner.id,
      today: TODAY,
      goalCollectionRevision: 1,
      memoryCollectionRevision: 1,
      goals: [],
      memory: [],
      training: {
        today: TODAY,
        horizonEndDate: TODAY,
        completions: [],
        plannedSessions: [],
      },
      sessionDetail: {
        session: {
          id: SESSION_ID,
          localDate: TODAY,
          status: "active",
          title: "Lower body",
          sport: "Strength",
          intent: null,
          durationMinutes: 45,
          note: null,
          activities: [],
        },
        week: [],
        library: [
          {
            id: SQUAT_ID,
            name: "Back squat",
            sport: "Strength",
            measurementMode: "sets_reps_load",
          },
        ],
        savedSessions: [],
        recentActuals: [],
      },
    };
  }
}

function compose(sessionId = SESSION_ID) {
  return {
    horizonStartDate: TODAY,
    horizonEndDate: TODAY,
    planningNote: "Only 45 minutes today.",
    regenerationFeedback: null,
    previousProposal: null,
    sessionId,
  };
}

describe("fill_session_activities through the composition root", () => {
  it("answers with a validated activity list and spends nothing", async () => {
    const { service, mode } = createSessionActivitiesCoachAIService({
      owner: OWNER,
      sessionId: SESSION_ID,
      contextSource: new SessionSource(),
      environment: {},
    });

    const outcome = await service.propose({
      operation: "fill_session_activities",
      owner: OWNER,
      compose: compose(),
    });

    expect(mode).toBe("fixture");
    expect(outcome.operation).toBe("fill_session_activities");
    expect(outcome.spendReservationId).toBeNull();
    expect(outcome.memoryCandidates).toEqual([]);
    const proposal = outcome.proposal as SessionActivitiesProposal;
    expect(proposal.schemaVersion).toBe("fittip.session-activities.v1");
    expect(proposal.activities).toEqual([
      expect.objectContaining({ personalActivityId: SQUAT_ID }),
    ]);
  });

  it("refuses a request about a different session than the one it read", async () => {
    const { service } = createSessionActivitiesCoachAIService({
      owner: OWNER,
      sessionId: SESSION_ID,
      contextSource: new SessionSource(),
      environment: {},
    });

    await expect(
      service.propose({
        operation: "fill_session_activities",
        owner: OWNER,
        compose: compose("5d000000-0000-4000-8000-000000000999"),
      }),
    ).rejects.toThrow(CoachAIError);
  });
});
