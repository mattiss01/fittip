import { beforeEach, describe, expect, it, vi } from "vitest";

const { createProfileMock, revalidatePathMock } = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/repositories/profile-repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/repositories/profile-repository")
  >()),
  createProfileRepository: createProfileMock,
}));

import {
  addSportAction,
  deleteSportAction,
  renameSportAction,
  setSportColourAction,
} from "./sport-actions";
import {
  ProfileAuthenticationError,
  ProfilePersistenceError,
  SportMissingError,
  SportNameInvalidError,
  SportNameTakenError,
} from "@/server/repositories/profile-repository";

const ID = "7d000000-0000-4000-8000-000000000001";
const repository = {
  addSport: vi.fn(),
  renameSport: vi.fn(),
  setSportColour: vi.fn(),
  deleteSport: vi.fn(),
};

describe("sport actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProfileMock.mockResolvedValue(repository);
  });

  it("adds a sport as a person reads its name, and refreshes Home", async () => {
    await expect(addSportAction("  Trail   running ")).resolves.toEqual({
      status: "saved",
    });
    expect(repository.addSport).toHaveBeenCalledWith("Trail running");
    expect(revalidatePathMock).toHaveBeenCalledWith("/home", "layout");
  });

  it("refuses a name the list does not keep before asking the database", async () => {
    for (const name of ["", "Run, cycle", "x".repeat(61), 42]) {
      const result = await addSportAction(name);
      expect(result.status).toBe("refused");
    }
    expect(repository.addSport).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("merges on a rename only when the owner said so", async () => {
    await renameSportAction(ID, "Cycling");
    expect(repository.renameSport).toHaveBeenLastCalledWith(
      ID,
      "Cycling",
      false,
    );
    await renameSportAction(ID, "Cycling", true);
    expect(repository.renameSport).toHaveBeenLastCalledWith(
      ID,
      "Cycling",
      true,
    );
    // Anything but `true` is not a yes.
    await renameSportAction(ID, "Cycling", "true");
    expect(repository.renameSport).toHaveBeenLastCalledWith(
      ID,
      "Cycling",
      false,
    );
  });

  it("refuses a colour that is not one of the swatches", async () => {
    const result = await setSportColourAction(ID, "red");
    expect(result.status).toBe("refused");
    expect(repository.setSportColour).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a sport's", async () => {
    const result = await deleteSportAction("../profiles");
    expect(result).toEqual({
      status: "refused",
      message: expect.stringContaining("no longer on your list"),
    });
    expect(repository.deleteSport).not.toHaveBeenCalled();
  });

  it.each([
    [new SportNameTakenError(), "refused", "You already have that sport."],
    [new SportMissingError(), "refused", "no longer on your list"],
    [new SportNameInvalidError(), "refused", "up to 60 characters"],
    [new ProfileAuthenticationError(), "session", "Sign in again"],
    [new ProfilePersistenceError(), "error", "could not be changed"],
  ])("says what went wrong for %s", async (error, status, message) => {
    repository.renameSport.mockRejectedValueOnce(error);
    const result = await renameSportAction(ID, "Running");
    expect(result).toEqual({
      status,
      message: expect.stringContaining(message),
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
