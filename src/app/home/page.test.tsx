import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import ProtectedHome from "./page";

describe("ProtectedHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the authenticated application root to Today", () => {
    expect(() => ProtectedHome()).toThrow("redirect:/home/today");
    expect(redirectMock).toHaveBeenCalledWith("/home/today");
  });
});
