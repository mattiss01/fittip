import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
const RANGE = { first: "2026-08-18", last: "2027-02-14" };
const action = vi.fn();

function renderLibrary(
  state: LibraryActionState = INITIAL_LIBRARY_ACTION_STATE,
  sessions: SavedSessionView[] = [],
  dateRange: { first: string; last: string } | null = RANGE,
) {
  useActionStateMock.mockReturnValue([state, action, false]);
  return render(
    <SavedLibrary dateRange={dateRange} planRevision={4} sessions={sessions} />,
  );
}

function entry(overrides: Partial<SavedSessionView> = {}): SavedSessionView {
  return {
    id: SAVED_ID,
    revision: 2,
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
        activities: [
          {
            personalActivityId: null,
            name: "Tempo blocks",
            sport: "Running",
            instructions: null,
            measurementMode: "duration_intensity",
            target: { duration_minutes: 20 },
          },
        ],
      }),
    ]);

    expect(
      screen.getByRole("heading", { name: "Tempo run" }),
    ).toBeInTheDocument();
    // One field names an entry (owner, 2 Oct 2026): no form asks for a name.
    expect(document.querySelector("input[name='name']")).toBeNull();
    expect(
      screen.getByText("Running · 60 min · 1 activity"),
    ).toBeInTheDocument();
    expect(screen.getByText("Threshold work")).toBeInTheDocument();
    // The card words each activity's target as the Plan card does.
    expect(document.querySelector("[data-activity-list]")?.textContent).toMatch(
      /Tempo blocks.*20 min/,
    );
    // A6: the edit form opens with the entry's list and submits it whole.
    const editForm = document
      .querySelector("input[name='operation'][value='edit']")!
      .closest("form")!;
    expect(
      JSON.parse(
        editForm.querySelector<HTMLInputElement>("input[name='activities']")!
          .value,
      ),
    ).toMatchObject([
      { name: "Tempo blocks", target: { duration_minutes: 20 } },
    ]);

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
    renderLibrary(INITIAL_LIBRARY_ACTION_STATE, [entry()], null);
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
          title: "Renamed",
          sport: "Running",
          intent: "",
          expectedDurationMinutes: "",
          note: "",
        },
      },
      [entry(), entry({ id: "7f000000-0000-4000-8000-000000000002" })],
    );

    expect(
      document.querySelector<HTMLInputElement>(`#edit-${SAVED_ID}-title`),
    ).toHaveValue("Renamed");
    // The other entry's form keeps its own stored value.
    expect(
      document.querySelector<HTMLInputElement>(
        "#edit-7f000000-0000-4000-8000-000000000002-title",
      ),
    ).toHaveValue("Tempo run");
    expect(
      screen.getByRole("link", { name: "Reload the library" }),
    ).toBeInTheDocument();
  });

  it("offers a new session in the library, open when there is nothing saved", () => {
    renderLibrary();
    const create = document
      .querySelector("input[name='operation'][value='create']")!
      .closest("form")!;

    expect(create.closest("details")).toHaveAttribute("open");
    expect(within(create).getByLabelText("Title")).toBeRequired();
    expect(within(create).getByLabelText("Sport")).toBeRequired();
    // It submits its activities whole, as the edit form does.
    expect(create.querySelector("input[name='activities']")).not.toBeNull();
    expect(
      within(create).getByRole("button", { name: "Add to library" }),
    ).toBeEnabled();
  });

  it("keeps what was typed when a new session is refused", () => {
    renderLibrary(
      {
        status: "validation",
        message: "Check the session details. Nothing has been changed.",
        submission: 1,
        operation: "create",
        draft: {
          title: "Hill reps",
          sport: "",
          intent: "",
          expectedDurationMinutes: "50",
          note: "",
        },
      },
      [entry()],
    );

    expect(document.querySelector("#create-title")).toHaveValue("Hill reps");
    expect(document.querySelector("#create-minutes")).toHaveValue(50);
    // The entry beside it is not given the refused form's values.
    expect(
      document.querySelector<HTMLInputElement>(`#edit-${SAVED_ID}-title`),
    ).toHaveValue("Tempo run");
  });

  it("keeps a refused new session whole, through another card's action too", () => {
    const library = (state: LibraryActionState) => {
      useActionStateMock.mockReturnValue([state, action, false]);
      return (
        <SavedLibrary dateRange={RANGE} planRevision={4} sessions={[entry()]} />
      );
    };
    const createForm = () =>
      document
        .querySelector("input[name='operation'][value='create']")!
        .closest("form")!;
    const activities = () =>
      JSON.parse(
        createForm().querySelector<HTMLInputElement>(
          "input[name='activities']",
        )!.value,
      );
    const view = render(library(INITIAL_LIBRARY_ACTION_STATE));

    // The sport typed above is what a new activity starts from.
    fireEvent.change(within(createForm()).getByLabelText("Sport"), {
      target: { value: "Running" },
    });
    fireEvent.click(
      within(createForm()).getByRole("button", { name: "Add activity" }),
    );
    fireEvent.change(within(createForm()).getByLabelText("Name"), {
      target: { value: "Strides" },
    });
    expect(activities()).toMatchObject([{ name: "Strides", sport: "Running" }]);

    // Refused: the fields come back from the draft, and the activity, which
    // the draft does not carry, is still there.
    const refused: LibraryActionState = {
      status: "validation",
      message: "Check the session details. Nothing has been changed.",
      submission: 1,
      operation: "create",
      draft: {
        title: "   ",
        sport: "Running",
        intent: "",
        expectedDurationMinutes: "",
        note: "",
      },
    };
    view.rerender(library(refused));
    expect(document.querySelector("#create-sport")).toHaveValue("Running");
    expect(activities()).toMatchObject([{ name: "Strides", sport: "Running" }]);

    // Deleting another entry answers with its own state. The half-typed
    // session is not that action's to clear.
    view.rerender(
      library({
        status: "saved",
        message: "Saved session deleted.",
        submission: 2,
        operation: "delete",
        savedSessionId: SAVED_ID,
      }),
    );
    expect(document.querySelector("#create-sport")).toHaveValue("Running");
    expect(activities()).toMatchObject([{ name: "Strides", sport: "Running" }]);
  });

  it("offers no reload when the surface has no reason to think it is stale", () => {
    renderLibrary(INITIAL_LIBRARY_ACTION_STATE, [entry()]);
    expect(screen.queryByRole("link", { name: /Reload/ })).toBeNull();
  });
});
