import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AuthForm } from "@/components/auth-form";

describe("AuthForm", () => {
  afterEach(cleanup);

  it("offers a way back in from sign-in, and says when a reset went through", () => {
    const { rerender } = render(<AuthForm allowSignUp={false} />);

    // Offered on the hosted app too, where signing up is not.
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<AuthForm searchParams={{ passwordChanged: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your password is changed. Sign in with it.",
    );

    rerender(<AuthForm initialMode="sign-up" />);
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
  });

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

    expect(screen.getByRole("status")).toHaveTextContent("Check your email");
    expect(document.querySelector("form")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/");
  });

  it("says the account is confirmed on sign-in, and not over a failed sign-in", () => {
    const view = render(<AuthForm searchParams={{ confirmed: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your account is confirmed. Sign in to get started.",
    );

    view.rerender(
      <AuthForm searchParams={{ confirmed: true, error: "credentials" }} />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("omits the signup path when hosted staging closes registration", () => {
    render(<AuthForm allowSignUp={false} />);

    expect(
      screen.queryByRole("link", { name: "New here? Create an account" }),
    ).not.toBeInTheDocument();
  });
});
