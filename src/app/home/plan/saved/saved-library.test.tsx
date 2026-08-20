import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("./actions", () => ({
  changeLibraryAction: vi.fn(),
  saveSessionToLibraryAction: vi.fn(),
}));

import {
  INITIAL_LIBRARY_ACTION_STATE,
  type LibraryActionState,
} from "./action-state";
import { SavedLibrary, type SavedSessionView } from "./saved-library";

const SAVED_ID = "7f000000-0000-4000-8000-000000000001";
const DATES = ["2026-08-18", "2026-08-19", "2026-08-20"];
const action = vi.fn();

function renderLibrary(
  state: LibraryActionState = INITIAL_LIBRARY_ACTION_STATE,
  sessions: SavedSessionView[] = [],
  dates: string[] = DATES,
) {
  useActionStateMock.mockReturnValue([state, action, false]);
  return render(
    <SavedLibrary dates={dates} planRevision={4} sessions={sessions} />,
  );
}

function entry(overrides: Partial<SavedSessionView> = {}): SavedSessionView {
  return {
    id: SAVED_ID,
    revision: 2,
    name: "Tuesday tempo",
    title: "Tempo run",
    sport: "Running",
    intent: null,
    expectedDurationMinutes: 60,
    note: null,
    activities: [],
    ...overrides,
  };
}

describe("the saved session library surface", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("reads an empty library as empty rather than as a failure", () => {
    renderLibrary();
    expect(
      screen.getByRole("heading", { name: "Nothing saved yet." }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/error|unavailable|failed/i)).toBeNull();
    // Nothing implies a score, a streak, or something to earn.
    expect(screen.queryByText(/streak|progress|goal|earn/i)).toBeNull();
  });

  it("shows what an entry is and sends its own revision back", () => {
    renderLibrary(INITIAL_LIBRARY_ACTION_STATE, [
      entry({
        intent: "Threshold work",
        activities: [{ position: 0, name: "Tempo blocks", sport: "Running" }],
      }),
    ]);

    expect(screen.getByText("Tuesday tempo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tempo run" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Running · 60 min · 1 activity"),
    ).toBeInTheDocument();
    expect(screen.getByText("Threshold work")).toBeInTheDocument();
    expect(screen.getByText("Tempo blocks · Running")).toBeInTheDocument();

    for (const input of document.querySelectorAll<HTMLInputElement>(
      "input[name='expectedRevision']",
    )) {
      // The reuse form answers to the plan; the entry forms answer to the entry.
      expect(["2", "4"]).toContain(input.value);
    }
    expect(screen.queryByRole("link", { name: "Repeat" })).toBeNull();
  });

  it("says what deleting does before it can happen", () => {
    renderLibrary(INITIAL_LIBRARY_ACTION_STATE, [entry()]);
    expect(
      screen.getByText(/removes this entry permanently/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no archive and no undo/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete permanently" }),
    ).toBeInTheDocument();
  });

  it("says both copies are independent, in both directions", () => {
    renderLibrary(INITIAL_LIBRARY_ACTION_STATE, [entry()]);
    expect(
      screen.getByText(/later changes here will not reach it/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sessions already added to your plan from it stay/i),
    ).toBeInTheDocument();
  });

  it("offers no date to reuse onto until the owner has a stored zone", () => {
    renderLibrary(INITIAL_LIBRARY_ACTION_STATE, [entry()], []);
    expect(screen.queryByLabelText("Add to")).toBeNull();
    expect(
      screen.getByText(/Confirm your time zone on the plan first/i),
    ).toBeInTheDocument();
  });

  it("returns a refused edit to the form it came from and offers a reload", () => {
    renderLibrary(
      {
        status: "conflict",
        message: "That saved session changed somewhere else.",
        submission: 1,
        operation: "edit",
        savedSessionId: SAVED_ID,
        conflict: "stale",
        draft: {
          name: "Renamed",
          title: "Tempo run",
          sport: "Running",
          intent: "",
          expectedDurationMinutes: "",
          note: "",
        },
      },
      [entry(), entry({ id: "7f000000-0000-4000-8000-000000000002" })],
    );

    expect(
      document.querySelector<HTMLInputElement>(`#edit-${SAVED_ID}-name`),
    ).toHaveValue("Renamed");
    // The other entry's form keeps its own stored value.
    expect(
      document.querySelector<HTMLInputElement>(
        "#edit-7f000000-0000-4000-8000-000000000002-name",
      ),
    ).toHaveValue("Tuesday tempo");
    expect(
      screen.getByRole("link", { name: "Reload the library" }),
    ).toBeInTheDocument();
  });

  it("offers no reload when the surface has no reason to think it is stale", () => {
    renderLibrary(INITIAL_LIBRARY_ACTION_STATE, [entry()]);
    expect(screen.queryByRole("link", { name: /Reload/ })).toBeNull();
  });
});
