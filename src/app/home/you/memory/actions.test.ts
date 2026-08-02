import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRepositoryMock, revalidatePathMock } = vi.hoisted(() => ({
  createRepositoryMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/repositories/memory-repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/repositories/memory-repository")
    >();
  return { ...actual, createMemoryRepository: createRepositoryMock };
});

import { INITIAL_MEMORY_ACTION_STATE } from "./action-state";
import { changeMemoryAction } from "./actions";
import { MemoryValidationError } from "@/server/memory/memory-records";
import {
  MemoryAuthenticationError,
  MemoryConflictError,
  MemoryPersistenceError,
} from "@/server/repositories/memory-repository";

const ITEM_ID = "53000000-0000-4000-8000-0000000000b1";

describe("memory actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates through the authenticated repository and revalidates only memory", async () => {
    const create = vi.fn().mockResolvedValue({ result: "created" });
    createRepositoryMock.mockResolvedValue({ create });

    const result = await changeMemoryAction(
      INITIAL_MEMORY_ACTION_STATE,
      form({
        operation: "create",
        memoryType: "constraint",
        content: "No pool this month.",
        reviewDate: "2026-12-31",
        expectedRevision: "3",
      }),
    );

    expect(create).toHaveBeenCalledWith(
      "constraint",
      "No pool this month.",
      "2026-12-31",
      "3",
    );
    expect(result).toMatchObject({
      status: "saved",
      message: "Memory saved.",
      submission: 1,
      draft: undefined,
    });
    expect(revalidatePathMock).toHaveBeenCalledExactlyOnceWith(
      "/home/you/memory",
    );
  });

  it("routes edit and edit-and-accept to the same guarded operation", async () => {
    const edit = vi.fn().mockResolvedValue({ result: "accepted" });
    createRepositoryMock.mockResolvedValue({ edit });

    await changeMemoryAction(
      INITIAL_MEMORY_ACTION_STATE,
      form({
        operation: "edit_and_accept",
        itemId: ITEM_ID,
        content: "Confirmed text.",
        reviewDate: "",
        expectedRevision: "5",
      }),
    );

    expect(edit).toHaveBeenCalledWith(
      ITEM_ID,
      "Confirmed text.",
      "",
      "5",
      true,
    );
  });

  it.each(["accept", "reject", "disable", "enable", "delete"] as const)(
    "sends %s as an explicit status transition",
    async (operation) => {
      const transition = vi.fn().mockResolvedValue({ result: operation });
      createRepositoryMock.mockResolvedValue({ transition });

      const result = await changeMemoryAction(
        INITIAL_MEMORY_ACTION_STATE,
        form({ operation, itemId: ITEM_ID, expectedRevision: "2" }),
      );

      expect(transition).toHaveBeenCalledWith(operation, ITEM_ID, "2");
      expect(result.status).toBe("saved");
      expect(result.draft).toBeUndefined();
    },
  );

  it("renews a review date without touching the text", async () => {
    const renew = vi.fn().mockResolvedValue({ result: "renewed" });
    createRepositoryMock.mockResolvedValue({ renew });

    const result = await changeMemoryAction(
      INITIAL_MEMORY_ACTION_STATE,
      form({
        operation: "renew",
        itemId: ITEM_ID,
        reviewDate: "2027-01-01",
        expectedRevision: "6",
      }),
    );

    expect(renew).toHaveBeenCalledWith(ITEM_ID, "2027-01-01", "6");
    expect(result.message).toBe("Review date updated.");
  });

  it("rejects an operation the surface does not offer", async () => {
    createRepositoryMock.mockResolvedValue({});

    const result = await changeMemoryAction(
      INITIAL_MEMORY_ACTION_STATE,
      form({ operation: "purge_everything", expectedRevision: "0" }),
    );

    expect(result.status).toBe("validation");
  });

  it.each([
    [new MemoryValidationError(), "validation", /1 and 1000 characters/],
    [new MemoryConflictError(), "conflict", /changed in another tab/],
    [new MemoryAuthenticationError(), "session", /Sign in again/],
    [new MemoryPersistenceError(), "error", /could not be confirmed/],
    [new Error("unexpected"), "error", /could not be completed/],
  ])(
    "reports %s honestly and keeps the draft",
    async (thrown, status, copy) => {
      createRepositoryMock.mockResolvedValue({
        create: vi.fn().mockRejectedValue(thrown),
      });

      const result = await changeMemoryAction(
        INITIAL_MEMORY_ACTION_STATE,
        form({
          operation: "create",
          memoryType: "preference",
          content: "Prefers Sundays off.",
          reviewDate: "",
          expectedRevision: "0",
        }),
      );

      expect(result.status).toBe(status);
      expect(result.message).toMatch(copy);
      expect(result.draft).toEqual({
        memoryType: "preference",
        content: "Prefers Sundays off.",
        reviewDate: "",
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("keeps no draft for a failed status transition", async () => {
    createRepositoryMock.mockResolvedValue({
      transition: vi.fn().mockRejectedValue(new MemoryConflictError()),
    });

    const result = await changeMemoryAction(
      INITIAL_MEMORY_ACTION_STATE,
      form({ operation: "delete", itemId: ITEM_ID, expectedRevision: "1" }),
    );

    expect(result).toMatchObject({ status: "conflict", draft: undefined });
  });
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
