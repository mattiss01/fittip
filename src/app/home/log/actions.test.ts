import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionRepositoryMock, saveMock } = vi.hoisted(() => ({
  createCompletionRepositoryMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock(
  "@/server/repositories/completion-repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/server/repositories/completion-repository")
      >();
    return {
      ...actual,
      createCompletionRepository: createCompletionRepositoryMock,
    };
  },
);

import { saveQuickLog } from "@/app/home/log/actions";
import {
  CompletionAuthenticationError,
  CompletionConflictError,
  CompletionPersistenceError,
} from "@/server/repositories/completion-repository";

describe("saveQuickLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCompletionRepositoryMock.mockResolvedValue({ save: saveMock });
  });

  it("passes a server-shaped, identity-free completion to the repository", async () => {
    saveMock.mockResolvedValue({
      completionGroupId: "00000000-0000-4000-8000-000000000060",
      revisionNumber: 1,
    });
    const form = validForm();
    form.set("note", "Private health-adjacent note");

    await expect(saveQuickLog({ status: "idle" }, form)).resolves.toEqual({
      status: "saved",
      completionGroupId: "00000000-0000-4000-8000-000000000060",
      revisionNumber: 1,
    });
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "unplanned",
        note: "Private health-adjacent note",
        activities: [],
      }),
    );
    expect(saveMock.mock.calls[0][0]).not.toHaveProperty("userId");
  });

  it("returns safe conflict copy without echoing private content", async () => {
    saveMock.mockRejectedValue(new CompletionConflictError());
    const form = validForm();
    form.set("note", "do-not-echo-this-private-note");

    const result = await saveQuickLog({ status: "idle" }, form);
    expect(result).toEqual({
      status: "error",
      message:
        "This record changed before your save. Reload it before correcting again.",
    });
    expect(JSON.stringify(result)).not.toContain("do-not-echo");
  });

  it("returns an honest no-change message for persistence failures", async () => {
    saveMock.mockRejectedValue(new CompletionPersistenceError());
    await expect(
      saveQuickLog({ status: "idle" }, validForm()),
    ).resolves.toEqual({
      status: "error",
      message:
        "We could not save this actual. Nothing was changed. Check your connection and try again.",
    });
  });

  it("names session expiry without exposing submitted content", async () => {
    saveMock.mockRejectedValue(new CompletionAuthenticationError());
    await expect(
      saveQuickLog({ status: "idle" }, validForm()),
    ).resolves.toEqual({
      status: "error",
      message:
        "Your session expired. Sign in again before retrying; nothing was saved.",
    });
  });
});

function validForm(): FormData {
  const form = new FormData();
  form.set("idempotencyKey", "00000000-0000-4000-8000-000000000030");
  form.set("expectedRevision", "0");
  form.set("actualLocalDate", "2026-07-28");
  form.set("timezoneName", "Europe/Berlin");
  form.set("outcome", "unplanned");
  form.set("activityCount", "0");
  return form;
}
