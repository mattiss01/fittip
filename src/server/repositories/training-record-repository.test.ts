import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  TrainingPlanConflictError,
  TrainingRecordAuthenticationError,
  TrainingRecordRepository,
} from "@/server/repositories/training-record-repository";
import { PastPlanContentMutationError } from "@/server/training/past-plan-protection";
import { TrainingRecordValidationError } from "@/server/training/training-records";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACTIVITY_ID = "20000000-0000-4000-8000-000000000001";

describe("TrainingRecordRepository", () => {
  afterEach(() => {
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
  });

  it("saves only a validated plan and never accepts a caller-owned user id", async () => {
    const planRow = {
      id: "50000000-0000-4000-8000-000000000001",
      user_id: USER_ID,
      version_number: 1,
      parent_version_id: null,
      day_count: 2,
      start_date: "2026-07-28",
      end_date: "2026-07-29",
      timezone_name: "Europe/Berlin",
      source_kind: "manual",
      accepted_at: "2026-07-28T12:00:00.000Z",
      created_at: "2026-07-28T12:00:00.000Z",
    };
    const retry = vi.fn().mockResolvedValue({ data: planRow, error: null });
    const rpc = vi.fn().mockReturnValue({ retry });
    const repository = new TrainingRecordRepository(
      createClient({ rpc }),
      fixedNow,
    );

    await expect(
      repository.saveManualPlan(
        {
          dayCount: 2,
          startDate: "2026-07-28",
          timezoneName: "Europe/Berlin",
          sessions: [
            {
              localDate: "2026-07-29",
              position: 0,
              title: "Easy run",
              sport: "Running",
              activities: [
                {
                  personalActivityId: ACTIVITY_ID,
                  position: 0,
                  name: "Easy run",
                  sport: "Running",
                  measurementMode: "time_distance_pace",
                  target: { duration_seconds: 1800 },
                },
              ],
            },
          ],
        },
        0,
      ),
    ).resolves.toMatchObject({
      userId: USER_ID,
      versionNumber: 1,
      dayCount: 2,
    });

    expect(rpc).toHaveBeenCalledWith("save_manual_plan_version", {
      p_expected_revision: 0,
      p_day_count: 2,
      p_start_date: "2026-07-28",
      p_timezone_name: "Europe/Berlin",
      p_sessions: [
        expect.objectContaining({
          local_date: "2026-07-29",
          activities: [
            expect.objectContaining({
              personal_activity_id: ACTIVITY_ID,
              measurement_mode: "time_distance_pace",
            }),
          ],
        }),
      ],
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("user_id");
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith(false);
  });

  it("rejects an invalid horizon before making a database call", async () => {
    const rpc = vi.fn();
    const repository = new TrainingRecordRepository(
      createClient({ rpc }),
      fixedNow,
    );

    await expect(
      repository.saveManualPlan(
        {
          dayCount: 8,
          startDate: "2026-07-28",
          timezoneName: "UTC",
          sessions: [],
        },
        0,
      ),
    ).rejects.toThrow(TrainingRecordValidationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a stale database revision to an explicit conflict", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "provider details" },
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const repository = new TrainingRecordRepository(
      createClient({ rpc }),
      fixedNow,
    );

    await expect(
      repository.saveManualPlan(
        {
          dayCount: 1,
          startDate: "2026-07-28",
          timezoneName: "UTC",
          sessions: [],
        },
        2,
      ),
    ).rejects.toThrow(TrainingPlanConflictError);
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith(false);
  });

  it("rejects forged changes to an accepted past session before the save RPC", async () => {
    const rpc = vi.fn();
    const repository = new TrainingRecordRepository(
      createClient({ rpc }),
      fixedNow,
    );
    vi.spyOn(repository, "getCurrentManualPlan").mockResolvedValue({
      plan: {
        dayCount: 2,
        startDate: "2026-07-27",
        timezoneName: "Europe/Berlin",
        sessions: [manualSession("2026-07-27", "Accepted run")],
      },
    } as never);

    await expect(
      repository.saveManualPlan(
        {
          dayCount: 2,
          startDate: "2026-07-27",
          timezoneName: "Europe/Berlin",
          sessions: [manualSession("2026-07-27", "Forged title")],
        },
        2,
      ),
    ).rejects.toThrow(PastPlanContentMutationError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("derives ownership when creating a personal activity", async () => {
    const row = personalActivityRow();
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: row, error: null }),
      }),
    });
    const from = vi.fn().mockReturnValue({ insert });
    const repository = new TrainingRecordRepository(createClient({ from }));

    await expect(
      repository.createPersonalActivity({
        name: " Easy run ",
        sport: " Running ",
        measurementMode: "time_distance_pace",
        defaultMeasurement: { duration_seconds: 1800 },
      }),
    ).resolves.toMatchObject({ id: ACTIVITY_ID, userId: USER_ID });

    expect(insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      name: "Easy run",
      sport: "Running",
      description: null,
      measurement_mode: "time_distance_pace",
      default_measurement: { duration_seconds: 1800 },
    });
  });

  it("repeats the owner predicate when listing active definitions", async () => {
    const order = vi
      .fn()
      .mockResolvedValue({ data: [personalActivityRow()], error: null });
    const is = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const repository = new TrainingRecordRepository(createClient({ from }));

    await expect(
      repository.listActivePersonalActivities(),
    ).resolves.toHaveLength(1);
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(is).toHaveBeenCalledWith("archived_at", null);
  });

  it("loads the current accepted plan through owner-filtered immutable records", async () => {
    const planVersionId = "50000000-0000-4000-8000-000000000001";
    const sessionId = "60000000-0000-4000-8000-000000000001";
    const headEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          user_id: USER_ID,
          current_version_id: planVersionId,
          revision: 2,
          updated_at: "2026-07-28T12:00:00.000Z",
        },
        error: null,
      }),
    });
    const versionOwnerEq = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: planVersionId,
          user_id: USER_ID,
          version_number: 2,
          parent_version_id: null,
          parent_version_number: null,
          day_count: 2,
          start_date: "2026-07-28",
          end_date: "2026-07-29",
          timezone_name: "Europe/Berlin",
          source_kind: "manual",
          accepted_at: "2026-07-28T12:00:00.000Z",
          created_at: "2026-07-28T12:00:00.000Z",
        },
        error: null,
      }),
    });
    const versionIdEq = vi.fn().mockReturnValue({ eq: versionOwnerEq });
    const sessionSecondOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: sessionId,
          user_id: USER_ID,
          plan_version_id: planVersionId,
          local_date: "2026-07-29",
          position: 0,
          title: "Ball control",
          sport: "Football",
          intent: "Clean first touch",
          expected_duration_minutes: 35,
          note: null,
          is_locked: true,
          created_at: "2026-07-28T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const sessionFirstOrder = vi.fn().mockReturnValue({
      order: sessionSecondOrder,
    });
    const sessionOwnerEq = vi
      .fn()
      .mockReturnValue({ order: sessionFirstOrder });
    const sessionVersionEq = vi.fn().mockReturnValue({ eq: sessionOwnerEq });
    const activityOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          user_id: USER_ID,
          planned_session_id: sessionId,
          personal_activity_id: ACTIVITY_ID,
          position: 0,
          name: "Wall passes",
          sport: "Football",
          instructions: "Both feet",
          measurement_mode: "skill_repetitions",
          target: { repetitions: 40, unit: "passes" },
          is_locked: false,
          created_at: "2026-07-28T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const activityIn = vi.fn().mockReturnValue({ order: activityOrder });
    const activityOwnerEq = vi.fn().mockReturnValue({ in: activityIn });
    const from = vi.fn((table: string) => {
      const builders = {
        detailed_plan_heads: { select: vi.fn(() => ({ eq: headEq })) },
        detailed_plan_versions: {
          select: vi.fn(() => ({ eq: versionIdEq })),
        },
        planned_sessions: {
          select: vi.fn(() => ({ eq: sessionVersionEq })),
        },
        planned_activities: {
          select: vi.fn(() => ({ eq: activityOwnerEq })),
        },
      };
      return builders[table as keyof typeof builders];
    });
    const repository = new TrainingRecordRepository(createClient({ from }));

    await expect(repository.getCurrentManualPlan()).resolves.toMatchObject({
      head: { revision: 2, currentVersionId: planVersionId },
      version: { versionNumber: 2, dayCount: 2 },
      plan: {
        dayCount: 2,
        sessions: [
          {
            title: "Ball control",
            isLocked: true,
            activities: [
              {
                name: "Wall passes",
                measurementMode: "skill_repetitions",
                target: { repetitions: 40, unit: "passes" },
              },
            ],
          },
        ],
      },
    });
    expect(headEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(versionOwnerEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessionOwnerEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(activityOwnerEq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("lists every immutable plan version newest first with an owner predicate", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "50000000-0000-4000-8000-000000000002",
          user_id: USER_ID,
          version_number: 2,
          parent_version_id: "50000000-0000-4000-8000-000000000001",
          parent_version_number: 1,
          day_count: 3,
          start_date: "2026-07-29",
          end_date: "2026-07-31",
          timezone_name: "Europe/Berlin",
          source_kind: "manual",
          accepted_at: "2026-07-29T12:00:00.000Z",
          created_at: "2026-07-29T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq }),
    });
    const repository = new TrainingRecordRepository(createClient({ from }));

    await expect(repository.listPlanVersions()).resolves.toEqual([
      expect.objectContaining({ versionNumber: 2, dayCount: 3 }),
    ]);
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(order).toHaveBeenCalledWith("version_number", { ascending: false });
  });

  it("enforces founder-staging owner access before any record operation", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = USER_ID;
    const from = vi.fn();
    const repository = new TrainingRecordRepository(
      createClient({
        from,
        claims: {
          data: {
            claims: { sub: "10000000-0000-4000-8000-000000000002" },
          },
          error: null,
        },
      }),
    );

    await expect(repository.listActivePersonalActivities()).rejects.toThrow(
      TrainingRecordAuthenticationError,
    );
    expect(from).not.toHaveBeenCalled();
  });
});

function createClient({
  rpc = vi.fn(),
  from = createNoPlanFrom(),
  claims = {
    data: {
      claims: { sub: USER_ID },
      header: {},
      signature: new Uint8Array(),
    },
    error: null,
  },
}: {
  rpc?: ReturnType<typeof vi.fn>;
  from?: ReturnType<typeof vi.fn>;
  claims?: unknown;
}): SupabaseClient<Database> {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue(claims),
    },
    rpc,
    from,
  } as unknown as SupabaseClient<Database>;
}

function createNoPlanFrom() {
  return vi.fn((table: string) => {
    if (table !== "detailed_plan_heads") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        })),
      })),
    };
  });
}

function fixedNow() {
  return new Date("2026-07-28T12:00:00.000Z");
}

function manualSession(localDate: string, title: string) {
  return {
    localDate,
    position: 0,
    title,
    sport: "Running",
    isLocked: false,
    activities: [],
  };
}

function personalActivityRow() {
  return {
    id: ACTIVITY_ID,
    user_id: USER_ID,
    name: "Easy run",
    sport: "Running",
    description: null,
    measurement_mode: "time_distance_pace",
    default_measurement: { duration_seconds: 1800 },
    archived_at: null,
    created_at: "2026-07-28T12:00:00.000Z",
    updated_at: "2026-07-28T12:00:00.000Z",
  };
}
