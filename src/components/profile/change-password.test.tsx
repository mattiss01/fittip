import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChangePassword } from "./change-password";

describe("ChangePassword (ADR-042)", () => {
  afterEach(cleanup);

  it("posts the current password and the new one twice to the route", () => {
    render(<ChangePassword refusal={null} />);
    const form = screen
      .getByRole("button", { name: "Change password" })
      .closest("form")!;
    expect(form.getAttribute("action")).toBe("/auth/change-password");
    expect(form.getAttribute("method")).toBe("post");
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "name",
      "current",
    );
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "name",
      "password",
    );
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "name",
      "confirmation",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why a change was refused, by its key", () => {
    render(<ChangePassword refusal="current" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That is not your current password. Nothing was changed.",
    );
  });

  it("shows nothing for a key it does not know, own keys only", () => {
    for (const refusal of ["__proto__", "toString", "hacked"]) {
      render(<ChangePassword refusal={refusal} />);
      expect(screen.queryByRole("alert")).toBeNull();
      cleanup();
    }
  });
});
