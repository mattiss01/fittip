import { describe, expect, it } from "vitest";

import type { Completion } from "@/server/completions/completion-log";
import type { PersonalActivity } from "@/server/personal-activities/personal-activities";
import type { RollingPlanSession } from "@/server/rolling-plan/rolling-plan";
import type { SavedSession } from "@/server/saved-sessions/saved-sessions";
import {
  buildSessionDetailContext,
  selectSessionDetailRecords,
  SESSION_DETAIL_BYTES,
  type SessionDetailRecords,
} from "@/server/session-detail/session-detail-context";
import { COACH_AI_CONTEXT_LIMITS } from "@/server/ai/context";

/**
 * ADR-020's selection and sizing, at their own boundary. The records are cast
 * from partial literals: the selector reads named fields one at a time, which
 * is what these tests pin — a field it does not read cannot reach the coach.
 */

const SESSION_ID = "5d000000-0000-4000-8000-000000000001";
const SQUAT_ID = "5d000000-0000-4000-8000-0000000000a1";
const ROW_ID = "5d000000-0000-4000-8000-0000000000a2";
const PUSH_UPS_ID = "5d000000-0000-4000-8000-0000000000d1";

function planSession(
  overrides: Partial<RollingPlanSession> = {},
): RollingPlanSession {
  return {
    id: SESSION_ID,
    localDate: "2026-10-07",
    position: 0,
    status: "active",
    title: "Lower body",
    sport: "Strength",
    intent: "Heavy, low reps",
    expectedDurationMinutes: 60,
    note: "Gym opens at 7",
    activities: [],
    ...overrides,
  } as unknown as RollingPlanSession;
}

function libraryEntry(
  overrides: Partial<PersonalActivity> = {},
): PersonalActivity {
  return {
    id: SQUAT_ID,
    name: "Back squat",
    sport: "Strength",
    measurementMode: "sets_reps_load",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as PersonalActivity;
}

function saved(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    id: "5d000000-0000-4000-8000-0000000000b1",
    name: "My legs day",
    title: "Legs",
    sport: "Strength",
    revision: 0,
    activities: [],
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as SavedSession;
}

function completion(
  localDate: string,
  activities: Completion["activities"],
): Completion {
  return {
    id: `c-${localDate}`,
    actualLocalDate: localDate,
    status: "completed",
    activities,
  } as unknown as Completion;
}

function select(
  overrides: Partial<Parameters<typeof selectSessionDetailRecords>[0]> = {},
) {
  return selectSessionDetailRecords({
    sessionId: SESSION_ID,
    planSessions: [planSession()],
    library: [],
    savedSessions: [],
    completions: [],
    ...overrides,
  });
}

describe("selectSessionDetailRecords", () => {
  it("returns null for a session that is not in the window it was given", () => {
    expect(select({ planSessions: [] })).toBeNull();
  });

  it("copies the session field by field and nothing else", () => {
    const records = select() as SessionDetailRecords;

    expect(records.session).toEqual({
      id: SESSION_ID,
      localDate: "2026-10-07",
      status: "active",
      title: "Lower body",
      sport: "Strength",
      intent: "Heavy, low reps",
      durationMinutes: 60,
      note: "Gym opens at 7",
      coachNote: null,
      activities: [],
    });
    expect(JSON.stringify(records)).not.toContain("isLocked");
  });

  it("sends the saved coach's note and each activity's reason, cut short", () => {
    const records = select({
      planSessions: [
        planSession({
          coachNote: "A push session: chest, shoulders, triceps.",
          activities: [
            {
              id: "a1",
              position: 0,
              name: "Bench press",
              sport: "Strength",
              rationale: "R".repeat(300),
              measurementMode: "unmeasured",
            },
          ],
        }),
      ],
    }) as SessionDetailRecords;

    expect(records.session.coachNote).toBe(
      "A push session: chest, shoulders, triceps.",
    );
    expect(records.session.activities[0].rationale).toHaveLength(160);
  });

  it("reads the list and note on screen in place of the saved ones (ADR-040)", () => {
    const records = select({
      planSessions: [
        planSession({
          coachNote: "Saved note",
          activities: [
            {
              id: "a1",
              position: 0,
              name: "Saved row",
              sport: "Strength",
              measurementMode: "unmeasured",
            },
          ],
        }),
      ],
      draft: {
        coachNote: "A push session.",
        activities: [
          {
            position: 0,
            name: "Bench press",
            sport: "Strength",
            rationale: "The main press.",
            measurementMode: "unmeasured",
          },
          {
            position: 1,
            name: "Dips",
            sport: "Strength",
            measurementMode: "unmeasured",
          },
        ],
      },
    }) as SessionDetailRecords;

    expect(records.session.coachNote).toBe("A push session.");
    expect(
      records.session.activities.map((activity) => [
        activity.name,
        activity.rationale,
      ]),
    ).toEqual([
      ["Bench press", "The main press."],
      ["Dips", null],
    ]);
  });

  it("sends no note when the one on screen was cleared", () => {
    const records = select({
      planSessions: [planSession({ coachNote: "Saved note" })],
      draft: { coachNote: null, activities: [] },
    }) as SessionDetailRecords;

    expect(records.session.coachNote).toBeNull();
  });

  it("reads the week as the other active sessions three days either side", () => {
    const records = select({
      planSessions: [
        planSession(),
        planSession({
          id: "w1",
          localDate: "2026-10-04",
          title: "Edge before",
        }),
        planSession({ id: "w2", localDate: "2026-10-03", title: "Too early" }),
        planSession({ id: "w3", localDate: "2026-10-10", title: "Edge after" }),
        planSession({ id: "w4", localDate: "2026-10-11", title: "Too late" }),
        planSession({
          id: "w5",
          localDate: "2026-10-08",
          title: "Called off",
          status: "cancelled",
        }),
      ],
    }) as SessionDetailRecords;

    expect(records.week.map((entry) => entry.title)).toEqual([
      "Edge before",
      "Edge after",
    ]);
  });

  it("names the neighbours' activities, and sends none of their targets", () => {
    const records = select({
      planSessions: [
        planSession(),
        planSession({
          id: "w1",
          localDate: "2026-10-06",
          title: "Yesterday's legs",
          activities: [
            {
              position: 0,
              name: "Back squat",
              sport: "Strength",
              measurementMode: "sets_reps_load",
              target: {
                groups: [{ sets: 5, reps: 5, load: 100 }],
                load_unit: "kg",
              },
            },
          ] as unknown as RollingPlanSession["activities"],
        }),
      ],
    }) as SessionDetailRecords;

    // ADR-023 decision 16: enough to see that squats were yesterday.
    expect(records.week).toEqual([
      {
        localDate: "2026-10-06",
        title: "Yesterday's legs",
        sport: "Strength",
        durationMinutes: 60,
        activityNames: ["Back squat"],
      },
    ]);
    expect(JSON.stringify(records.week)).not.toContain("groups");
  });

  it("prefers saved sessions with the same title, then the same sport, at most three", () => {
    const records = select({
      savedSessions: [
        saved({ title: "Legs" }),
        saved({ title: "Upper", sport: "Strength" }),
        saved({ title: "lower  BODY", sport: "Other" }),
        saved({ title: "Intervals", sport: "Running" }),
        saved({ title: "Pull", sport: "strength" }),
        saved({ title: "Push", sport: "Strength" }),
      ],
    }) as SessionDetailRecords;

    expect(records.savedSessions.map((entry) => entry.title)).toEqual([
      "lower  BODY",
      "Legs",
      "Upper",
    ]);
  });

  it("reads the last three recorded actuals, matching by link and then by name", () => {
    const records = select({
      planSessions: [
        planSession({
          activities: [
            {
              personalActivityId: SQUAT_ID,
              position: 0,
              name: "Back squat",
              sport: "Strength",
              measurementMode: "sets_reps_load",
            },
            {
              position: 1,
              name: "Walking lunge",
              sport: "Strength",
              measurementMode: "unmeasured",
            },
          ] as RollingPlanSession["activities"],
        }),
      ],
      completions: [
        completion("2026-10-05", [
          {
            personalActivityId: SQUAT_ID,
            position: 0,
            name: "Renamed squat",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            actualMeasurement: {
              groups: [{ sets: 3, reps: 5, load: 80 }],
              load_unit: "kg",
            },
          },
          {
            position: 1,
            name: "walking  lunge",
            sport: "Strength",
            measurementMode: "duration_intensity",
            actualMeasurement: { duration_minutes: 5 },
          },
        ]),
        // A skip, or a log from before actuals: nothing to learn from.
        completion("2026-10-02", [
          {
            personalActivityId: SQUAT_ID,
            position: 0,
            name: "Back squat",
            sport: "Strength",
            measurementMode: "sets_reps_load",
          },
        ]),
        ...["2026-09-30", "2026-09-28", "2026-09-26"].map((date) =>
          completion(date, [
            {
              personalActivityId: SQUAT_ID,
              position: 0,
              name: "Back squat",
              sport: "Strength",
              measurementMode: "sets_reps_load",
              actualMeasurement: {
                groups: [{ sets: 3, reps: 5, load: 75 }],
                load_unit: "kg",
              },
            },
          ]),
        ),
      ],
    }) as SessionDetailRecords;

    expect(records.recentActuals.map((entry) => entry.name)).toEqual([
      "Back squat",
      "Walking lunge",
    ]);
    expect(
      records.recentActuals[0].entries.map((entry) => entry.localDate),
    ).toEqual(["2026-10-05", "2026-09-30", "2026-09-28"]);
    expect(records.recentActuals[1].entries).toEqual([
      {
        completionId: "c-2026-10-05",
        localDate: "2026-10-05",
        measurementMode: "duration_intensity",
        actual: { duration_minutes: 5 },
      },
    ]);
  });

  it("reads same-sport library entries first, then those of any other sport", () => {
    const records = select({
      library: [
        libraryEntry(),
        libraryEntry({ id: ROW_ID, name: "Rowing", sport: "Rowing" }),
      ],
      completions: [
        // Rowing is the more recent, and still comes second.
        completion("2026-10-06", [
          {
            personalActivityId: ROW_ID,
            position: 0,
            name: "Rowing",
            sport: "Rowing",
            measurementMode: "duration_intensity",
            actualMeasurement: { duration_minutes: 20 },
          },
        ]),
        completion("2026-10-05", [
          {
            personalActivityId: SQUAT_ID,
            position: 0,
            name: "Back squat",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 5, reps: 5 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(records.library).toHaveLength(2);
    expect(records.recentActuals.map((entry) => entry.name)).toEqual([
      "Back squat",
      "Rowing",
    ]);
  });

  it("finds push-ups filed under another sport (owner, 19 Nov 2026)", () => {
    // A fill of a strength session did not know about push-ups done at
    // least five times with results: the library had them as bodyweight.

    const records = select({
      planSessions: [planSession({ title: "Upper body" })],
      library: [
        libraryEntry({
          id: PUSH_UPS_ID,
          name: "Push-ups",
          sport: "Bodyweight",
        }),
      ],
      completions: [
        "2026-10-06",
        "2026-10-04",
        "2026-10-02",
        "2026-09-30",
        "2026-09-28",
      ].map((date, index) =>
        completion(date, [
          {
            personalActivityId: PUSH_UPS_ID,
            position: 0,
            name: "Push-ups",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 15 - index }] },
          },
        ]),
      ),
    }) as SessionDetailRecords;

    expect(records.recentActuals).toHaveLength(1);
    expect(records.recentActuals[0]).toMatchObject({
      name: "Push-ups",
      personalActivityId: PUSH_UPS_ID,
    });
    expect(
      records.recentActuals[0].entries.map((entry) => entry.localDate),
    ).toEqual(["2026-10-06", "2026-10-04", "2026-10-02"]);
  });

  it("finds a result logged without a library link, by its name", () => {
    const records = select({
      completions: [
        completion("2026-10-05", [
          {
            position: 0,
            name: "Push-ups",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 12 }] },
          },
        ]),
        completion("2026-10-03", [
          {
            position: 0,
            name: "push-ups ",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 10 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(records.recentActuals).toHaveLength(1);
    expect(records.recentActuals[0].personalActivityId).toBeNull();
    expect(
      records.recentActuals[0].entries.map((entry) => entry.localDate),
    ).toEqual(["2026-10-05", "2026-10-03"]);
  });

  it("reads an unlinked row with a library entry's name once, under the entry", () => {
    const records = select({
      library: [
        libraryEntry({
          id: PUSH_UPS_ID,
          name: "Push-ups",
          sport: "Bodyweight",
        }),
      ],
      completions: [
        completion("2026-10-05", [
          {
            position: 0,
            name: "Push-ups",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 12 }] },
          },
        ]),
        completion("2026-10-03", [
          {
            personalActivityId: PUSH_UPS_ID,
            position: 0,
            name: "Push-ups",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 10 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(records.recentActuals).toHaveLength(1);
    expect(records.recentActuals[0].personalActivityId).toBe(PUSH_UPS_ID);
    expect(records.recentActuals[0].entries).toHaveLength(2);
  });

  it("names no link for a row whose library entry is gone", () => {
    // The coach may only link an entry it was sent in "library".
    const records = select({
      completions: [
        completion("2026-10-05", [
          {
            personalActivityId: "5d000000-0000-4000-8000-0000000000e1",
            position: 0,
            name: "Dips",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 8 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(records.recentActuals).toEqual([
      expect.objectContaining({ name: "Dips", personalActivityId: null }),
    ]);
  });

  it("keeps a removed entry's rows apart from a new entry of the same name", () => {
    // Push-ups deleted and made again: the old rows link the old id, and
    // the new entry's link never matches them.
    const records = select({
      library: [
        libraryEntry({
          id: PUSH_UPS_ID,
          name: "Push-ups",
          sport: "Bodyweight",
        }),
      ],
      completions: [
        completion("2026-10-05", [
          {
            personalActivityId: PUSH_UPS_ID,
            position: 0,
            name: "Push-ups",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 15 }] },
          },
        ]),
        completion("2026-09-20", [
          {
            personalActivityId: "5d000000-0000-4000-8000-0000000000e1",
            position: 0,
            name: "Push-ups",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 10 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(
      records.recentActuals.map((activity) => [
        activity.personalActivityId,
        activity.entries.map((entry) => entry.localDate),
      ]),
    ).toEqual([
      [PUSH_UPS_ID, ["2026-10-05"]],
      [null, ["2026-09-20"]],
    ]);
  });

  it("sends an unlinked row once when the session names its removed entry", () => {
    const removedId = "5d000000-0000-4000-8000-0000000000e1";
    const records = select({
      planSessions: [
        planSession({
          activities: [
            {
              personalActivityId: removedId,
              position: 0,
              name: "Dips",
              sport: "Strength",
              measurementMode: "sets_reps_load",
            },
          ] as RollingPlanSession["activities"],
        }),
      ],
      completions: [
        completion("2026-10-05", [
          {
            position: 0,
            name: "Dips",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 8 }] },
          },
        ]),
        completion("2026-10-01", [
          {
            personalActivityId: removedId,
            position: 0,
            name: "Dips",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 6 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(records.recentActuals).toHaveLength(1);
    expect(
      records.recentActuals[0].entries.map((entry) => entry.localDate),
    ).toEqual(["2026-10-05", "2026-10-01"]);
  });

  it("lists a library entry with a result before untried ones of other sports", () => {
    // So the trim to 8,000 bytes keeps the definition its result can link to.
    const records = select({
      library: [
        libraryEntry({ id: ROW_ID, name: "Alpha drill", sport: "Rowing" }),
        libraryEntry({
          id: PUSH_UPS_ID,
          name: "Push-ups",
          sport: "Bodyweight",
        }),
      ],
      completions: [
        completion("2026-10-05", [
          {
            personalActivityId: PUSH_UPS_ID,
            position: 0,
            name: "Push-ups",
            sport: "Bodyweight",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 12 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(records.library.map((entry) => entry.name)).toEqual([
      "Push-ups",
      "Alpha drill",
    ]);
  });

  it("finds the result of a library entry behind a dozen never done (owner, 9 Nov 2026)", () => {
    // Read alphabetically, so "Wall handstand" comes after every other
    // entry of the sport: the twelve places went to entries never done.
    const untried = Array.from({ length: 13 }, (_, index) =>
      libraryEntry({
        id: `5d000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
        name: `Drill ${String.fromCharCode(65 + index)}`,
      }),
    );
    const handstandId = "5d000000-0000-4000-8000-0000000000c1";
    const records = select({
      library: [
        ...untried,
        libraryEntry({
          id: handstandId,
          name: "Wall handstand",
          measurementMode: "sets_reps_load",
        }),
      ],
      completions: [
        completion("2026-10-04", [
          {
            personalActivityId: handstandId,
            position: 0,
            name: "Wall handstand",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 4, seconds: 30 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    expect(records.recentActuals.map((entry) => entry.name)).toEqual([
      "Wall handstand",
    ]);
  });
});

describe("buildSessionDetailContext", () => {
  it("passes an ordinary selection through whole, with nothing withheld", () => {
    const records = select({
      library: [libraryEntry()],
    }) as SessionDetailRecords;
    const context = buildSessionDetailContext(records).context;

    expect(context.library).toEqual([
      {
        id: SQUAT_ID,
        name: "Back squat",
        sport: "Strength",
        measurementMode: "sets_reps_load",
      },
    ]);
    expect(context.session).not.toHaveProperty("id");
    expect(context.session).not.toHaveProperty("status");
    expect([
      context.session.activitiesWithheld,
      context.weekWithheld,
      context.libraryWithheld,
      context.savedSessionsWithheld,
      context.recentActualsWithheld,
    ]).toEqual([0, 0, 0, 0, 0]);
  });

  it("trims every list from the end at its worst case, says so, and fits the operation's ceiling", () => {
    const ramp = {
      groups: Array.from({ length: 20 }, (_, index) => ({
        sets: 10,
        reps: 10,
        load: 100 + index,
      })),
      load_unit: "kg" as const,
    };
    const activity = (index: number) => ({
      personalActivityId: `5d000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: "A".repeat(120),
      sport: "S".repeat(80),
      measurementMode: "sets_reps_load" as const,
      target: ramp,
    });
    const worst: SessionDetailRecords = {
      session: {
        id: SESSION_ID,
        localDate: "2026-10-07",
        status: "active",
        title: "😀".repeat(120),
        sport: "😀".repeat(80),
        intent: "😀".repeat(500),
        durationMinutes: 600,
        note: "😀".repeat(2_000),
        coachNote: "😀".repeat(1_000),
        // Each with the longest reason a row may keep (ADR-040).
        activities: Array.from({ length: 50 }, (_, index) => ({
          ...activity(index),
          rationale: "😀".repeat(300),
        })),
      },
      week: Array.from({ length: 30 }, () => ({
        localDate: "2026-10-06",
        title: "T".repeat(120),
        sport: "S".repeat(80),
        durationMinutes: 600,
        activityNames: Array.from({ length: 12 }, () => "A".repeat(120)),
      })),
      library: Array.from({ length: 200 }, (_, index) => ({
        id: activity(index).personalActivityId,
        name: "A".repeat(120),
        sport: "S".repeat(80),
        measurementMode: "sets_reps_load" as const,
      })),
      savedSessions: Array.from({ length: 10 }, (_, index) => ({
        id: `saved-${index}`,
        title: "T".repeat(120),
        sport: "S".repeat(80),
        intent: "I".repeat(500),
        durationMinutes: 600,
        activities: Array.from({ length: 50 }, (_, index) => activity(index)),
      })),
      recentActuals: Array.from({ length: 30 }, (_, index) => ({
        name: "A".repeat(120),
        personalActivityId: activity(index).personalActivityId,
        entries: Array.from({ length: 3 }, (_, entry) => ({
          completionId: `log-${index}-${entry}`,
          localDate: "2026-10-01",
          measurementMode: "sets_reps_load" as const,
          actual: ramp,
        })),
      })),
    };

    const context = buildSessionDetailContext(worst).context;
    const bytes = (value: unknown) =>
      new TextEncoder().encode(JSON.stringify(value)).length;

    expect(context.session.activitiesWithheld).toBeGreaterThan(0);
    expect(context.weekWithheld).toBeGreaterThan(0);
    expect(context.libraryWithheld).toBeGreaterThan(0);
    expect(context.savedSessionsWithheld).toBeGreaterThan(0);
    expect(context.recentActualsWithheld).toBeGreaterThan(0);
    expect(bytes(context.week)).toBeLessThanOrEqual(SESSION_DETAIL_BYTES.week);
    expect(bytes(context.library)).toBeLessThanOrEqual(
      SESSION_DETAIL_BYTES.library,
    );
    expect(bytes(context.savedSessions)).toBeLessThanOrEqual(
      SESSION_DETAIL_BYTES.savedSessions,
    );
    expect(bytes(context.recentActuals)).toBeLessThanOrEqual(
      SESSION_DETAIL_BYTES.recentActuals,
    );
    // The whole part fits the allocation `context.ts` refuses above, so that
    // refusal stays a configuration check an owner can never reach.
    expect(bytes(context)).toBeLessThanOrEqual(
      COACH_AI_CONTEXT_LIMITS.fill_session_activities.bytes.sessionDetail,
    );
  });
});

describe("session detail review follow-ups", () => {
  it("fits a whole library of sixty ordinary entries (ADR-023 decision 17)", () => {
    const records = select({
      planSessions: [planSession()],
      library: Array.from({ length: 60 }, (_, index) =>
        libraryEntry({
          id: `5d000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
          // Twenty-one characters, as long as most names get.
          name: `Bulgarian split sq ${String(index).padStart(2, "0")}`,
        }),
      ),
    }) as SessionDetailRecords;

    const { context } = buildSessionDetailContext(records);

    expect(context.library).toHaveLength(60);
    expect(context.libraryWithheld).toBe(0);
  });

  it("orders the library so entries the session links survive a trim", () => {
    const linked = "5d000000-0000-4000-8000-0000000000c9";
    const records = select({
      planSessions: [
        planSession({
          activities: [
            {
              personalActivityId: linked,
              position: 0,
              name: "Zercher squat",
              sport: "Strength",
              measurementMode: "sets_reps_load",
            },
          ] as RollingPlanSession["activities"],
        }),
      ],
      library: [
        libraryEntry({ id: ROW_ID, name: "Rowing", sport: "Rowing" }),
        libraryEntry(),
        libraryEntry({ id: linked, name: "Zercher squat", sport: "Other" }),
      ],
    }) as SessionDetailRecords;

    expect(records.library.map((entry) => entry.name)).toEqual([
      "Zercher squat",
      "Back squat",
      "Rowing",
    ]);
  });

  it("drops the session's free text before letting its part outgrow the share", () => {
    const control = String.fromCharCode(1);
    const records = select({
      planSessions: [
        planSession({
          title: control.repeat(120),
          sport: control.repeat(80),
          intent: control.repeat(500),
          note: control.repeat(2_000),
          coachNote: control.repeat(1_000),
        }),
      ],
    }) as SessionDetailRecords;

    const context = buildSessionDetailContext(records).context;
    // The owner's note goes first, then the coach's (ADR-040).
    expect(context.session.note).toBeNull();
    expect(context.session.coachNote).toBeNull();
    expect(
      new TextEncoder().encode(JSON.stringify(context.session)).length,
    ).toBeLessThanOrEqual(SESSION_DETAIL_BYTES.session);
  });
});

describe("session detail provenance", () => {
  it("names what reached the coach, and sends none of the ids it keeps for that", () => {
    const records = select({
      library: [libraryEntry()],
      savedSessions: [saved({ id: "5d000000-0000-4000-8000-0000000000b1" })],
      planSessions: [
        planSession({
          activities: [
            {
              personalActivityId: SQUAT_ID,
              position: 0,
              name: "Back squat",
              sport: "Strength",
              measurementMode: "sets_reps_load",
            },
          ] as RollingPlanSession["activities"],
        }),
      ],
      completions: [
        completion("2026-10-05", [
          {
            personalActivityId: SQUAT_ID,
            position: 0,
            name: "Back squat",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            actualMeasurement: { groups: [{ sets: 3, reps: 5 }] },
          },
        ]),
      ],
    }) as SessionDetailRecords;

    const { context, sources } = buildSessionDetailContext(records);

    expect(sources).toEqual([
      { kind: "plan_session", recordId: SESSION_ID },
      { kind: "personal_activity", recordId: SQUAT_ID },
      {
        kind: "saved_session",
        recordId: "5d000000-0000-4000-8000-0000000000b1",
      },
      { kind: "completion", recordId: "c-2026-10-05" },
    ]);
    const sent = JSON.stringify(context);
    expect(sent).not.toContain("5d000000-0000-4000-8000-0000000000b1");
    expect(sent).not.toContain("c-2026-10-05");
    expect(sent).not.toContain(SESSION_ID);
  });
});
