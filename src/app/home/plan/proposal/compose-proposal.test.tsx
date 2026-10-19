import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock, generateActionMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  generateActionMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("./actions", () => ({
  generatePlanProposalAction: generateActionMock,
}));

import { INITIAL_PLAN_PROPOSAL_ACTION_STATE } from "./action-state";
import { ComposeProposal } from "./compose-proposal";

import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";

const COPY = PLAN_PROPOSAL_COPY;

/**
 * Asking for a proposal. `useActionState` is stubbed as in
 * `proposal-review.test.tsx`: what matters here is what the form offers and
 * whether it would be sent, not React's transition.
 */
describe("ComposeProposal", () => {
  const action = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([
      INITIAL_PLAN_PROPOSAL_ACTION_STATE,
      action,
      false,
    ]);
  });

  afterEach(cleanup);

  describe("the request key (17 Oct 2026)", () => {
    const keyOf = (container: HTMLElement) =>
      (
        container.querySelector(
          'input[name="idempotencyKey"]',
        ) as HTMLInputElement
      ).value;
    const replied = (submission: number, attemptEnded: boolean) => ({
      status: "error" as const,
      message: COPY.outcomes.generationFailed,
      submission,
      ...(attemptEnded ? { attemptEnded: true as const } : {}),
    });

    it("is new once an attempt has ended without a proposal", () => {
      const { container, rerender } = render(
        <ComposeProposal hasGoals today="2026-10-09" planned={[]} />,
      );
      const first = keyOf(container);

      useActionStateMock.mockReturnValue([replied(1, true), action, false]);
      rerender(<ComposeProposal hasGoals today="2026-10-09" planned={[]} />);

      expect(keyOf(container)).not.toBe(first);
    });

    it("stays the same where the attempt may still be running", () => {
      const { container, rerender } = render(
        <ComposeProposal hasGoals today="2026-10-09" planned={[]} />,
      );
      const first = keyOf(container);

      useActionStateMock.mockReturnValue([replied(1, false), action, false]);
      rerender(<ComposeProposal hasGoals today="2026-10-09" planned={[]} />);

      expect(keyOf(container)).toBe(first);
    });
  });

  it("keeps the one line that says nothing reaches the plan before the review", () => {
    render(<ComposeProposal hasGoals today="2026-10-09" planned={[]} />);

    expect(screen.getByText(COPY.generateSupport)).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.generateAction }),
    ).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks nothing without an active goal, and offers the way to Goals instead", () => {
    render(
      <ComposeProposal hasGoals={false} today="2026-10-09" planned={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: COPY.generateAction }));

    const prompt = screen.getByRole("dialog", { name: COPY.noGoalsTitle });
    expect(
      within(prompt).getByRole("link", { name: COPY.noGoalsLink }),
    ).toHaveAttribute("href", "/home/you/goals");

    fireEvent.click(
      within(prompt).getByRole("button", { name: COPY.noGoalsCancel }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("lists what is planned on the chosen days, each open unless locked (ADR-033)", () => {
    render(
      <ComposeProposal
        hasGoals
        today="2026-10-09"
        planned={[
          {
            id: "9c000000-0000-4000-8000-0000000000b1",
            localDate: "2026-10-10",
            title: "Long run",
            expectedDurationMinutes: 75,
          },
          {
            id: "9c000000-0000-4000-8000-0000000000b3",
            localDate: "2026-10-11",
            title: "Club run",
            expectedDurationMinutes: 60,
          },
          {
            id: "9c000000-0000-4000-8000-0000000000b2",
            localDate: "2026-10-20",
            title: "Far strength",
            expectedDurationMinutes: 45,
          },
        ]}
      />,
    );
    const form = () =>
      screen.getByLabelText(COPY.dayCountLabel).closest("form")!;
    const offered = () => new FormData(form()).getAll("replaceable");

    // Seven days from today by default: the third session is outside them.
    // Both listed sessions are open, and both are sent as offered.
    expect(screen.queryByText("Far strength")).toBeNull();
    expect(offered()).toEqual([
      "9c000000-0000-4000-8000-0000000000b1",
      "9c000000-0000-4000-8000-0000000000b3",
    ]);

    const lock = screen.getByRole("button", {
      name: COPY.lockLabelFor("Long run"),
    });
    expect(lock).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(lock);
    expect(lock).toHaveAttribute("aria-pressed", "true");
    expect(lock).toHaveTextContent(COPY.lockedLabel);
    // A locked session is not offered.
    expect(offered()).toEqual(["9c000000-0000-4000-8000-0000000000b3"]);

    // One day only, and nothing is planned today.
    fireEvent.change(screen.getByLabelText(COPY.dayCountLabel), {
      target: { value: "1" },
    });
    expect(screen.queryByText("Long run")).toBeNull();
    expect(screen.getByText(COPY.plannedNone)).toBeVisible();
    expect(offered()).toEqual([]);

    // Retyping the days does not cost the lock: the field is emptied on the
    // way, and the session comes back as the owner left it.
    fireEvent.change(screen.getByLabelText(COPY.dayCountLabel), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(COPY.dayCountLabel), {
      target: { value: "7" },
    });
    expect(
      screen.getByRole("button", { name: COPY.lockLabelFor("Long run") }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(offered()).toEqual(["9c000000-0000-4000-8000-0000000000b3"]);
  });

  it("opens the same question when the form is sent from the keyboard", () => {
    render(
      <ComposeProposal hasGoals={false} today="2026-10-09" planned={[]} />,
    );

    // Enter in "Days to plan" submits a form whatever its button does.
    fireEvent.submit(
      screen.getByLabelText(COPY.dayCountLabel).closest("form")!,
    );

    expect(
      screen.getByRole("dialog", { name: COPY.noGoalsTitle }),
    ).toBeVisible();
    expect(action).not.toHaveBeenCalled();
  });
});
