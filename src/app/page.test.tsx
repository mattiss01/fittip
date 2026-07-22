import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the neutral FitTip foundation content", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "FitTip" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Application foundation")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
