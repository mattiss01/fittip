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

  it.each(["/home/you/goals", "/home/you/settings", "/home/plan/saved"])(
    "keeps the destination current on %s, a page under it",
    (pathname) => {
      usePathnameMock.mockReturnValueOnce(pathname);
      render(<MobileNavigation />);

      const destination = pathname.startsWith("/home/you") ? /You/ : /Plan/;
      expect(screen.getByRole("link", { name: destination })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        screen
          .getByRole("navigation", { name: "Primary" })
          .querySelectorAll("[aria-current]"),
      ).toHaveLength(1);
    },
  );
});
