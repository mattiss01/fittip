import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateField } from "./date-field";

afterEach(cleanup);

const field = () => screen.getByLabelText<HTMLInputElement>("Date");
const type = (date: string) =>
  fireEvent.change(field(), { target: { value: date } });

describe("DateField", () => {
  it("is one date field under its label, sent as one value", () => {
    render(<DateField initial={null} label="Date" name="date" />);

    expect(field().type).toBe("date");
    expect(field().name).toBe("date");
    expect(field().value).toBe("");
    expect(screen.queryByRole("button")).toBeNull();

    type("2026-10-08");

    expect(field().value).toBe("2026-10-08");
    expect(field().validationMessage).toBe("");
  });

  it("opens on the date it was given", () => {
    render(<DateField initial="1990-05-17" label="Date" name="date" />);

    expect(field().value).toBe("1990-05-17");
  });

  it("lets an optional date be left empty and asks for a required one", () => {
    const { rerender } = render(
      <DateField initial={null} label="Date" name="date" />,
    );
    expect(field().required).toBe(false);

    rerender(<DateField initial={null} label="Date" name="date" required />);
    expect(field().required).toBe(true);
    expect(field().validity.valueMissing).toBe(true);
  });

  it("holds a date to its range, in the form's words where it gave them", () => {
    render(
      <DateField
        initial="2026-10-08"
        label="Date"
        max="2026-10-08"
        min="2026-09-01"
        name="date"
        rangeMessage="Choose today or an earlier day."
      />,
    );
    expect(field().min).toBe("2026-09-01");
    expect(field().max).toBe("2026-10-08");
    expect(field().validationMessage).toBe("");

    type("2026-10-09");
    expect(field().validationMessage).toBe("Choose today or an earlier day.");
    expect(field().validity.customError).toBe(true);

    type("2026-10-07");
    expect(field().validationMessage).toBe("");
  });

  it("keeps a date to four-digit years from 1900 where the form names no range", () => {
    const onChange = vi.fn();
    render(
      <DateField
        initial={null}
        label="Date"
        max="2026-10-08"
        onChange={onChange}
        rangeMessage="Choose today or an earlier day."
      />,
    );
    expect(field().min).toBe("1900-01-01");

    // On the way to 2026 the field reads the year 2: not a date to act on,
    // and not one the form's sentence is about.
    type("0002-10-07");
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(field().validity.customError).toBe(false);
    expect(field().validity.rangeUnderflow).toBe(true);

    cleanup();
    render(<DateField initial={null} label="Date" name="date" />);
    expect(field().max).toBe("9999-12-31");
  });

  it("checks nothing where the form asked it not to", () => {
    render(
      <DateField
        initial={null}
        label="Date"
        max="2026-10-08"
        name="date"
        rangeMessage="Choose today or an earlier day."
        required
        unchecked
      />,
    );

    expect(field().required).toBe(false);
    expect(field().min).toBe("");
    expect(field().max).toBe("");

    type("2026-10-09");
    expect(field().validationMessage).toBe("");
    expect(field().value).toBe("2026-10-09");
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
    // The form sends the date itself.
    expect(field().name).toBe("");

    type("2026-10-07");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-07");

    // After the last day allowed: stopped here, with the form's sentence.
    type("2026-10-09");
    expect(onChange).toHaveBeenLastCalledWith("");

    type("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("shows a date that cannot be changed, and still sends it", () => {
    const onChange = vi.fn();
    render(
      <DateField
        initial="2026-12-06"
        label="Date"
        max="2026-10-08"
        name="date"
        onChange={onChange}
        readOnly
      />,
    );

    expect(field().readOnly).toBe(true);
    // Its date is not today's to judge.
    expect(field().max).toBe("");

    type("2026-12-07");
    expect(onChange).not.toHaveBeenCalled();
    expect(field().value).toBe("2026-12-06");
    expect(field().name).toBe("date");
  });

  it("hides its label from sight where a heading already asks", () => {
    render(<DateField hideLabel initial={null} label="Date" name="date" />);

    expect(field()).toBeTruthy();
  });
});
