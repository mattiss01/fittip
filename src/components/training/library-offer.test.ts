import { describe, expect, it } from "vitest";

import type { LibraryActivityOption } from "./activity-editor";
import { libraryOffer } from "./library-offer";

const LATZUG: LibraryActivityOption = {
  id: "9e7a0000-0000-4000-8000-000000000001",
  updatedAt: "2026-09-27T09:00:00.000Z",
  name: "Latzug",
  sport: "Strength",
  instructions: null,
  measurementMode: "sets_reps_load",
  target: { groups: [{ sets: 3, reps: 10, load: 50 }], load_unit: "kg" },
};

const BENCH: LibraryActivityOption = {
  ...LATZUG,
  id: "9e7a0000-0000-4000-8000-000000000002",
  name: "Bench press",
};

const known = new Map([LATZUG, BENCH].map((option) => [option.id, option]));

function definition(change: Partial<LibraryActivityOption> = {}) {
  const { id, updatedAt, ...rest } = { ...LATZUG, ...change };
  void id;
  void updatedAt;
  return rest;
}

describe("libraryOffer", () => {
  it("offers nothing for a row the library holds as it is", () => {
    expect(libraryOffer(LATZUG.id, definition(), known)).toEqual({});
  });

  it("offers a plain save for a row typed by hand", () => {
    expect(
      libraryOffer(null, definition({ name: "Face pulls" }), known),
    ).toEqual({ saveLabel: "Save activity to library" });
  });

  it("refuses a hand-typed row whose name is taken", () => {
    expect(libraryOffer(null, definition(), known).saveBlocked).toMatch(
      /Latzug is already in your library/,
    );
  });

  it("offers an update for a changed row that kept its name, and says to rename for a new one", () => {
    const offer = libraryOffer(
      LATZUG.id,
      definition({
        target: { groups: [{ sets: 3, reps: 10, load: 55 }], load_unit: "kg" },
      }),
      known,
    );

    expect(offer.update).toEqual({
      label: "Update Latzug in library",
      linked: LATZUG,
    });
    expect(offer.saveLabel).toBeUndefined();
    expect(offer.saveBlocked).toMatch(/Rename this one/);
  });

  it("offers both for a changed row given a new name", () => {
    const offer = libraryOffer(
      LATZUG.id,
      definition({ name: "Latzug eng" }),
      known,
    );

    expect(offer.saveLabel).toBe("Save as new library activity");
    // Named after the definition it would change, not the row's new name.
    expect(offer.update?.label).toBe("Update Latzug in library");
  });

  it("offers neither for a row renamed to another definition's name", () => {
    const offer = libraryOffer(
      LATZUG.id,
      definition({ name: "bench  PRESS" }),
      known,
    );

    expect(offer.update).toBeUndefined();
    expect(offer.saveLabel).toBeUndefined();
    expect(offer.saveBlocked).toMatch(/already in your library/);
  });
});
