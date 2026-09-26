import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { MeasurementFields } from "./measurement-fields";

import { emptyDraft } from "@/lib/training/measurement-draft";

describe("MeasurementFields", () => {
  it("reorders set groups from their handles, values and all", () => {
    const onGroupsChange = vi.fn();
    const draft = {
      ...emptyDraft("sets_reps_load"),
      groups: [
        { sets: "1", reps: "5", load: "60" },
        { sets: "3", reps: "3", load: "80" },
      ],
    };
    render(
      <MeasurementFields
        idPrefix="t"
        mode="sets_reps_load"
        draft={draft}
        validityRef={createRef()}
        onDraftChange={vi.fn()}
        onGroupsChange={onGroupsChange}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: /Set group 1 of 2/ }),
      { key: "ArrowDown" },
    );
    expect(onGroupsChange).toHaveBeenLastCalledWith([
      { sets: "3", reps: "3", load: "80" },
      { sets: "1", reps: "5", load: "60" },
    ]);
    // Focus follows the group to its new row, so a second ArrowDown keeps
    // moving it instead of swapping the pair back.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Set group 2 of 2/ }),
    );

    // The first group has nowhere further up to go.
    onGroupsChange.mockClear();
    fireEvent.keyDown(
      screen.getByRole("button", { name: /Set group 1 of 2/ }),
      { key: "ArrowUp" },
    );
    expect(onGroupsChange).not.toHaveBeenCalled();
  });
});
