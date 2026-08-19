import { describe, expect, it } from "vitest";

import {
  SavedSessionConflictError,
  SavedSessionLibrary,
  SavedSessionValidationError,
  type SavedSession,
  type SavedSessionAdapter,
  type SavedSessionChange,
  type SavedSessionReceipt,
} from "./saved-sessions";

const ID = "76000000-0000-4000-8000-000000000001";
const OTHER_ID = "76000000-0000-4000-8000-000000000002";

/**
 * A fake at the library seam. It exists to exercise the module's interface,
 * not to stand in for Postgres: the real optimistic-token behavior is proved
 * against the database by `m3_13_private_saved_session_library.test.sql` and
 * the concurrency harness.
 */
class FakeSavedSessionAdapter implements SavedSessionAdapter {
  readonly changes: SavedSessionChange[] = [];
  private readonly records = new Map<string, SavedSession>();

  async list() {
    return [...this.records.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async get(savedSessionId: string) {
    return this.records.get(savedSessionId) ?? null;
  }

  async applyChange(change: SavedSessionChange): Promise<SavedSessionReceipt> {
    this.changes.push(change);
    if (change.operation === "create") {
      const record: SavedSession = {
        id: ID,
        revision: 0,
        updatedAt: "2026-08-18T10:00:00.000Z",
        ...change.session,
      };
      this.records.set(record.id, record);
      return { savedSessionId: record.id, revision: 0, result: "created" };
    }
    const current = this.records.get(change.savedSessionId);
    if (!current || current.revision !== change.expectedRevision) {
      throw new SavedSessionConflictError();
    }
    if (change.operation === "delete") {
      this.records.delete(change.savedSessionId);
      return {
        savedSessionId: change.savedSessionId,
        revision: current.revision,
        result: "deleted",
      };
    }
    const updated: SavedSession = {
      ...current,
      ...change.session,
      revision: current.revision + 1,
    };
    this.records.set(updated.id, updated);
    return {
      savedSessionId: updated.id,
      revision: updated.revision,
      result: "updated",
    };
  }
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    operation: "create",
    session: {
      name: "Tuesday tempo",
      title: "Tempo run",
      sport: "Running",
      expectedDurationMinutes: 60,
      activities: [
        {
          position: 0,
          name: "Tempo blocks",
          sport: "Running",
          measurementMode: "duration_intensity",
          target: { duration_minutes: 30, intensity: "hard" },
        },
      ],
      ...overrides,
    },
  };
}

describe("the saved session library", () => {
  it("saves, lists, reads back, edits and deletes one record", async () => {
    const adapter = new FakeSavedSessionAdapter();
    const library = new SavedSessionLibrary(adapter);

    await expect(library.applyChange(draft())).resolves.toMatchObject({
      revision: 0,
      result: "created",
    });
    expect(await library.list()).toMatchObject([
      { name: "Tuesday tempo", title: "Tempo run", revision: 0 },
    ]);
    expect(await library.get(ID)).toMatchObject({
      activities: [{ name: "Tempo blocks", position: 0 }],
    });

    await expect(
      library.applyChange({
        operation: "edit",
        savedSessionId: ID,
        expectedRevision: 0,
        session: {
          name: "Tuesday tempo (v2)",
          title: "Longer tempo run",
          sport: "Running",
        },
      }),
    ).resolves.toMatchObject({ revision: 1, result: "updated" });

    // An edit carries no activities, so the copied ones stay exactly as saved.
    expect(await library.get(ID)).toMatchObject({
      name: "Tuesday tempo (v2)",
      activities: [{ name: "Tempo blocks" }],
    });

    await expect(
      library.applyChange({
        operation: "delete",
        savedSessionId: ID,
        expectedRevision: 1,
      }),
    ).resolves.toMatchObject({ result: "deleted" });
    expect(await library.list()).toEqual([]);
    expect(await library.get(ID)).toBeNull();
  });

  it("refuses a write at a stale revision instead of applying it", async () => {
    const adapter = new FakeSavedSessionAdapter();
    const library = new SavedSessionLibrary(adapter);
    await library.applyChange(draft());
    await library.applyChange({
      operation: "edit",
      savedSessionId: ID,
      expectedRevision: 0,
      session: { name: "First writer", title: "Tempo run", sport: "Running" },
    });

    await expect(
      library.applyChange({
        operation: "edit",
        savedSessionId: ID,
        expectedRevision: 0,
        session: {
          name: "Second writer",
          title: "Tempo run",
          sport: "Running",
        },
      }),
    ).rejects.toThrow(SavedSessionConflictError);
    expect(await library.get(ID)).toMatchObject({
      name: "First writer",
      revision: 1,
    });
  });

  it("reports a record that is gone as changed rather than as missing", async () => {
    const library = new SavedSessionLibrary(new FakeSavedSessionAdapter());
    await expect(
      library.applyChange({
        operation: "delete",
        savedSessionId: OTHER_ID,
        expectedRevision: 0,
      }),
    ).rejects.toThrow(SavedSessionConflictError);
  });

  it("normalizes what it accepts and refuses what it does not", async () => {
    const adapter = new FakeSavedSessionAdapter();
    const library = new SavedSessionLibrary(adapter);

    await library.applyChange(
      draft({ name: "  Padded name  ", intent: "", note: null }),
    );
    expect(adapter.changes[0]).toMatchObject({
      session: { name: "Padded name" },
    });
    expect(adapter.changes[0]).not.toHaveProperty("session.intent");
    expect(adapter.changes[0]).not.toHaveProperty("session.note");

    for (const invalid of [
      { ...draft(), session: { ...draft().session, name: "   " } },
      { ...draft(), session: { ...draft().session, userId: "someone" } },
      {
        ...draft(),
        session: { ...draft().session, expectedDurationMinutes: 0 },
      },
      {
        ...draft(),
        session: {
          ...draft().session,
          activities: [
            {
              position: 0,
              name: "One",
              sport: "Running",
              measurementMode: "custom",
            },
            {
              position: 0,
              name: "Two",
              sport: "Running",
              measurementMode: "custom",
            },
          ],
        },
      },
      {
        ...draft(),
        session: {
          ...draft().session,
          activities: [
            {
              position: 0,
              name: "Locked",
              sport: "Running",
              measurementMode: "custom",
              isLocked: true,
            },
          ],
        },
      },
      { operation: "edit", savedSessionId: ID, expectedRevision: -1 },
      { operation: "archive", savedSessionId: ID, expectedRevision: 0 },
      {
        operation: "edit",
        savedSessionId: ID,
        expectedRevision: 0,
        session: {
          name: "With activities",
          title: "T",
          sport: "Running",
          activities: [],
        },
      },
    ]) {
      await expect(library.applyChange(invalid)).rejects.toThrow(
        SavedSessionValidationError,
      );
    }
  });

  it("refuses a read of anything that is not an identity", async () => {
    const library = new SavedSessionLibrary(new FakeSavedSessionAdapter());
    await expect(library.get("not-an-identity")).rejects.toThrow(
      SavedSessionValidationError,
    );
  });
});
