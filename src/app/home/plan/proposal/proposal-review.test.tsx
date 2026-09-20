import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useActionStateMock,
  changePlanActionMock,
  decideItemActionMock,
  discardActionMock,
  finishActionMock,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  changePlanActionMock: vi.fn(),
  decideItemActionMock: vi.fn(),
  discardActionMock: vi.fn(),
  finishActionMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({ changePlanAction: changePlanActionMock }));
vi.mock("./actions", () => ({
  decidePlanProposalItemAction: decideItemActionMock,
  discardPlanProposalAction: discardActionMock,
  finishPlanReviewAction: finishActionMock,
}));

import { ProposalReview } from "./proposal-review";
import type {
  PlannedSessionSummary,
  ProposalTimelineDay,
} from "./proposal-timeline";

import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
import type { ProposalRoadmapView } from "@/lib/plan/plan-proposal-view";

/**
 * The review surface, as M3-16B changed it.
 *
 * What is worth asserting here rather than in the timeline unit is everything
 * that depends on the surface's own judgement: which planned sessions get an
 * editor, what the editor submits, and whether the two staleness notices say
 * what happened. `useActionState` is stubbed for the same reason
 * `plan-manager.test.tsx` stubs it — these assertions are about what is
 * rendered and what a form would submit, not about React's transition.
 */

const PROPOSAL_ID = "9c000000-0000-4000-8000-000000000001";
const SESSION_ID = "9c000000-0000-4000-8000-000000000010";

function planned(
  overrides: Partial<PlannedSessionSummary> = {},
): PlannedSessionSummary {
  return {
    id: SESSION_ID,
    title: "Easy run",
    sport: "Running",
    expectedDurationMinutes: 45,
    isLocked: false,
    status: "active",
    intent: "Conversational throughout.",
    note: "Left knee was tight last week.",
    seriesId: null,
    ...overrides,
  };
}

function day(
  overrides: Partial<ProposalTimelineDay> = {},
): ProposalTimelineDay {
  return {
    localDate: "2026-09-21",
    isToday: false,
    planned: [planned()],
    isRecoveryDay: false,
    items: [],
    ...overrides,
  };
}

function renderReview(
  overrides: {
    days?: ProposalTimelineDay[];
    roadmap?: ProposalRoadmapView | null;
    planChangedSinceComposed?: boolean;
  } = {},
) {
  return render(
    <ProposalReview
      proposalId={PROPOSAL_ID}
      expectedPlanRevision={12}
      finishKey="9c000000-0000-4000-8000-0000000000ff"
      days={overrides.days ?? [day()]}
      roadmap={overrides.roadmap ?? null}
      planChangedSinceComposed={overrides.planChangedSinceComposed ?? false}
      unresolved={0}
      staged={0}
      isExample={false}
    />,
  );
}

describe("editing a planned session inside review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });

  afterEach(cleanup);

  it("opens the plan's own editor on an already-planned session", () => {
    renderReview();

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Easy run",
    );
    expect(screen.getByRole("textbox", { name: "Sport" })).toHaveValue(
      "Running",
    );
    expect(screen.getByRole("spinbutton", { name: "Minutes" })).toHaveValue(45);
  });

  /**
   * The failure this guards is silent and destructive: an editor that opened
   * on a blank intent would clear, on the owner's next save, something they
   * wrote on the plan surface. The fields have to be carried all the way here
   * for that not to happen.
   */
  it("carries the fields the plan surface writes, not just the ones it shows", () => {
    renderReview();

    expect(screen.getByRole("textbox", { name: "Intent" })).toHaveValue(
      "Conversational throughout.",
    );
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(
      "Left knee was tight last week.",
    );
  });

  it("submits an edit against the plan revision the review was built on", () => {
    const { container } = renderReview();
    const form = container.querySelector(
      'form:has(input[value="edit"])',
    ) as HTMLFormElement;

    expect(
      form.querySelector<HTMLInputElement>('input[name="operation"]')?.value,
    ).toBe("edit");
    expect(
      form.querySelector<HTMLInputElement>('input[name="sessionId"]')?.value,
    ).toBe(SESSION_ID);
    expect(
      form.querySelector<HTMLInputElement>('input[name="expectedRevision"]')
        ?.value,
    ).toBe("12");
  });

  it("offers a lock toggle that sends the opposite of the current state", () => {
    const { container } = renderReview();
    const form = container.querySelector(
      'form:has(input[value="set_lock"])',
    ) as HTMLFormElement;

    expect(
      form.querySelector<HTMLInputElement>('input[name="isLocked"]')?.value,
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: `Lock Easy run` }),
    ).toBeInTheDocument();
  });

  it("names the scope it takes on a recurring occurrence", () => {
    renderReview({
      days: [day({ planned: [planned({ seriesId: "series-1" })] })],
    });

    expect(
      screen.getByText(PLAN_PROPOSAL_COPY.editPlannedSeriesConsequence),
    ).toBeInTheDocument();
  });

  /**
   * Every non-destructive plan operation refuses a cancelled session today, so
   * an editor here would be a control the server declines. Reactivating one is
   * its own ticket.
   */
  it("offers no editor on a cancelled session", () => {
    renderReview({
      days: [day({ planned: [planned({ status: "cancelled" })] })],
    });

    expect(
      screen.queryByRole("textbox", { name: "Title" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(PLAN_PROPOSAL_COPY.cancelledBadge, { exact: false }),
    ).toBeInTheDocument();
  });
});

describe("what the review says about staleness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });

  afterEach(cleanup);

  it("says nothing when the plan has not moved and there is no roadmap", () => {
    renderReview();

    expect(
      screen.queryByText(PLAN_PROPOSAL_COPY.planChangedNotice),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(PLAN_PROPOSAL_COPY.roadmapHeading),
    ).not.toBeInTheDocument();
  });

  /**
   * The wording matters as much as the presence. The timeline is re-read on
   * the render that shows this, so telling the owner to reload would be asking
   * for work the page already did.
   */
  it("states that the plan moved without asking the owner to do anything", () => {
    renderReview({ planChangedSinceComposed: true });

    const notice = screen.getByText(PLAN_PROPOSAL_COPY.planChangedNotice);
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).not.toMatch(/reload/i);
  });

  it("names the roadmap a proposal was planned under", () => {
    renderReview({
      roadmap: {
        title: "Autumn 10k build",
        versionNumber: 3,
        isSuperseded: false,
        staleReasons: [],
      },
    });

    expect(
      screen.getByText(PLAN_PROPOSAL_COPY.roadmapHeading),
    ).toBeInTheDocument();
    expect(screen.getByText(/Autumn 10k build/)).toBeInTheDocument();
    expect(screen.getByText(/version 3/)).toBeInTheDocument();
  });

  it("names both stale reasons separately when both hold", () => {
    renderReview({
      roadmap: {
        title: "Autumn 10k build",
        versionNumber: 3,
        isSuperseded: false,
        staleReasons: ["out_of_window", "goal_missing"],
      },
    });

    // Two entries, each its own sentence. One combined string would read as a
    // single fault and lose the distinction the owner acts on.
    expect(
      screen.getByText(PLAN_PROPOSAL_COPY.roadmapStaleOutOfWindow, {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(PLAN_PROPOSAL_COPY.roadmapStaleGoalMissing, {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  /**
   * A roadmap accepted since the proposal was made. Naming the current
   * roadmap's title here would name the wrong one, so the surface says only
   * which version it was and that it has been replaced.
   */
  it("does not name a roadmap that has been superseded", () => {
    renderReview({
      roadmap: {
        title: null,
        versionNumber: 2,
        isSuperseded: true,
        staleReasons: [],
      },
    });

    expect(screen.getByText(/Version 2/)).toBeInTheDocument();
    expect(screen.getByText(/since replaced/)).toBeInTheDocument();
  });
});
