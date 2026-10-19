import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useActionStateMock,
  changePlanActionMock,
  decideItemActionMock,
  discardActionMock,
  finishActionMock,
  regenerateActionMock,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  changePlanActionMock: vi.fn(),
  decideItemActionMock: vi.fn(),
  discardActionMock: vi.fn(),
  finishActionMock: vi.fn(),
  regenerateActionMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({ changePlanAction: changePlanActionMock }));
vi.mock("@/app/home/you/memory/actions", () => ({
  changeMemoryAction: vi.fn(),
}));
vi.mock("@/app/home/you/goals/suggestion-actions", () => ({
  decideGoalSuggestionAction: vi.fn(),
}));
vi.mock("./actions", () => ({
  decidePlanProposalItemAction: decideItemActionMock,
  discardPlanProposalAction: discardActionMock,
  finishPlanReviewAction: finishActionMock,
  regeneratePlanProposalAction: regenerateActionMock,
}));

import { ProposalReview } from "./proposal-review";
import type {
  PlannedSessionSummary,
  ProposalTimelineDay,
} from "./proposal-timeline";

import {
  PLAN_PROPOSAL_COPY,
  PLAN_PROPOSAL_FEEDBACK_MAX_LENGTH,
} from "@/lib/plan/plan-proposal-copy";
import { REGENERATION_FEEDBACK_MAX_LENGTH } from "@/server/ai/owner-text";
import type { GoalSuggestion } from "@/components/goals/goal-suggestions";
import type { MemorySuggestion } from "@/components/memory/memory-suggestions";

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

const COPY = PLAN_PROPOSAL_COPY;
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
    status: "active",
    intent: "Conversational throughout.",
    note: "Left knee was tight last week.",
    activities: [],
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
    isPast: false,
    planned: [planned()],
    isRecoveryDay: false,
    items: [],
    replacements: {},
    ...overrides,
  };
}

const WEEK_DESCRIPTION =
  "Two easy runs around the long one, with Thursday left free for recovery.";

function renderReview(
  overrides: {
    days?: ProposalTimelineDay[];
    planChangedSinceComposed?: boolean;
    memory?: MemorySuggestion[];
    goals?: GoalSuggestion[];
    nothingAdded?: boolean;
    safetyConsiderations?: string[];
    assumptions?: string[];
    uncertainties?: {
      statement: string;
      whyItMatters: string;
      whatToWatch: string;
    }[];
  } = {},
) {
  return render(
    <ProposalReview
      regenerationFeedback={null}
      weekDescription={WEEK_DESCRIPTION}
      safetyConsiderations={overrides.safetyConsiderations ?? []}
      assumptions={overrides.assumptions ?? []}
      uncertainties={overrides.uncertainties ?? []}
      nothingAdded={overrides.nothingAdded ?? false}
      proposalId={PROPOSAL_ID}
      expectedPlanRevision={12}
      finishKey="9c000000-0000-4000-8000-0000000000ff"
      days={overrides.days ?? [day()]}
      planChangedSinceComposed={overrides.planChangedSinceComposed ?? false}
      unresolved={0}
      staged={0}
      isExample={false}
      memory={{ revision: 0, suggestions: overrides.memory ?? [] }}
      suggestedGoals={{ goalRevision: 0, suggestions: overrides.goals ?? [] }}
    />,
  );
}

describe("an item that would replace a planned session (ADR-024)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });

  afterEach(cleanup);

  const replacing = (available: boolean) => ({
    ordinal: 0,
    kind: "session" as const,
    localDate: "2026-09-21",
    decision: "proposed" as const,
    title: "Tempo run",
    sport: "Running",
    intent: null,
    expectedDurationMinutes: 50,
    rationale: null,
    contentIndex: 0,
    replacesSessionId: SESSION_ID,
    replaces: { title: "Easy run", expectedDurationMinutes: 45, available },
  });

  it("offers Replace and Add beside, and says what it replaces", () => {
    renderReview({
      days: [
        day({
          items: [replacing(true)],
          replacements: {
            [SESSION_ID]: {
              kind: "replace",
              title: "Tempo run",
              isChosen: false,
            },
          },
        }),
      ],
    });

    expect(
      screen.getByRole("button", {
        name: COPY.replaceActionFor("Tempo run", "Easy run"),
      }),
    ).toHaveAttribute("value", "staged");
    expect(
      screen.getByRole("button", {
        name: COPY.besideActionFor("Tempo run", "Easy run"),
      }),
    ).toHaveAttribute("value", "staged_beside");
    expect(screen.getByText("Easy run, 45 min")).toBeVisible();
    expect(
      screen.getByText(COPY.plannedMayBeReplaced("Tempo run")),
    ).toBeVisible();
    expect(screen.getByText(COPY.mayBeReplacedBadge)).toBeVisible();
  });

  it("strikes the owner's session through once Replace is chosen", () => {
    const { container } = renderReview({
      days: [
        day({
          items: [{ ...replacing(true), decision: "staged" }],
          replacements: {
            [SESSION_ID]: {
              kind: "replace",
              title: "Tempo run",
              isChosen: true,
            },
          },
        }),
      ],
    });

    expect(
      container.querySelector(`[data-session-id="${SESSION_ID}"]`),
    ).toHaveAttribute("data-replaced", "chosen");
    expect(screen.getByText(COPY.willBeReplacedBadge)).toBeVisible();
    expect(screen.queryByText(COPY.alreadyPlannedBadge)).toBeNull();
  });

  it("falls back to a plain add once the session can no longer be replaced", () => {
    renderReview({ days: [day({ items: [replacing(false)] })] });

    expect(
      screen.getByRole("button", { name: COPY.stageActionFor("Tempo run") }),
    ).toHaveAttribute("value", "staged");
    expect(
      screen.queryByRole("button", {
        name: COPY.besideActionFor("Tempo run", "Easy run"),
      }),
    ).toBeNull();
    expect(screen.getByText(COPY.replaceUnavailable("Easy run"))).toBeVisible();
  });
});

describe("a planned session the coach suggests cancelling (ADR-033)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });

  afterEach(cleanup);

  const cancelling = (available: boolean) => ({
    ordinal: 0,
    kind: "cancel" as const,
    localDate: "2026-09-21",
    decision: "proposed" as const,
    title: "Easy run",
    sport: null,
    intent: null,
    expectedDurationMinutes: null,
    rationale: "Your shin needs two easy days.",
    contentIndex: null,
    replacesSessionId: SESSION_ID,
    replaces: { title: "Easy run", expectedDurationMinutes: 45, available },
  });

  it("offers Cancel it and Keep it, with the coach's reason", () => {
    renderReview({
      days: [
        day({
          items: [cancelling(true)],
          replacements: {
            [SESSION_ID]: { kind: "cancel", title: "", isChosen: false },
          },
        }),
      ],
    });

    expect(
      screen.getByRole("heading", { name: COPY.cancelItemTitle("Easy run") }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: COPY.cancelItemActionFor("Easy run"),
      }),
    ).toHaveAttribute("value", "staged");
    expect(
      screen.getByRole("button", { name: COPY.keepItemActionFor("Easy run") }),
    ).toHaveAttribute("value", "rejected");
    expect(screen.getByText("Your shin needs two easy days.")).toBeVisible();
    expect(screen.getByText(COPY.plannedMayBeCancelled)).toBeVisible();
    expect(screen.getByText(COPY.mayBeCancelledBadge)).toBeVisible();
    // There is nothing to add beside a cancel.
    expect(screen.queryByRole("button", { name: /beside/i })).toBeNull();
  });

  it("strikes the owner's session through once Cancel it is chosen", () => {
    const { container } = renderReview({
      days: [
        day({
          items: [{ ...cancelling(true), decision: "staged" }],
          replacements: {
            [SESSION_ID]: { kind: "cancel", title: "", isChosen: true },
          },
        }),
      ],
    });

    expect(
      container.querySelector(`[data-session-id="${SESSION_ID}"]`),
    ).toHaveAttribute("data-replaced", "chosen");
    expect(screen.getByText(COPY.plannedWillBeCancelled)).toBeVisible();
  });

  it("offers only Keep once there is nothing left to cancel", () => {
    renderReview({ days: [day({ items: [cancelling(false)] })] });

    expect(
      screen.queryByRole("button", {
        name: COPY.cancelItemActionFor("Easy run"),
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: COPY.keepItemActionFor("Easy run") }),
    ).toBeVisible();
    expect(screen.getByText(COPY.cancelUnavailable("Easy run"))).toBeVisible();
  });
});

describe("asking for a different plan (owner, 19 Oct 2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });

  afterEach(cleanup);

  it("counts what is typed against the limit, and says nothing about finishing", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: COPY.regenerateOpen }));

    expect(screen.queryByText(COPY.finishSupport(0))).toBeNull();
    const field = screen.getByLabelText(COPY.regenerateLabel);
    expect(screen.getByText("0/500")).toBeVisible();
    fireEvent.change(field, { target: { value: "Less running." } });
    expect(screen.getByText("13/500")).toBeVisible();
    expect(field).toHaveAttribute("maxLength", "500");
  });

  it("holds the browser's limit to the server's", () => {
    expect(PLAN_PROPOSAL_FEEDBACK_MAX_LENGTH).toBe(
      REGENERATION_FEEDBACK_MAX_LENGTH,
    );
  });
});

describe("open memory suggestions before the review ends (owner, 19 Oct 2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });

  afterEach(cleanup);

  const open = [
    {
      id: "m1",
      proposalId: PROPOSAL_ID,
      memoryType: "constraint" as const,
      content: "Weekdays are short.",
    },
  ];

  it("asks once before finishing, and lets the owner go on", () => {
    renderReview({ memory: open });

    fireEvent.click(screen.getByRole("button", { name: COPY.finishAction }));
    const question = screen.getByRole("dialog", {
      name: COPY.memoryBeforeEndTitle,
    });
    expect(within(question).getByText("Weekdays are short.")).toBeVisible();
    expect(
      within(question).getByRole("button", {
        name: "Reject: Weekdays are short.",
      }),
    ).toBeVisible();

    fireEvent.click(
      within(question).getByRole("button", { name: COPY.discardCancel }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists them in the discard question too", () => {
    renderReview({ memory: open });

    fireEvent.click(screen.getByRole("button", { name: COPY.discardAction }));
    const question = screen.getByRole("dialog", {
      name: COPY.discardConfirmTitle,
    });
    expect(within(question).getByText("Weekdays are short.")).toBeVisible();
  });

  it("does not ask about one left open from an earlier proposal", () => {
    renderReview({ memory: [{ ...open[0], proposalId: "earlier" }] });

    fireEvent.click(screen.getByRole("button", { name: COPY.finishAction }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks about this proposal's goal suggestion too (ADR-034)", () => {
    renderReview({
      goals: [
        {
          id: "g1",
          proposalId: PROPOSAL_ID,
          title: "Run 5 km twice a week",
          desiredOutcome: "Two continuous 5 km runs a week.",
          sports: ["Running"],
          targetDate: "2027-01-10",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: COPY.finishAction }));
    const question = screen.getByRole("dialog", {
      name: COPY.memoryBeforeEndTitle,
    });
    expect(
      within(question).getByRole("button", {
        name: "Add as a core goal: Run 5 km twice a week",
      }),
    ).toHaveAttribute("value", "core");
    expect(
      within(question).getByRole("button", {
        name: "Add as a supporting goal: Run 5 km twice a week",
      }),
    ).toHaveAttribute("value", "supporting");
  });

  it("asks nothing when none is open", () => {
    renderReview();

    fireEvent.click(screen.getByRole("button", { name: COPY.finishAction }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("discarding a proposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });

  afterEach(cleanup);

  it("asks first, every time, and can be backed out of", () => {
    renderReview();

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: COPY.discardAction }));

    const question = screen.getByRole("dialog", {
      name: COPY.discardConfirmTitle,
    });
    // Nothing was chosen, and it still asks.
    expect(within(question).getByText(COPY.discardConfirm(0))).toBeVisible();
    expect(
      within(question).getByRole("button", {
        name: COPY.discardConfirmAction,
      }),
    ).toHaveAttribute("type", "submit");

    fireEvent.click(
      within(question).getByRole("button", { name: COPY.discardCancel }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

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

  it("submits the session's own activities, so saving an edit keeps them", () => {
    // The plan's edit replaces the stored list with the one submitted. Before
    // this, the editor here opened empty and every save sent `[]`.
    const { container } = renderReview({
      days: [
        day({
          planned: [
            planned({
              activities: [
                {
                  personalActivityId: "9c000000-0000-4000-8000-0000000000a1",
                  name: "Strides",
                  sport: "Running",
                  instructions: null,
                  measurementMode: "duration_intensity",
                  target: { duration_minutes: 20 },
                },
              ],
            }),
          ],
        }),
      ],
    });
    const form = container.querySelector(
      'form:has(input[value="edit"])',
    ) as HTMLFormElement;
    const submitted = JSON.parse(
      form.querySelector<HTMLInputElement>('input[name="activities"]')?.value ??
        "null",
    ) as unknown;

    expect(submitted).toEqual([
      {
        personalActivityId: "9c000000-0000-4000-8000-0000000000a1",
        name: "Strides",
        sport: "Running",
        instructions: null,
        measurementMode: "duration_intensity",
        target: { duration_minutes: 20 },
      },
    ]);
  });

  it("offers no lock, which was removed on 9 Oct 2026", () => {
    const { container } = renderReview();

    expect(container.querySelector('input[value="set_lock"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /lock/i })).toBeNull();
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
   * A day that has fallen behind owner-local today — a review left open across
   * midnight, or a generation that began the day before its own UTC date.
   * `changePlanAction` reads a `today..today+13` slice and refuses anything
   * outside it, so an Edit button there would fail with a message that
   * explains nothing.
   */
  it("withholds the controls on a day that has passed, and says why", () => {
    renderReview({ days: [day({ isPast: true })] });

    expect(
      screen.queryByRole("textbox", { name: "Title" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(PLAN_PROPOSAL_COPY.plannedPastDay),
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

  it("says nothing when the plan has not moved", () => {
    renderReview();

    expect(
      screen.queryByText(PLAN_PROPOSAL_COPY.planChangedNotice),
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
});

describe("the coach's note", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });
  afterEach(cleanup);

  it("shows the week description above the days", () => {
    renderReview();

    expect(
      screen.getByRole("region", { name: COPY.coachNoteLabel }),
    ).toHaveTextContent(WEEK_DESCRIPTION);
    expect(screen.queryByText(COPY.nothingAdded)).toBeNull();
  });

  it("says the coach added nothing when the proposal has no sessions", () => {
    renderReview({ nothingAdded: true });

    expect(screen.getByText(COPY.nothingAdded)).toBeVisible();
    expect(screen.getByText(WEEK_DESCRIPTION)).toBeVisible();
  });

  it("shows a safety note open, never folded away", () => {
    // Tom's test, 17 Oct 2026: the coach pointed to the physio and the page
    // never said so.
    const note =
      "Raise this change in symptoms at your physio appointment in five days.";
    renderReview({ safetyConsiderations: [note] });

    expect(screen.getByText(COPY.safetyHeading)).toBeVisible();
    expect(screen.getByText(note)).toBeVisible();
    expect(screen.getByText(note).closest("details")).toBeNull();
  });

  it("folds what the coach assumed and was unsure about under one summary", () => {
    renderReview({
      assumptions: ["The Sunday session is at home."],
      uncertainties: [
        {
          statement: "Wednesday's intervals are already planned.",
          whyItMatters: "They decide how much running fits.",
          whatToWatch: "How the knee answers afterwards.",
        },
      ],
    });

    const more = screen.getByText(COPY.coachMoreSummary).closest("details");
    expect(more).not.toBeNull();
    expect(more).toHaveTextContent("The Sunday session is at home.");
    expect(more).toHaveTextContent("How the knee answers afterwards.");
  });

  it("shows neither part when the coach wrote neither", () => {
    renderReview();

    expect(screen.queryByText(COPY.safetyHeading)).toBeNull();
    expect(screen.queryByText(COPY.coachMoreSummary)).toBeNull();
  });
});

describe("cancelling one of the owner's sessions from the review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
    );
  });
  afterEach(cleanup);

  const cancelForm = (container: HTMLElement) =>
    container
      .querySelector('input[name="operation"][value="cancel"]')
      ?.closest("form") ?? null;

  it("offers Cancel beside Edit, as a plan change outside the proposal", () => {
    const { container } = renderReview();

    expect(screen.getByText(COPY.cancelPlannedAction)).toBeVisible();
    const form = cancelForm(container);
    expect(form).not.toBeNull();
    expect(form?.querySelector('input[name="sessionId"]')).toHaveAttribute(
      "value",
      SESSION_ID,
    );
    expect(
      form?.querySelector('input[name="expectedRevision"]'),
    ).toHaveAttribute("value", "12");
    expect(screen.getByText(COPY.cancelPlannedConsequence)).toBeInTheDocument();
  });

  it("says only the day is cancelled for a repeating session", () => {
    renderReview({
      days: [day({ planned: [planned({ seriesId: "series-1" })] })],
    });

    expect(
      screen.getByText(COPY.cancelPlannedSeriesConsequence, { exact: false }),
    ).toBeInTheDocument();
  });

  it("offers nothing on a session already cancelled", () => {
    const { container } = renderReview({
      days: [day({ planned: [planned({ status: "cancelled" })] })],
    });

    expect(cancelForm(container)).toBeNull();
  });
});
