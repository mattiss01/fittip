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

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

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
  const ui = (next?: FillProposal, rows: EditorRow[] = PLANNED) => (
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
        rows={rows}
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
    rerender: (next?: FillProposal, rows?: EditorRow[]) =>
      view.rerender(ui(next, rows)),
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

  it("leaves out a planned activity added to the suggestion and then deleted from the list", () => {
    const open = proposal("Goblet squat");
    const { replace, rerender } = setup(open);

    fireEvent.click(
      within(box()).getByRole("button", { name: "Add Walking lunge" }),
    );
    rerender(open, [PLANNED[0]]);
    expect(within(box()).queryByText("Walking lunge")).toBe(null);
    fireEvent.click(within(box()).getByRole("button", { name: "Accept" }));

    expect(replace).toHaveBeenCalledWith([activity("Goblet squat")]);
  });

  it("records only the suggestion whose list was accepted last", () => {
    const first = proposal("Goblet squat");
    const { container, rerender } = setup(first);
    fireEvent.click(within(box()).getByRole("button", { name: "Accept" }));

    const second = proposal("Step-up");
    rerender(second);
    fireEvent.click(within(box()).getByRole("button", { name: "Accept" }));

    expect(acceptedIds(container)).toEqual([second.proposalId]);
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

  it("keeps the suggestion open when the dismissal is refused", async () => {
    dismissMock.mockResolvedValueOnce({
      status: "refused",
      message: "The dismissal could not be recorded.",
    });
    setup(proposal("Goblet squat"));

    await act(async () => {
      fireEvent.click(within(box()).getByRole("button", { name: "Dismiss" }));
    });

    expect(within(box()).getByText("Goblet squat")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "could not be recorded",
    );
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

  describe("asking again by itself", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      setVisibility("visible");
    });

    async function ask() {
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Fill with Coach" }),
        );
      });
    }
    async function wait(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }
    function keys() {
      return fillMock.mock.calls.map(
        ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
      );
    }

    it("asks with the note, and again with the same key while the answer is pending", async () => {
      fillMock.mockResolvedValueOnce({
        status: "pending",
        message: "Still working.",
      });
      fillMock.mockResolvedValueOnce({
        status: "proposal",
        proposal: proposal("Box jump"),
      });
      setup();

      fireEvent.change(screen.getByLabelText("Note for the coach (optional)"), {
        target: { value: "keep it short" },
      });
      await ask();
      expect(fillMock).toHaveBeenCalledTimes(1);
      await wait(5_000);

      expect(fillMock).toHaveBeenCalledTimes(2);
      const [first, second] = fillMock.mock.calls.map(
        ([input]) => input as { note: string; idempotencyKey: string },
      );
      expect(first.note).toBe("keep it short");
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
      expect(within(box()).getByText("Box jump")).toBeTruthy();
      expect(screen.queryByText("Still working.")).toBeNull();
    });

    it("replays an answer that did not arrive, without being asked", async () => {
      fillMock.mockRejectedValueOnce(new Error("network"));
      fillMock.mockResolvedValueOnce({
        status: "proposal",
        proposal: proposal("Push-up"),
      });
      setup();

      await ask();
      await wait(5_000);

      expect(keys()).toHaveLength(2);
      expect(keys()[1]).toBe(keys()[0]);
      expect(within(box()).getByText("Push-up")).toBeTruthy();
    });

    it("keeps the key after a deadline, and takes a new one after a refusal", async () => {
      fillMock.mockResolvedValueOnce({
        status: "refused",
        message: "Too slow.",
        mayStillRun: true,
      });
      fillMock.mockResolvedValueOnce({ status: "refused", message: "No." });
      fillMock.mockResolvedValueOnce({ status: "refused", message: "No." });
      setup();

      await ask();
      // That request is closed: nothing is asked again by itself.
      await wait(30_000);
      expect(keys()).toHaveLength(1);
      expect(screen.getByText("Too slow.")).toBeTruthy();

      // Asked again by hand, it replays the same request.
      await ask();
      expect(keys()[1]).toBe(keys()[0]);
      expect(screen.getByText("No.")).toBeTruthy();
      // A definite refusal ends the attempt: asking again is a new question.
      await ask();
      expect(keys()[2]).not.toBe(keys()[1]);
    });

    it("stops after the coach's deadline and says so, keeping the key", async () => {
      fillMock.mockResolvedValue({
        status: "pending",
        message: "Still working.",
      });
      setup();

      await ask();
      await wait(205_000);
      const asked = fillMock.mock.calls.length;
      await wait(60_000);

      expect(fillMock).toHaveBeenCalledTimes(asked);
      expect(screen.getByText("Still working.")).toBeTruthy();
      await ask();
      expect(keys().at(-1)).toBe(keys()[0]);
    });

    it("waits while the page is hidden, and asks the moment it is back", async () => {
      fillMock.mockRejectedValueOnce(new Error("network"));
      fillMock.mockResolvedValueOnce({
        status: "proposal",
        proposal: proposal("Dip"),
      });
      setup();

      setVisibility("hidden");
      await ask();
      await wait(60_000);
      expect(fillMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        setVisibility("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fillMock).toHaveBeenCalledTimes(2);
      expect(within(box()).getByText("Dip")).toBeTruthy();
    });

    it("asks again at once when the page comes back while an ask was out", async () => {
      // The first ask never answers: the phone slept with it on its way.
      fillMock.mockReturnValueOnce(new Promise(() => {}));
      fillMock.mockResolvedValueOnce({
        status: "proposal",
        proposal: proposal("Pike push-up"),
      });
      setup();

      await ask();
      await act(async () => {
        setVisibility("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await wait(400_000);
      expect(fillMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        setVisibility("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(keys()).toHaveLength(2);
      expect(keys()[1]).toBe(keys()[0]);
      expect(within(box()).getByText("Pike push-up")).toBeTruthy();
    });

    it("gives up on an ask that never answers, then asks again", async () => {
      fillMock.mockReturnValueOnce(new Promise(() => {}));
      fillMock.mockResolvedValueOnce({
        status: "proposal",
        proposal: proposal("Dip"),
      });
      setup();

      await ask();
      await wait(210_000);
      expect(fillMock).toHaveBeenCalledTimes(1);
      await wait(5_000);
      expect(fillMock).toHaveBeenCalledTimes(2);
      expect(within(box()).getByText("Dip")).toBeTruthy();
    });

    it("keeps the note fixed while the coach is answering it", async () => {
      fillMock.mockReturnValueOnce(new Promise(() => {}));
      setup();

      await ask();
      expect(
        screen.getByLabelText<HTMLTextAreaElement>(
          "Note for the coach (optional)",
        ).disabled,
      ).toBe(true);
    });
  });
});
