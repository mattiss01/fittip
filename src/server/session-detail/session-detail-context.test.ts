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
    isLocked: false,
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
      activities: [],
    });
    expect(JSON.stringify(records)).not.toContain("isLocked");
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
              isLocked: false,
            },
            {
              position: 1,
              name: "Walking lunge",
              sport: "Strength",
              measurementMode: "unmeasured",
              isLocked: false,
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

  it("considers same-sport library entries for actuals, and no others", () => {
    const records = select({
      library: [
        libraryEntry(),
        libraryEntry({ id: ROW_ID, name: "Rowing", sport: "Rowing" }),
      ],
      completions: [
        completion("2026-10-05", [
          {
            personalActivityId: ROW_ID,
            position: 0,
            name: "Rowing",
            sport: "Rowing",
            measurementMode: "duration_intensity",
            actualMeasurement: { duration_minutes: 20 },
          },
          {
            personalActivityId: SQUAT_ID,
            position: 1,
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
        activities: Array.from({ length: 50 }, (_, index) => activity(index)),
      },
      week: Array.from({ length: 30 }, () => ({
        localDate: "2026-10-06",
        title: "T".repeat(120),
        sport: "S".repeat(80),
        durationMinutes: 600,
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
              isLocked: false,
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
        }),
      ],
    }) as SessionDetailRecords;

    const context = buildSessionDetailContext(records).context;
    expect(context.session.note).toBeNull();
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
              isLocked: false,
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
