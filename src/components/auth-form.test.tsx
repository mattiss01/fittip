import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AuthForm } from "@/components/auth-form";

describe("AuthForm", () => {
  afterEach(cleanup);

  it("renders a server-posted sign-up form and safe validation feedback", () => {
    render(
      <AuthForm initialMode="sign-up" searchParams={{ error: "validation" }} />,
    );

    expect(document.querySelector("form")).toHaveAttribute(
      "action",
      "/auth/signup",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "at least 8 characters",
    );
  });

  it("shows what is typed in a password field on request, one field at a time", () => {
    render(<AuthForm initialMode="sign-up" />);

    const password = screen.getByLabelText("Password", { exact: true });
    const confirmation = screen.getByLabelText("Confirm password", {
      exact: true,
    });
    expect(password).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "password");
    // A browser must never offer to remember a password as plain text.
    expect(password).toHaveAttribute("autocomplete", "new-password");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    // The switch is not the form's button: it must not send the form.
    expect(
      screen.getByRole("button", { name: "Show confirm password" }),
    ).toHaveAttribute("type", "button");
  });

  it("says to check the email on a page of its own, with the way back to sign-in", () => {
    render(
      <AuthForm initialMode="sign-up" searchParams={{ checkEmail: true }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Check your email.");
    expect(document.querySelector("form")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/");
  });

  it("omits the signup path when hosted staging closes registration", () => {
    render(<AuthForm allowSignUp={false} />);

    expect(
      screen.queryByRole("link", { name: "New here? Create an account" }),
    ).not.toBeInTheDocument();
  });
});
