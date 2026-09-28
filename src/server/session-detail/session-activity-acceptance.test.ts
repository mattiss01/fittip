import { describe, expect, it, vi } from "vitest";

import {
  ACTIVITY_PROPOSAL_FIELD,
  recordAcceptedSessionActivities,
} from "./session-activity-acceptance";

import {
  SessionActivityAuthenticationError,
  SessionActivityConflictError,
  SessionActivityPersistenceError,
  type SessionActivityRepository,
} from "@/server/repositories/session-activity-repository";

const FIRST = "5a000000-0000-4000-8000-000000000001";
const SECOND = "5a000000-0000-4000-8000-000000000002";

function form(...ids: string[]) {
  const formData = new FormData();
  for (const id of ids) formData.append(ACTIVITY_PROPOSAL_FIELD, id);
  return formData;
}

function repository(decide: SessionActivityRepository["decide"]) {
  const decideMock = vi.fn(decide);
  const create = vi.fn(
    async () =>
      ({ decide: decideMock }) as unknown as SessionActivityRepository,
  );
  return { decide: decideMock, create };
}

describe("recordAcceptedSessionActivities", () => {
  it("has nothing to record when the form carries no suggestion", async () => {
    const { decide, create } = repository(async () => "accepted");

    expect(await recordAcceptedSessionActivities(form(), create)).toBe(true);
    expect(decide).not.toHaveBeenCalled();
  });

  it("records every suggestion the form carries, once each", async () => {
    const { decide, create } = repository(async () => "accepted");

    const recorded = await recordAcceptedSessionActivities(
      form(FIRST, SECOND, FIRST),
      create,
    );

    expect(recorded).toBe(true);
    expect(decide.mock.calls).toEqual([
      [FIRST, "accepted"],
      [SECOND, "accepted"],
    ]);
  });

  it("retries an opaque failure, since the decision replays safely", async () => {
    const { decide, create } = repository(
      vi
        .fn()
        .mockRejectedValueOnce(new SessionActivityPersistenceError())
        .mockResolvedValueOnce("accepted"),
    );

    expect(await recordAcceptedSessionActivities(form(FIRST), create)).toBe(
      true,
    );
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("gives up after three opaque failures without throwing", async () => {
    const { decide, create } = repository(async () => {
      throw new SessionActivityPersistenceError();
    });

    expect(await recordAcceptedSessionActivities(form(FIRST), create)).toBe(
      false,
    );
    expect(decide).toHaveBeenCalledTimes(3);
  });

  it("does not retry an answer that cannot change", async () => {
    for (const error of [
      new SessionActivityConflictError("already-decided"),
      new SessionActivityAuthenticationError(),
    ]) {
      const { decide, create } = repository(async () => {
        throw error;
      });

      expect(await recordAcceptedSessionActivities(form(FIRST), create)).toBe(
        false,
      );
      expect(decide).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses an id the form made up without asking the database", async () => {
    const { decide, create } = repository(async () => "accepted");

    expect(
      await recordAcceptedSessionActivities(form("not-a-uuid"), create),
    ).toBe(false);
    expect(decide).not.toHaveBeenCalled();
  });
});
