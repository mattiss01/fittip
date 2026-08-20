import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("./series-actions", () => ({
  materializePlanSeriesAction: vi.fn(),
}));

vi.mock("./series-transition-watch", () => ({
  seriesStallNotice: vi.fn(() => null),
  useSeriesMutationStall: vi.fn(() => null),
  useSeriesRecoveredReload: vi.fn(() => true),
}));

import { INITIAL_MATERIALIZE_ACTION_STATE } from "./series-action-state";
import { SeriesMaterializer } from "./series-materializer";

describe("SeriesMaterializer", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reports a recovered idle extension when no dates remain uncovered", () => {
    useActionStateMock.mockReturnValue([
      INITIAL_MATERIALIZE_ACTION_STATE,
      vi.fn(),
      false,
    ]);

    render(<SeriesMaterializer expectedRevision={4} uncoveredDates={[]} />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "The Plan was reloaded after the extension response was lost. What you see is what is saved.",
    );
    expect(
      screen.getByRole("heading", { name: notice.textContent! }),
    ).toBeVisible();
    expect(screen.queryByText(/Extending your recurring sessions/)).toBeNull();
  });
});
