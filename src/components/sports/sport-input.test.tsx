import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnedSportsProvider } from "./owned-sports";
import { SportInput, SportsInput } from "./sport-input";

const SPORTS = ["Running", "Trail running", "Cycling"];

function renderWithSports(field: React.ReactNode) {
  return render(
    <OwnedSportsProvider sports={SPORTS}>
      <form aria-label="form">
        <label htmlFor="sport">Sport</label>
        {field}
      </form>
    </OwnedSportsProvider>,
  );
}

afterEach(cleanup);

const suggestions = () => screen.queryByRole("group", { name: "Suggestions" });

describe("SportInput", () => {
  it("offers nothing until the owner types, even on a saved sport", () => {
    renderWithSports(<SportInput id="sport" name="sport" defaultValue="Run" />);

    expect(screen.getByLabelText("Sport")).toHaveValue("Run");
    expect(suggestions()).toBeNull();
  });

  it("offers the owner's matching sports from the first letter", () => {
    renderWithSports(<SportInput id="sport" name="sport" />);

    fireEvent.change(screen.getByLabelText("Sport"), {
      target: { value: "r" },
    });

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Running", "Trail running"]);
  });

  it("takes a tapped sport as the field's value and stops offering", () => {
    const onChange = vi.fn();
    renderWithSports(
      <SportInput id="sport" name="sport" onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Sport"), {
      target: { value: "tr" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Trail running" }));

    expect(screen.getByLabelText("Sport")).toHaveValue("Trail running");
    expect(onChange).toHaveBeenLastCalledWith("Trail running");
    expect(suggestions()).toBeNull();
  });

  it("keeps a sport that is not on the list as typed", () => {
    renderWithSports(<SportInput id="sport" name="sport" />);

    fireEvent.change(screen.getByLabelText("Sport"), {
      target: { value: "Padel" },
    });

    expect(suggestions()).toBeNull();
    expect(
      new FormData(screen.getByRole<HTMLFormElement>("form")).get("sport"),
    ).toBe("Padel");
  });
});

describe("SportsInput", () => {
  const sent = () =>
    new FormData(screen.getByRole<HTMLFormElement>("form")).get("sports");

  it("sends the goal's sports and lets one be taken away", () => {
    renderWithSports(
      <SportsInput
        id="sport"
        name="sports"
        defaultValue={["Running", "Yoga"]}
      />,
    );
    expect(sent()).toBe("Running, Yoga");
    expect(screen.getByLabelText("Sport")).not.toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "Remove Yoga" }));

    expect(sent()).toBe("Running");
  });

  it("adds a tapped sport and does not offer one the goal holds", () => {
    renderWithSports(
      <SportsInput id="sport" name="sports" defaultValue={["Running"]} />,
    );
    fireEvent.change(screen.getByLabelText("Sport"), {
      target: { value: "r" },
    });
    expect(screen.queryByRole("button", { name: "Running" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Trail running" }));

    expect(sent()).toBe("Running, Trail running");
    expect(screen.getByLabelText("Sport")).toHaveValue("");
  });

  it("counts what is still typed when the form is sent", () => {
    renderWithSports(
      <SportsInput id="sport" name="sports" defaultValue={[]} />,
    );
    expect(screen.getByLabelText("Sport")).toBeRequired();

    fireEvent.change(screen.getByLabelText("Sport"), {
      target: { value: "Running, strength" },
    });

    expect(sent()).toBe("Running, strength");
  });

  it("adds what was typed on Enter without sending the form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form aria-label="form" onSubmit={onSubmit}>
        <label htmlFor="sport">Sport</label>
        <SportsInput id="sport" name="sports" defaultValue={[]} />
      </form>,
    );
    const field = screen.getByLabelText("Sport");
    fireEvent.change(field, { target: { value: "Padel" } });

    fireEvent.keyDown(field, { key: "Enter" });

    expect(screen.getByRole("button", { name: "Remove Padel" })).toBeVisible();
    expect(field).toHaveValue("");
    expect(sent()).toBe("Padel");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
