import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  afterEach(() => {
    cleanup();
    delete process.env.FITTIP_RUNTIME_MODE;
    delete process.env.FITTIP_OWNER_USER_ID;
  });

  it("renders the FitTip sign-in screen", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows sign-in only in founder staging", async () => {
    process.env.FITTIP_RUNTIME_MODE = "founder-staging";
    process.env.FITTIP_OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(
      screen.queryByRole("link", { name: "New here? Create an account" }),
    ).not.toBeInTheDocument();
  });
});
