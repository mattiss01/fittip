import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthForm } from "@/components/auth-form";

describe("AuthForm", () => {
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

  it("omits the signup path when hosted staging closes registration", () => {
    render(<AuthForm allowSignUp={false} />);

    expect(
      screen.queryByRole("link", { name: "New here? Create an account" }),
    ).not.toBeInTheDocument();
  });
});
