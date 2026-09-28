import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fillMock, dismissMock } = vi.hoisted(() => ({
  fillMock: vi.fn(),
  dismissMock: vi.fn(),
}));

vi.mock("./actions", () => ({
  fillSessionActivitiesAction: fillMock,
  dismissSessionActivitiesAction: dismissMock,
}));

import type { FillProposal } from "./fill-state";
import { FillWithCoach } from "./fill-with-coach";

import type {
  ActivityEditorHandle,
  ActivityValue,
  EditorRow,
} from "@/components/training/activity-editor";

afterEach(cleanup);

const SESSION_ID = "7e000000-0000-4000-8000-000000000001";

function activity(name: string): ActivityValue {
  return {
    personalActivityId: null,
    name,
    sport: "Strength",
    instructions: null,
    measurementMode: "unmeasured",
    target: null,
  };
}

// Each test answers its own suggestion: answers are remembered for the page,
// which in a test run is the module.
let nextId = 1;
function proposal(...names: string[]): FillProposal {
  const id = `5a000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
  return {
    proposalId: id,
    isExample: true,
    summary: "A lower body day.",
    safetyConsiderations: [],
    activities: names.map(activity),
    rationales: names.map((name) => `Why ${name}.`),
  };
}

const PLANNED: EditorRow[] = [
  { key: "row-1", value: activity("Back squat") },
  { key: "row-2", value: activity("Walking lunge") },
];

function setup(open?: FillProposal, onSubmit = vi.fn()) {
  const replace = vi.fn();
  const editor = {
    current: { replace } as ActivityEditorHandle,
  };
  const ui = (next?: FillProposal) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FillWithCoach
        sessionId={SESSION_ID}
        open={next}
        editor={editor}
        rows={PLANNED}
      >
        <p>editor</p>
      </FillWithCoach>
      <button type="submit">Save session</button>
    </form>
  );
  const view = render(ui(open));
  return {
    replace,
    onSubmit,
    rerender: (next?: FillProposal) => view.rerender(ui(next)),
    container: view.container,
  };
}

function box() {
  return screen.getByRole("region", { name: "Coach's suggestion" });
}

function acceptedIds(container: HTMLElement): string[] {
  return [
    ...container.querySelectorAll<HTMLInputElement>(
      'input[name="activityProposalId"]',
    ),
  ].map((input) => input.value);
}

beforeEach(() => {
  vi.clearAllMocks();
  dismissMock.mockResolvedValue({ status: "dismissed", message: "Done." });
});

describe("FillWithCoach", () => {
  it("leaves the activity list alone until Accept, then loads exactly what the box holds", () => {
    const open = proposal("Goblet squat", "Step-up");
    const { replace, container } = setup(open);

    fireEvent.click(
      within(box()).getByRole("button", { name: "Remove Goblet squat" }),
    );
    fireEvent.click(
      within(box()).getByRole("button", { name: "Add Walking lunge" }),
    );
    expect(replace).not.toHaveBeenCalled();
    expect(acceptedIds(container)).toEqual([]);

    fireEvent.click(within(box()).getByRole("button", { name: "Accept" }));

    expect(replace).toHaveBeenCalledExactlyOnceWith([
      activity("Step-up"),
      activity("Walking lunge"),
    ]);
    // Recorded as accepted by the save, not here.
    expect(acceptedIds(container)).toEqual([open.proposalId]);
    expect(screen.queryByRole("region", { name: "Coach's suggestion" })).toBe(
      null,
    );
  });

  it("brings a removed activity back with Undo", () => {
    const { replace } = setup(proposal("Goblet squat"));

    fireEvent.click(
      within(box()).getByRole("button", { name: "Remove Goblet squat" }),
    );
    fireEvent.click(
      within(box()).getByRole("button", { name: "Undo Goblet squat" }),
    );
    fireEvent.click(within(box()).getByRole("button", { name: "Accept" }));

    expect(replace).toHaveBeenCalledWith([activity("Goblet squat")]);
  });

  it("accepts an empty list when everything was removed", () => {
    const { replace } = setup(proposal("Goblet squat"));

    fireEvent.click(
      within(box()).getByRole("button", { name: "Remove Goblet squat" }),
    );
    expect(
      within(box()).getByText(/Accept empties your activity list/),
    ).toBeTruthy();
    fireEvent.click(within(box()).getByRole("button", { name: "Accept" }));

    expect(replace).toHaveBeenCalledWith([]);
    expect(screen.getByRole("status").textContent).toContain("now empty");
  });

  it("dismisses without touching the list and records it at once", async () => {
    const open = proposal("Goblet squat");
    const { replace, container } = setup(open);

    await act(async () => {
      fireEvent.click(within(box()).getByRole("button", { name: "Dismiss" }));
    });

    expect(replace).not.toHaveBeenCalled();
    expect(dismissMock).toHaveBeenCalledWith(open.proposalId);
    expect(acceptedIds(container)).toEqual([]);
  });

  it("holds a save while a suggestion is open, then saves on the owner's word", () => {
    const { onSubmit } = setup(proposal("Goblet squat"));

    fireEvent.click(screen.getByRole("button", { name: "Save session" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "will be here again",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save without it" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("saves straight away when no suggestion is open", () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("takes a suggestion the Plan read delivers late, but never one answered here", async () => {
    const answered = proposal("Goblet squat");
    const { rerender } = setup(answered);
    await act(async () => {
      fireEvent.click(within(box()).getByRole("button", { name: "Dismiss" }));
    });

    // A stale read still naming the dismissed one does not reopen it.
    rerender(undefined);
    rerender(answered);
    expect(screen.queryByRole("region", { name: "Coach's suggestion" })).toBe(
      null,
    );

    const late = proposal("Step-up");
    rerender(late);
    expect(within(box()).getByText("Step-up")).toBeTruthy();
  });

  it("asks with the note, and asks again with the same key while the answer is pending", async () => {
    fillMock.mockResolvedValue({
      status: "pending",
      message: "Still working.",
    });
    setup();

    fireEvent.change(screen.getByLabelText("Note for the coach (optional)"), {
      target: { value: "keep it short" },
    });
    for (let round = 0; round < 2; round += 1) {
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Fill with coach" }),
        );
      });
    }

    expect(fillMock).toHaveBeenCalledTimes(2);
    const [first, second] = fillMock.mock.calls.map(
      ([input]) => input as { note: string; idempotencyKey: string },
    );
    expect(first.note).toBe("keep it short");
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });
});
