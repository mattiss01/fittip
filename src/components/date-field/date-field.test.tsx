import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
});
