import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home/progress/completion-record",
}));

import { MobileNavigation } from "@/components/home/mobile-navigation";

describe("MobileNavigation", () => {
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
});
