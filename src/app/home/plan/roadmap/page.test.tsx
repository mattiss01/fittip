import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
const {
  createRoadmapMock,
  createGoalMock,
  createProfileMock,
  createCompletionLogMock,
} = vi.hoisted(() => ({
  createRoadmapMock: vi.fn(),
  createGoalMock: vi.fn(),
  createProfileMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ refresh: vi.fn() }),
}));
// The controls are rendered here, not exercised. What each action does is
// covered by `actions.test.ts`; importing the real module would drag the whole
// write path - the coaching service included - into a jsdom render.
vi.mock("@/app/home/plan/roadmap/actions", () => ({
  generateRoadmapAction: vi.fn(),
  acceptRoadmapAction: vi.fn(),
  declineRoadmapAction: vi.fn(),
  editRoadmapAction: vi.fn(),
}));
vi.mock("@/server/repositories/roadmap-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/roadmap-repository")>();
  return { ...actual, createRoadmapRepository: createRoadmapMock };
});
vi.mock("@/server/repositories/goal-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/goal-repository")>();
  return { ...actual, createGoalRepository: createGoalMock };
});
vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});
vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});

import RoadmapPage from "./page";
import type { Completion } from "@/server/completions/completion-log";
import { GoalAuthenticationError } from "@/server/repositories/goal-repository";
import { RoadmapAuthenticationError } from "@/server/repositories/roadmap-repository";
import { ROADMAP_COPY } from "@/server/roadmap/roadmap-records";

const FIRST_PROPOSAL = "7e150000-0000-4000-8000-000000000010";
const EDIT_PROPOSAL = "7e150000-0000-4000-8000-000000000011";
const GOAL_ID = "7e150000-0000-4000-8000-000000000020";

const getHead = vi.fn();
const listVersions = vi.fn();
const getReviewProposals = vi.fn();
const countOpenMemoryCandidates = vi.fn();
const listGoals = vi.fn();
const listCompletions = vi.fn();

describe("Roadmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHead.mockResolvedValue({ revision: 0, currentVersionId: null });
    listVersions.mockResolvedValue([]);
    getReviewProposals.mockResolvedValue({
      open: null,
      declinedPredecessor: null,
      history: [],
    });
    countOpenMemoryCandidates.mockResolvedValue(0);
    listGoals.mockResolvedValue({ revision: 1, goals: [goal()] });
    listCompletions.mockResolvedValue([]);
    createRoadmapMock.mockResolvedValue({
      getHead,
      listVersions,
      getReviewProposals,
      countOpenMemoryCandidates,
    });
    createGoalMock.mockResolvedValue({ list: listGoals });
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi
        .fn()
        .mockResolvedValue({ timezoneName: "Europe/Berlin" }),
    });
    createCompletionLogMock.mockResolvedValue({ list: listCompletions });
  });

  afterEach(cleanup);

  it("renders the current roadmap, its phases and its review points", async () => {
    listVersions.mockResolvedValue([version(3)]);

    render(await RoadmapPage());

    expect(
      screen.getByRole("heading", { name: "Base and build." }),
    ).toBeTruthy();
    expect(screen.getByText("Version 3")).toBeTruthy();
    expect(screen.getByText(ROADMAP_COPY.reviewHeader)).toBeTruthy();

    const phase = screen.getByRole("heading", { name: "Aerobic base" });
    expect(phase).toBeTruthy();
    // "Aim for by", never "Due": the wording is the product decision in
    // ROADMAP_COPY, so the test asserts that string rather than a copy of it.
    expect(
      screen.getByText(`${ROADMAP_COPY.milestonePrefix} 2026-10-20`),
    ).toBeTruthy();
    expect(screen.getByText("Review on 2026-10-25")).toBeTruthy();
    // The goal is named from the goal read, not from the roadmap body.
    expect(screen.getByText(/primary · Finish a half marathon/)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: ROADMAP_COPY.assumptionsHeading }),
    ).toBeTruthy();
  });

  it("says so honestly when the owner has no roadmap and no proposal", async () => {
    render(await RoadmapPage());

    expect(
      screen.getByRole("heading", { name: "No roadmap yet." }),
    ).toBeTruthy();
    expect(screen.getByText("No roadmap yet")).toBeTruthy();
    expect(document.querySelector("[data-roadmap-proposals]")).toBeNull();
    expect(document.querySelector("[data-roadmap-superseded]")).toBeNull();
  });

  it("keeps every superseded version readable under the current one", async () => {
    listVersions.mockResolvedValue([version(2), version(1)]);

    render(await RoadmapPage());

    const superseded = document.querySelector(
      "[data-roadmap-superseded]",
    ) as HTMLElement;
    expect(within(superseded).getByText("Version 1")).toBeTruthy();
    expect(within(superseded).queryByText("Version 2")).toBeNull();
  });

  // M3-11 marked proposals built on deleted training records `expired`. The
  // state is the point of showing them: expired is neither missing nor still
  // waiting, and an owner cannot tell those apart from an absent record.
  it("shows an expired proposal with its state and nothing to act on", async () => {
    getReviewProposals.mockResolvedValue({
      open: null,
      declinedPredecessor: null,
      history: [proposal({ decision: "expired" })],
    });

    render(await RoadmapPage());

    const record = document.querySelector(
      `[data-roadmap-proposal="${FIRST_PROPOSAL}"]`,
    ) as HTMLElement;
    expect(record.getAttribute("data-roadmap-proposal-state")).toBe("expired");
    expect(within(record).getByText("Expired")).toBeTruthy();
    expect(within(record).getByText(ROADMAP_COPY.proposalExpired)).toBeTruthy();

    const proposals = document.querySelector(
      "[data-roadmap-proposals]",
    ) as HTMLElement;
    expect(within(proposals).queryAllByRole("button")).toHaveLength(0);
    expect(within(proposals).queryAllByRole("link")).toHaveLength(0);
    expect(proposals.querySelector("form")).toBeNull();
  });

  // The proposal is shown in full above the roadmap it would replace, because
  // accepting it is agreeing to all of it. Deciding from a title and a summary
  // would be deciding from less than what gets written.
  it("shows the open proposal in full with the three decisions", async () => {
    const open = proposal({ decision: null });
    getReviewProposals.mockResolvedValue({
      open,
      declinedPredecessor: null,
      history: [open],
    });

    render(await RoadmapPage());

    const review = document.querySelector(
      `[data-roadmap-open-proposal="${FIRST_PROPOSAL}"]`,
    ) as HTMLElement;
    expect(within(review).getByText("Awaiting your decision")).toBeTruthy();
    expect(within(review).getByText(ROADMAP_COPY.reviewHeader)).toBeTruthy();
    expect(
      within(review).getByRole("heading", { name: "Aerobic base" }),
    ).toBeTruthy();
    for (const action of [
      ROADMAP_COPY.acceptAction,
      ROADMAP_COPY.editAction,
      ROADMAP_COPY.declineAction,
    ]) {
      expect(
        within(review).getByRole("button", { name: action }),
        action,
      ).toBeTruthy();
    }
    // The accept form carries the head the owner actually read, so a head that
    // moved underneath them is refused by the database rather than overwritten.
    expect(
      review.querySelector('input[name="expectedHeadRevision"]'),
    ).toBeTruthy();
    // While a proposal is open there is nothing to compose: asking again is
    // what declining is for, and two open proposals for one horizon would make
    // "the open proposal" ambiguous.
    expect(document.querySelector("[data-roadmap-compose]")).toBeNull();
  });

  // The controls exist because the functions behind them exist again. None is
  // gated on an environment, and the surface still shows no control it cannot
  // honour.
  it("offers the compose form when nothing is waiting for a decision", async () => {
    render(await RoadmapPage());

    const compose = document.querySelector(
      "[data-roadmap-compose]",
    ) as HTMLElement;
    expect(compose.getAttribute("data-roadmap-compose")).toBe("initial");
    expect(
      within(compose).getByRole("button", {
        name: ROADMAP_COPY.generateAction,
      }),
    ).toBeTruthy();
    expect(
      within(compose).getByLabelText(ROADMAP_COPY.endDateLabel),
    ).toBeTruthy();
    expect(
      within(compose).queryByLabelText(ROADMAP_COPY.feedbackLabel),
    ).toBeNull();
  });

  // Decision 4: a regeneration needs a declined predecessor, the same dates,
  // and feedback. The form offers exactly that and nothing else.
  it("offers a regeneration against a declined predecessor", async () => {
    const declined = proposal({ decision: "rejected" });
    getReviewProposals.mockResolvedValue({
      open: null,
      declinedPredecessor: declined,
      history: [declined],
    });

    render(await RoadmapPage());

    const compose = document.querySelector(
      "[data-roadmap-compose]",
    ) as HTMLElement;
    expect(compose.getAttribute("data-roadmap-compose")).toBe("regeneration");
    expect(
      within(compose).getByLabelText(ROADMAP_COPY.feedbackLabel),
    ).toBeTruthy();
    expect(
      (
        compose.querySelector(
          'input[name="previousProposalId"]',
        ) as HTMLInputElement
      ).value,
    ).toBe(FIRST_PROPOSAL);
    // The horizon is the predecessor's and cannot be moved: the database
    // refuses a regeneration whose dates changed.
    const endDate = within(compose).getByLabelText(
      ROADMAP_COPY.endDateLabel,
    ) as HTMLInputElement;
    expect(endDate.readOnly).toBe(true);
    expect(endDate.value).toBe("2026-12-06");
  });

  // The ceiling is a fact about these dates, not a missing control.
  it("states the regeneration ceiling instead of offering a fourth round", async () => {
    const declined = {
      ...proposal({ decision: "rejected" }),
      regenerationNumber: 3,
    };
    getReviewProposals.mockResolvedValue({
      open: null,
      declinedPredecessor: declined,
      history: [declined],
    });

    render(await RoadmapPage());

    expect(screen.getByText(ROADMAP_COPY.regenerationCapReached)).toBeTruthy();
    expect(
      document.querySelector('[data-roadmap-compose="regeneration"]'),
    ).toBeNull();
    // A first request on different dates is still possible, so the compose form
    // stays.
    expect(
      document.querySelector('[data-roadmap-compose="initial"]'),
    ).toBeTruthy();
  });

  // An owner edit supersedes its source without deciding it. Only the
  // repository's `open` awaits a decision, so the screen must not label both.
  it("labels only the open proposal as awaiting a decision", async () => {
    const edit = {
      ...proposal({ decision: null }),
      id: EDIT_PROPOSAL,
      origin: "owner_edit" as const,
      sourceProposalId: FIRST_PROPOSAL,
    };
    getReviewProposals.mockResolvedValue({
      open: edit,
      declinedPredecessor: null,
      history: [edit, proposal({ decision: null })],
    });

    render(await RoadmapPage());

    const states = [
      ...document.querySelectorAll("[data-roadmap-proposal-state]"),
    ].map((record) => record.getAttribute("data-roadmap-proposal-state"));
    expect(states).toEqual(["open", "superseded"]);
    const proposals = document.querySelector(
      "[data-roadmap-proposals]",
    ) as HTMLElement;
    expect(
      within(proposals).getAllByText("Awaiting your decision"),
    ).toHaveLength(1);
    expect(screen.getByText(ROADMAP_COPY.proposalSuperseded)).toBeTruthy();
  });

  // The one mitigation the product owner chose over hiding the controls: a
  // fixture generation writes a canned roadmap into permanent history, so every
  // surface that shows one says where the words came from. The history entries
  // are covered as well as the proposal, because an accepted example is still
  // an example.
  it("labels every fixture-authored record an example, history included", async () => {
    listVersions.mockResolvedValue([version(2), version(1)]);
    const open = proposal({ decision: null });
    getReviewProposals.mockResolvedValue({
      open,
      declinedPredecessor: null,
      history: [open],
    });

    render(await RoadmapPage());

    for (const container of [
      "[data-roadmap-open-proposal]",
      "[data-roadmap-current]",
      "[data-roadmap-superseded]",
      "[data-roadmap-proposals]",
    ]) {
      expect(
        (document.querySelector(container) as HTMLElement).querySelector(
          "[data-roadmap-example]",
        ),
        container,
      ).toBeTruthy();
    }
    expect(screen.getByText(ROADMAP_COPY.exampleNotice)).toBeTruthy();
  });

  it("labels nothing an example when the coach wrote it", async () => {
    listVersions.mockResolvedValue([{ ...version(1), providerCode: "openai" }]);
    const open = { ...proposal({ decision: null }), providerCode: "openai" };
    getReviewProposals.mockResolvedValue({
      open,
      declinedPredecessor: null,
      history: [open],
    });

    render(await RoadmapPage());

    expect(document.querySelector("[data-roadmap-example]")).toBeNull();
    expect(screen.queryByText(ROADMAP_COPY.exampleNotice)).toBeNull();
  });

  it("states the server-owned safety copy when recent training reported one", async () => {
    listCompletions.mockResolvedValue([completion({ painReported: true })]);

    render(await RoadmapPage());

    expect(screen.getByText(ROADMAP_COPY.safetyNotice)).toBeTruthy();
  });

  it("states nothing about safety when no completion reported one", async () => {
    listCompletions.mockResolvedValue([completion({})]);

    render(await RoadmapPage());

    expect(screen.queryByText(ROADMAP_COPY.safetyNotice)).toBeNull();
  });

  it("bounds the completion read by the owner's own eight-week window", async () => {
    render(await RoadmapPage());

    expect(listCompletions).toHaveBeenCalledTimes(1);
    const [startDate, endDate] = listCompletions.mock.calls[0] as [
      string,
      string,
    ];
    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daysBetween(startDate, endDate)).toBe(55);
  });

  it("sends the owner to the memory surface that owns a candidate", async () => {
    countOpenMemoryCandidates.mockResolvedValue(2);

    render(await RoadmapPage());

    const panel = document.querySelector(
      "[data-roadmap-memory]",
    ) as HTMLElement;
    expect(
      within(panel).getByText(
        "2 items from a planning note are waiting for you. They are not used for coaching until you accept them.",
      ),
    ).toBeTruthy();
    expect(
      within(panel)
        .getByRole("link", { name: ROADMAP_COPY.memoryReviewLink })
        .getAttribute("href"),
    ).toBe("/home/you/memory");
  });

  it("redirects an expired session and a denied one before reading anything", async () => {
    listVersions.mockRejectedValueOnce(new RoadmapAuthenticationError());
    await expect(RoadmapPage()).rejects.toThrow("redirect:/");

    listGoals.mockRejectedValueOnce(
      new GoalAuthenticationError({ reason: "not-owner" } as never),
    );
    await expect(RoadmapPage()).rejects.toThrow("redirect:/auth/denied");
  });
});

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function goal() {
  return {
    id: GOAL_ID,
    title: "Finish a half marathon",
    priorityTier: "core" as const,
    targetDate: "2026-11-01",
    status: "active" as const,
    archivedAt: null,
  };
}

function roadmapContent() {
  return {
    schemaVersion: "fittip.roadmap.v2" as const,
    title: "Base and build.",
    summary: "Twelve weeks of aerobic work before any sharpening.",
    startDate: "2026-09-14",
    endDate: "2026-12-06",
    phases: [
      {
        title: "Aerobic base",
        focus: "Easy volume, one longer run a week.",
        startDate: "2026-09-14",
        endDate: "2026-10-26",
        goalAttention: [
          {
            goalId: GOAL_ID,
            level: "primary" as const,
            reason: "The half marathon is the only dated target in range.",
          },
        ],
        milestones: [
          {
            title: "Ninety minutes easy",
            observableCriterion:
              "One run of 90 minutes at conversational pace.",
            targetDate: "2026-10-20",
            goalIds: [GOAL_ID],
          },
        ],
      },
    ],
    assumptions: ["Four training days a week stay available."],
    uncertainties: [
      {
        statement: "The half marathon date is not confirmed.",
        whyItMatters: "The taper hangs off it.",
        whatToWatch: "Confirm the entry before the last phase.",
      },
    ],
    reviewPoints: [
      {
        title: "Check the base",
        triggerDate: "2026-10-25",
        question: "Is the long run still comfortable?",
      },
    ],
  };
}

function version(versionNumber: number) {
  return {
    id: `7e150000-0000-4000-8000-00000000003${versionNumber}`,
    versionNumber,
    content: roadmapContent(),
    acceptedAt: "2026-09-14T09:00:00.000Z",
    providerCode: "fixture",
  };
}

function proposal(overrides: { decision: "expired" | "rejected" | null }) {
  return {
    id: FIRST_PROPOSAL,
    origin: "ai_initial" as const,
    sourceProposalId: null,
    providerCode: "fixture",
    content: roadmapContent(),
    planningNote: null,
    regenerationFeedback: null,
    regenerationNumber: 0,
    startDate: "2026-09-14",
    endDate: "2026-12-06",
    createdAt: "2026-09-14T09:00:00.000Z",
    ...overrides,
  };
}

function completion(overrides: Partial<Completion>): Completion {
  return {
    id: "7e150000-0000-4000-8000-000000000040",
    planSessionId: null,
    status: "completed",
    actualLocalDate: new Date().toISOString().slice(0, 10),
    timezoneName: "Europe/Berlin",
    plannedSnapshot: null,
    title: null,
    sport: null,
    replacedBy: null,
    revision: 1,
    activities: [],
    updatedAt: "2026-09-14T09:00:00.000Z",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    ...overrides,
  };
}
