import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ActivityEditor,
  ActivityLibraryProvider,
  type LibraryActivityOption,
  type SaveToLibrary,
  type UpdateInLibrary,
} from "./activity-editor";

afterEach(cleanup);

const LINKED_ID = "77000000-0000-4000-8000-0000000000b1";
const NEW_ID = "77000000-0000-4000-8000-0000000000b2";

const SQUAT: LibraryActivityOption = {
  id: LINKED_ID,
  updatedAt: "2026-09-27T09:00:00.000Z",
  name: "Back squat",
  sport: "Strength",
  instructions: "Pause at the bottom",
  measurementMode: "duration_intensity",
  target: { duration_minutes: 20 },
};

function submitted(container: HTMLElement): unknown[] {
  const field = container.querySelector<HTMLInputElement>(
    'input[name="activities"]',
  );
  return JSON.parse(field?.value ?? "null") as unknown[];
}

describe("ActivityEditor and the activity library", () => {
  it("submits a row's library link back unchanged, so an edit cannot drop it", () => {
    const { container } = render(
      <ActivityEditor
        idPrefix="t"
        initial={[
          {
            personalActivityId: LINKED_ID,
            name: "Back squat",
            sport: "Strength",
            instructions: null,
            measurementMode: "unmeasured",
            target: null,
          },
        ]}
      />,
    );

    expect(submitted(container)).toEqual([
      expect.objectContaining({ personalActivityId: LINKED_ID }),
    ]);
  });

  it("offers no picker when the library is empty", () => {
    render(<ActivityEditor idPrefix="t" />);
    expect(
      screen.queryByRole("button", { name: "Add activity from library" }),
    ).toBeNull();
  });

  it("copies a picked definition by value and links it", () => {
    const { container } = render(
      <ActivityLibraryProvider activities={[SQUAT]}>
        <ActivityEditor idPrefix="t" sessionSport="Tennis" />
      </ActivityLibraryProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add activity from library" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Back squat/ }));

    expect(submitted(container)).toEqual([
      {
        personalActivityId: LINKED_ID,
        name: "Back squat",
        // The definition's sport, not the session's.
        sport: "Strength",
        instructions: "Pause at the bottom",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 20 },
      },
    ]);
    // The list closes once something is picked.
    expect(screen.queryByRole("list", { name: "Your activities" })).toBeNull();
  });

  it("saves a hand-typed row to the library and links it to the new definition", async () => {
    const saveToLibrary = vi.fn<SaveToLibrary>().mockResolvedValue({
      status: "saved",
      message: "Saved to your library as Strides.",
      personalActivityId: NEW_ID,
      updatedAt: "2026-09-27T10:00:00.000Z",
    });
    const { container } = render(
      <ActivityLibraryProvider activities={[]} saveToLibrary={saveToLibrary}>
        <ActivityEditor
          idPrefix="t"
          initial={[
            {
              personalActivityId: null,
              name: "Strides",
              sport: "Running",
              instructions: null,
              measurementMode: "unmeasured",
              target: null,
            },
          ]}
        />
      </ActivityLibraryProvider>,
    );

    // A named row starts collapsed; the button is inside it.
    fireEvent.click(screen.getByRole("button", { name: /Strides/ }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Save activity to library" }),
      );
    });

    expect(saveToLibrary).toHaveBeenCalledWith({
      name: "Strides",
      sport: "Running",
      instructions: null,
      measurementMode: "unmeasured",
      target: null,
    });
    expect(submitted(container)).toEqual([
      expect.objectContaining({ personalActivityId: NEW_ID }),
    ]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved to your library as Strides.",
    );
    // Saved once; a second press would only make a twin.
    expect(
      screen.queryByRole("button", { name: "Save activity to library" }),
    ).toBeNull();
  });

  it("offers Save to library again for a row whose definition was removed", () => {
    render(
      <ActivityLibraryProvider activities={[]} saveToLibrary={vi.fn()}>
        <ActivityEditor
          idPrefix="t"
          initial={[
            {
              personalActivityId: LINKED_ID,
              name: "Back squat",
              sport: "Strength",
              instructions: null,
              measurementMode: "unmeasured",
              target: null,
            },
          ]}
        />
      </ActivityLibraryProvider>,
    );

    expect(
      screen.getByRole("button", {
        name: "Save activity to library",
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it("does not offer it for a row still equal to its active definition", () => {
    render(
      <ActivityLibraryProvider activities={[SQUAT]} saveToLibrary={vi.fn()}>
        <ActivityEditor
          idPrefix="t"
          initial={[
            {
              personalActivityId: LINKED_ID,
              name: SQUAT.name,
              sport: SQUAT.sport,
              instructions: SQUAT.instructions,
              measurementMode: SQUAT.measurementMode,
              target: SQUAT.target,
            },
          ]}
        />
      </ActivityLibraryProvider>,
    );

    expect(
      screen.queryByRole("button", {
        name: "Save activity to library",
        hidden: true,
      }),
    ).toBeNull();
  });

  it("offers it for a picked row once it is changed, as a new definition", async () => {
    const saveToLibrary = vi.fn<SaveToLibrary>().mockResolvedValue({
      status: "saved",
      message: "Saved to your library as Front squat.",
      personalActivityId: NEW_ID,
      updatedAt: "2026-09-27T10:00:00.000Z",
    });
    const { container } = render(
      <ActivityLibraryProvider
        activities={[SQUAT]}
        saveToLibrary={saveToLibrary}
      >
        <ActivityEditor idPrefix="t" />
      </ActivityLibraryProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add activity from library" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Back squat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back squat/ }));
    expect(
      screen.queryByRole("button", { name: "Save as new library activity" }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Front squat" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Save as new library activity" }),
      );
    });

    expect(saveToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Front squat", sport: "Strength" }),
    );
    // The row now answers to the new definition, and the old one is untouched.
    expect(submitted(container)).toEqual([
      expect.objectContaining({
        personalActivityId: NEW_ID,
        name: "Front squat",
      }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Save as new library activity" }),
    ).toBeNull();
  });

  it("updates the definition a changed row came from, and stays linked to it", async () => {
    const updateInLibrary = vi.fn<UpdateInLibrary>().mockResolvedValue({
      status: "saved",
      message: "Back squat updated in your library.",
      personalActivityId: LINKED_ID,
      updatedAt: "2026-09-27T11:00:00.000Z",
    });
    const { container } = render(
      <ActivityLibraryProvider
        activities={[SQUAT]}
        saveToLibrary={vi.fn<SaveToLibrary>()}
        updateInLibrary={updateInLibrary}
      >
        <ActivityEditor idPrefix="t" />
      </ActivityLibraryProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add activity from library" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Back squat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back squat/ }));
    expect(
      screen.queryByRole("button", { name: "Update Back squat in library" }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "No pause" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Update Back squat in library" }),
      );
    });

    // Sent with the timestamp it was read at, so an edit made elsewhere in
    // the meantime is refused rather than overwritten.
    expect(updateInLibrary).toHaveBeenCalledWith(
      LINKED_ID,
      "2026-09-27T09:00:00.000Z",
      expect.objectContaining({ name: "Back squat", instructions: "No pause" }),
    );
    expect(submitted(container)).toEqual([
      expect.objectContaining({ personalActivityId: LINKED_ID }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Update Back squat in library" }),
    ).toBeNull();
    expect(
      screen.getByText("Back squat updated in your library."),
    ).toBeInTheDocument();
  });

  it("asks for a new name when a changed row's name is already taken", () => {
    const saveToLibrary = vi.fn<SaveToLibrary>();
    render(
      <ActivityLibraryProvider
        activities={[SQUAT]}
        saveToLibrary={saveToLibrary}
      >
        <ActivityEditor idPrefix="t" />
      </ActivityLibraryProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add activity from library" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Back squat/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back squat/ }));

    // Different instructions, same name — compared as the database compares.
    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "No pause" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: " back  SQUAT" },
    });

    expect(
      screen.queryByRole("button", { name: "Save activity to library" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "back SQUAT is already in your library. Rename this one to save it as a new activity.",
        { normalizer: (text) => text.replace(/\s+/g, " ").trim() },
      ),
    ).toBeInTheDocument();
    expect(saveToLibrary).not.toHaveBeenCalled();
  });
});
