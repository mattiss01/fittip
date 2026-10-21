import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/home/progress/completion-record"),
}));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { MobileNavigation } from "@/components/home/mobile-navigation";

describe("MobileNavigation", () => {
  afterEach(cleanup);

  it("exposes only the four approved destinations with Progress current", () => {
    render(<MobileNavigation />);

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(navigation.querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Today/ })).toHaveAttribute(
      "href",
      "/home/today",
    );
    expect(screen.getByRole("link", { name: /Plan/ })).toHaveAttribute(
      "href",
      "/home/plan",
    );
    expect(screen.getByRole("link", { name: /Progress/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /You/ })).toHaveAttribute(
      "href",
      "/home/you",
    );
    expect(navigation).not.toHaveTextContent("Coach");
    expect(navigation).not.toHaveTextContent("History");
  });

  it("marks You while guided setup is still to be done, and not otherwise", () => {
    const { container, rerender } = render(<MobileNavigation setupOpen />);

    expect(container.querySelectorAll("[data-setup-open]")).toHaveLength(1);
    // Said as well as shown, as a description: the link is still named
    // "You", which the browser flows find it by.
    expect(
      screen.getByRole("link", { name: "You" }),
    ).toHaveAccessibleDescription("Guided setup is not finished");
    expect(
      screen.getByRole("link", { name: "Today" }),
    ).not.toHaveAccessibleDescription();

    rerender(<MobileNavigation />);
    expect(container.querySelector("[data-setup-open]")).toBeNull();
    expect(screen.getByRole("link", { name: "You" })).toBeVisible();
  });

  it("marks You while a coach suggestion waits, and says both reasons", () => {
    const { container } = render(<MobileNavigation setupOpen decisionsOpen />);

    expect(container.querySelectorAll(".sr-only")).toHaveLength(1);
    expect(container.querySelectorAll("[data-decisions-open]")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "You" }),
    ).toHaveAccessibleDescription(
      "Guided setup is not finished. Suggestions from the coach wait for your decision",
    );
  });

  it("marks You while no goal is active, and says so", () => {
    const { container } = render(<MobileNavigation noGoal />);

    expect(container.querySelectorAll("[data-no-goal]")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "You" }),
    ).toHaveAccessibleDescription("No active goal yet");
  });

  it("marks Plan whenever the Roadmap chip has a dot", () => {
    const { container, rerender } = render(
      <MobileNavigation roadmapAttention="review_due" />,
    );

    expect(container.querySelectorAll("[data-roadmap-attention]")).toHaveLength(
      1,
    );
    expect(
      screen.getByRole("link", { name: "Plan" }),
    ).toHaveAccessibleDescription("A roadmap review is due.");

    rerender(<MobileNavigation roadmapAttention={null} />);
    expect(container.querySelector("[data-roadmap-attention]")).toBeNull();
  });

  it("is not shown during guided setup", () => {
    usePathnameMock.mockReturnValueOnce("/home/you/onboarding");
    render(<MobileNavigation />);

    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });

  it.each([
    ["/home/you/goals", "You"],
    ["/home/you/settings", "You"],
    ["/home/plan/saved", "Plan"],
  ])("on %s, a page under it, %s is current", (pathname, destination) => {
    usePathnameMock.mockReturnValueOnce(pathname);
    render(<MobileNavigation />);

    expect(screen.getByRole("link", { name: destination })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen
        .getByRole("navigation", { name: "Primary" })
        .querySelectorAll("[aria-current]"),
    ).toHaveLength(1);
  });
});
