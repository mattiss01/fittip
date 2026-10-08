import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateField } from "./date-field";

afterEach(cleanup);

const part = (name: "Day" | "Month" | "Year") =>
  screen.getByLabelText<HTMLInputElement>(name);
const type = (day: string, month: string, year: string) => {
  fireEvent.change(part("Day"), { target: { value: day } });
  fireEvent.change(part("Month"), { target: { value: month } });
  fireEvent.change(part("Year"), { target: { value: year } });
};
const problems = () =>
  (["Day", "Month", "Year"] as const)
    .map((name) => part(name).validationMessage)
    .filter(Boolean);
const sent = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>("input[name='date']")?.value;

describe("DateField", () => {
  it("sends a typed date as one value and has nothing to say about it", () => {
    const { container } = render(
      <DateField initial={null} label="Date" name="date" />,
    );
    expect(problems()).toEqual([]);

    type("8", "10", "2026");

    expect(sent(container)).toBe("2026-10-08");
    expect(problems()).toEqual([]);
  });

  it("stops a date half typed or not on the calendar, in the browser", () => {
    render(<DateField initial="2026-10-08" label="Date" name="date" />);

    fireEvent.change(part("Year"), { target: { value: "20" } });
    expect(problems()).toEqual(["Enter a full date: day, month and year."]);

    type("30", "02", "2026");
    expect(problems()).toEqual(["Enter a full date: day, month and year."]);

    type("28", "02", "2026");
    expect(problems()).toEqual([]);
  });

  it("lets an optional date be left empty and asks for a required one", () => {
    const { rerender } = render(
      <DateField initial={null} label="Date" name="date" />,
    );
    expect(problems()).toEqual([]);

    rerender(<DateField initial={null} label="Date" name="date" required />);
    expect(problems()).toEqual(["Enter a date."]);
  });

  it("checks nothing where the form asked it not to", () => {
    const { container } = render(
      <DateField initial={null} label="Date" name="date" unchecked />,
    );

    type("8", "", "");

    expect(problems()).toEqual([]);
    expect(sent(container)).toBe("-00-08");
  });

  it("hands the form a date it may use, and nothing while there is none", () => {
    const onChange = vi.fn();
    render(
      <DateField
        initial="2026-10-08"
        label="Date"
        max="2026-10-08"
        onChange={onChange}
        rangeMessage="Choose today or an earlier day."
        required
      />,
    );

    fireEvent.change(part("Day"), { target: { value: "7" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-10-07");

    // After the last day allowed: stopped here, with the form's sentence.
    fireEvent.change(part("Day"), { target: { value: "9" } });
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(problems()).toEqual(["Choose today or an earlier day."]);

    fireEvent.change(part("Day"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("bounds only the calendar where the form gave no sentence for it", () => {
    render(
      <DateField
        initial="2026-10-09"
        label="Date"
        max="2026-10-08"
        name="date"
      />,
    );

    expect(problems()).toEqual([]);
  });

  it("shows a date that cannot be changed without a calendar, and still sends it", () => {
    const { container } = render(
      <DateField
        calendar
        initial="2026-12-06"
        label="Date"
        name="date"
        readOnly
      />,
    );

    expect(part("Day").readOnly).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(sent(container)).toBe("2026-12-06");
  });
});
