import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MeasurementFields } from "./measurement-fields";

import {
  emptyDraft,
  type SetGroupDraft,
} from "@/lib/training/measurement-draft";

const RAMP: SetGroupDraft[] = [
  { sets: "1", reps: "5", time: "", load: "60", by: "reps" },
  { sets: "3", reps: "3", time: "", load: "80", by: "reps" },
];

/** The fields as the editor holds them: the groups change as they are told. */
function Groups({
  onGroupsChange,
}: {
  onGroupsChange: (groups: SetGroupDraft[]) => void;
}) {
  const [groups, setGroups] = useState(RAMP);
  return (
    <MeasurementFields
      idPrefix="t"
      mode="sets_reps_load"
      draft={{ ...emptyDraft("sets_reps_load"), groups }}
      validityRef={createRef()}
      onDraftChange={vi.fn()}
      onGroupsChange={(next) => {
        onGroupsChange(next);
        setGroups(next);
      }}
    />
  );
}

afterEach(cleanup);

describe("MeasurementFields", () => {
  // Owner, 28 Oct 2026: held to drag, as the live workout's cards are; the
  // arrow keys on a group's buttons move it without a pointer.
  it("reorders set groups from the keyboard, values and all", () => {
    const onGroupsChange = vi.fn();
    render(<Groups onGroupsChange={onGroupsChange} />);

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Group 1 counts reps. Hold for a time instead",
      }),
      { key: "ArrowDown" },
    );
    expect(onGroupsChange).toHaveBeenLastCalledWith([RAMP[1], RAMP[0]]);
    expect(screen.getByLabelText("Load, group 2")).toHaveProperty(
      "value",
      "60",
    );
    // Focus follows the group to its new row, so a second ArrowDown keeps
    // moving it instead of swapping the pair back.
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "Group 2 counts reps. Hold for a time instead",
      }),
    );

    // The last group has nowhere further down to go.
    onGroupsChange.mockClear();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(onGroupsChange).not.toHaveBeenCalled();
  });

  it("keeps a group's place in step when one is removed or added", () => {
    const onGroupsChange = vi.fn();
    render(<Groups onGroupsChange={onGroupsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove set group 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add set group" }));
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Group 1 counts reps. Hold for a time instead",
      }),
      { key: "ArrowDown" },
    );

    expect(onGroupsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ sets: "" }),
      RAMP[1],
    ]);
  });
});
