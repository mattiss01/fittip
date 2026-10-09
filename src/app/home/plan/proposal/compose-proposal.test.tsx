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

  it("keeps the one line that says nothing reaches the plan before the review", () => {
    render(<ComposeProposal hasGoals today="2026-10-09" />);

    expect(screen.getByText(COPY.generateSupport)).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.generateAction }),
    ).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks nothing without an active goal, and offers the way to Goals instead", () => {
    render(<ComposeProposal hasGoals={false} today="2026-10-09" />);

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

  it("opens the same question when the form is sent from the keyboard", () => {
    render(<ComposeProposal hasGoals={false} today="2026-10-09" />);

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
