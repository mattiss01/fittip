import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock, useSeriesRecoveredReloadMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  useSeriesRecoveredReloadMock: vi.fn(),
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
  useSeriesRecoveredReload: useSeriesRecoveredReloadMock,
}));

import { INITIAL_MATERIALIZE_ACTION_STATE } from "./series-action-state";
import { SeriesMaterializer } from "./series-materializer";

describe("SeriesMaterializer", () => {
  beforeEach(() => {
    useSeriesRecoveredReloadMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reports a recovered idle extension when no dates remain uncovered", () => {
    useSeriesRecoveredReloadMock.mockReturnValue(true);
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

  it("keeps a missing-time-zone response during recovery handling", () => {
    useSeriesRecoveredReloadMock.mockReturnValue(true);
    useActionStateMock.mockReturnValue([
      {
        status: "conflict",
        conflict: "timezone",
        message:
          "Confirm your time zone before recurring sessions can be extended.",
        submission: 1,
      },
      vi.fn(),
      false,
    ]);

    render(
      <SeriesMaterializer
        expectedRevision={4}
        uncoveredDates={["2026-08-21"]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Confirm your time zone before recurring sessions can be extended.",
    );
    expect(screen.getByText("Reload the Plan to continue")).toBeVisible();
    expect(screen.queryByText(/response was lost/i)).toBeNull();
  });
});
