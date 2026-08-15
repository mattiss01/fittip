import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrainingMaintenance } from "@/components/home/training-maintenance";

describe("TrainingMaintenance", () => {
  it("states the temporary reset and points to preserved owner features", () => {
    render(<TrainingMaintenance />);

    expect(
      screen.getByRole("heading", { name: "One plan is taking shape." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/roadmap records/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open You" })).toHaveAttribute(
      "href",
      "/home/you",
    );
    expect(screen.getByRole("link", { name: "Review goals" })).toHaveAttribute(
      "href",
      "/home/you/goals",
    );
  });
});
