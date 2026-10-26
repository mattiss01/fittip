import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DeleteAccount } from "./delete-account";

describe("DeleteAccount (ADR-039)", () => {
  afterEach(cleanup);

  it("enables the button only once DELETE is typed exactly", () => {
    render(<DeleteAccount refusal={null} />);
    const button = screen.getByRole("button", { name: "Delete my account" });
    const input = screen.getByLabelText("Type DELETE to confirm");

    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "delete" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(button).toBeEnabled();
  });

  it("posts the typed word to the route that deletes and signs out", () => {
    render(<DeleteAccount refusal={null} />);
    const form = document.querySelector("form[data-delete-account]")!;
    expect(form.getAttribute("action")).toBe("/auth/delete-account");
    expect(form.getAttribute("method")).toBe("post");
    expect(screen.getByLabelText("Type DELETE to confirm")).toHaveAttribute(
      "name",
      "confirmation",
    );
  });

  it("says what goes and that it cannot be undone", () => {
    render(<DeleteAccount refusal={null} />);
    expect(screen.getByText(/everything in it/)).toHaveTextContent(
      "It cannot be undone.",
    );
  });

  it("explains a refusal, and ignores a reason it does not know", () => {
    const { rerender } = render(<DeleteAccount refusal="confirmation" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing was deleted.");
    rerender(<DeleteAccount refusal="<script>" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
