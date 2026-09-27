import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  PersonalActivityConflictError,
  PersonalActivityLibrary,
  PersonalActivityNameTakenError,
  PersonalActivityPersistenceError,
  PersonalActivityValidationError,
} from "@/server/personal-activities/personal-activities";
import {
  PersonalActivityAuthenticationError,
  PostgresPersonalActivityAdapter,
} from "@/server/repositories/personal-activity-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ACTIVITY_ID = "77000000-0000-4000-8000-0000000000b1";
const UPDATED_AT = "2026-09-27T08:55:53.263069+00:00";

const ROW = {
  id: ACTIVITY_ID,
  name: "Back squat",
  sport: "Strength",
  description: "Pause at the bottom",
  measurement_mode: "duration_intensity",
  default_measurement: { duration_minutes: 20 },
  updated_at: UPDATED_AT,
};

describe("PostgresPersonalActivityAdapter", () => {
  it("lists only the verified owner's active definitions", async () => {
    const query = createQuery({ data: [ROW], error: null });
    const library = createLibrary(query.table);

    await expect(library.list()).resolves.toEqual([
      {
        id: ACTIVITY_ID,
        name: "Back squat",
        sport: "Strength",
        instructions: "Pause at the bottom",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 20 },
        updatedAt: UPDATED_AT,
      },
    ]);
    expect(query.table).toHaveBeenCalledWith("personal_activities");
    expect(query.calls).toContainEqual(["eq", "user_id", USER_ID]);
    expect(query.calls).toContainEqual(["is", "archived_at", null]);
  });

  it("creates for the verified owner, mapping the activity's words to columns", async () => {
    const query = createQuery({ data: ROW, error: null });
    const library = createLibrary(query.table);

    await library.applyChange({
      operation: "create",
      activity: {
        name: " Back squat ",
        sport: "Strength",
        instructions: "Pause at the bottom",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 20 },
      },
    });

    expect(query.calls).toContainEqual([
      "insert",
      {
        user_id: USER_ID,
        name: "Back squat",
        sport: "Strength",
        description: "Pause at the bottom",
        measurement_mode: "duration_intensity",
        default_measurement: { duration_minutes: 20 },
      },
    ]);
  });

  it("edits only the row that is still as it was read, and still active", async () => {
    const query = createQuery({ data: ROW, error: null });
    const library = createLibrary(query.table);

    await library.applyChange({
      operation: "edit",
      personalActivityId: ACTIVITY_ID,
      expectedUpdatedAt: UPDATED_AT,
      activity: {
        name: "Back squat",
        sport: "Strength",
        measurementMode: "unmeasured",
      },
    });

    const update = query.calls.find(([method]) => method === "update");
    expect(update?.[1]).toMatchObject({
      name: "Back squat",
      description: null,
      measurement_mode: "unmeasured",
      default_measurement: null,
    });
    expect(query.calls).toContainEqual(["eq", "user_id", USER_ID]);
    expect(query.calls).toContainEqual(["eq", "id", ACTIVITY_ID]);
    expect(query.calls).toContainEqual(["eq", "updated_at", UPDATED_AT]);
    expect(query.calls).toContainEqual(["is", "archived_at", null]);
  });

  it("removes by archiving, never by deleting", async () => {
    const query = createQuery({ data: ROW, error: null });
    const library = createLibrary(query.table);

    await library.applyChange({
      operation: "archive",
      personalActivityId: ACTIVITY_ID,
      expectedUpdatedAt: UPDATED_AT,
    });

    const update = query.calls.find(([method]) => method === "update");
    expect(Object.keys(update?.[1] as object).sort()).toEqual([
      "archived_at",
      "updated_at",
    ]);
    expect(query.calls.some(([method]) => method === "delete")).toBe(false);
  });

  it("reads no matching row as a conflict, whatever the reason", async () => {
    const library = createLibrary(
      createQuery({ data: null, error: null }).table,
    );

    await expect(
      library.applyChange({
        operation: "archive",
        personalActivityId: ACTIVITY_ID,
        expectedUpdatedAt: UPDATED_AT,
      }),
    ).rejects.toThrow(PersonalActivityConflictError);
  });

  it("maps a check violation to validation and anything else to persistence", async () => {
    const change = {
      operation: "create",
      activity: { name: "Squat", sport: "Strength", measurementMode: "custom" },
    };
    await expect(
      createLibrary(
        createQuery({ data: null, error: { code: "23514", message: "x" } })
          .table,
      ).applyChange(change),
    ).rejects.toThrow(PersonalActivityValidationError);
    await expect(
      createLibrary(
        createQuery({ data: null, error: { code: "XX000", message: "x" } })
          .table,
      ).applyChange(change),
    ).rejects.toThrow(PersonalActivityPersistenceError);
  });

  it("reads the unique-name index's refusal as a taken name", async () => {
    await expect(
      createLibrary(
        createQuery({ data: null, error: { code: "23505", message: "x" } })
          .table,
      ).applyChange({
        operation: "create",
        activity: {
          name: "Rudern",
          sport: "Strength",
          measurementMode: "unmeasured",
        },
      }),
    ).rejects.toThrow(PersonalActivityNameTakenError);
  });

  it("refuses a payload that names an owner, before any query", async () => {
    const query = createQuery({ data: ROW, error: null });
    await expect(
      createLibrary(query.table).applyChange({
        operation: "create",
        activity: {
          user_id: "00000000-0000-4000-8000-000000000002",
          name: "Squat",
          sport: "Strength",
          measurementMode: "unmeasured",
        },
      }),
    ).rejects.toThrow(PersonalActivityValidationError);
    expect(query.table).not.toHaveBeenCalled();
  });

  it("requires verified claims before touching the table", async () => {
    const query = createQuery({ data: [ROW], error: null });
    const library = createLibrary(query.table, {
      data: null,
      error: new Error("no session"),
    });

    await expect(library.list()).rejects.toThrow(
      PersonalActivityAuthenticationError,
    );
    expect(query.table).not.toHaveBeenCalled();
  });
});

function createLibrary(
  table: ReturnType<typeof vi.fn>,
  claims: unknown = {
    data: {
      claims: { sub: USER_ID },
      header: {},
      signature: new Uint8Array(),
    },
    error: null,
  },
) {
  const client = {
    auth: { getClaims: vi.fn().mockResolvedValue(claims) },
    from: table,
  } as unknown as SupabaseClient<Database>;
  return new PersonalActivityLibrary(
    new PostgresPersonalActivityAdapter(client),
  );
}

/**
 * One chainable builder that records every call and resolves to `result`
 * wherever the chain ends — awaited directly, or through `single` or
 * `maybeSingle`.
 */
function createQuery(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "is",
    "order",
  ]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.single = () => Promise.resolve(result);
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  const table = vi.fn().mockReturnValue(builder);
  return { table, calls };
}
