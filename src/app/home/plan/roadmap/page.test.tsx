import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
  writeRoadmapAction: vi.fn(),
  rewriteRoadmapAction: vi.fn(),
  deleteRoadmapAction: vi.fn(),
  askAgainRoadmapAction: vi.fn(),
  setMilestoneReachedAction: vi.fn(),
  setRoadmapReviewedAction: vi.fn(),
}));
vi.mock("@/server/repositories/roadmap-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/roadmap-repository")>();
  return { ...actual, createRoadmapRepository: createRoadmapMock };
});
vi.mock(
  "@/server/repositories/goal-suggestion-repository",
  async (original) => {
    const actual =
      await original<
        typeof import("@/server/repositories/goal-suggestion-repository")
      >();
    return {
      ...actual,
      createGoalSuggestions: async () => ({
        listOpen: async () => ({ goalRevision: 0, suggestions: [] }),
      }),
    };
  },
);
vi.mock("@/app/home/you/goals/suggestion-actions", () => ({
  decideGoalSuggestionAction: vi.fn(),
}));
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
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import type { Completion } from "@/server/completions/completion-log";
import { GoalAuthenticationError } from "@/server/repositories/goal-repository";
import { RoadmapAuthenticationError } from "@/server/repositories/roadmap-repository";
import {
  ROADMAP_COPY,
  ROADMAP_MAX_DAYS,
  ROADMAP_MIN_DAYS,
} from "@/server/roadmap/roadmap-records";

const FIRST_PROPOSAL = "7e150000-0000-4000-8000-000000000010";
const EDIT_PROPOSAL = "7e150000-0000-4000-8000-000000000011";
const GOAL_ID = "7e150000-0000-4000-8000-000000000020";

const getHead = vi.fn();
const listVersions = vi.fn();
const getReviewProposals = vi.fn();
const listOpenMemorySuggestions = vi.fn();
const listMilestoneMarks = vi.fn();
const getReviewedThrough = vi.fn();
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
    listOpenMemorySuggestions.mockResolvedValue({
      revision: 0,
      suggestions: [],
    });
    listMilestoneMarks.mockResolvedValue([]);
    getReviewedThrough.mockResolvedValue(null);
    listGoals.mockResolvedValue({ revision: 1, goals: [goal()] });
    listCompletions.mockResolvedValue([]);
    createRoadmapMock.mockResolvedValue({
      getHead,
      listVersions,
      getReviewProposals,
      listOpenMemorySuggestions,
      listMilestoneMarks,
      getReviewedThrough,
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

  it("renders the current roadmap, its phases and the review after each", async () => {
    listVersions.mockResolvedValue([version(3)]);

    render(await RoadmapPage());

    expect(
      screen.getByRole("heading", { name: "Base and build." }),
    ).toBeTruthy();
    // When it runs. No version number (owner, 13 Oct 2026), and no length
    // beside the dates (owner, 14 Oct 2026).
    const horizon = document.querySelector(
      "[data-roadmap-current] [data-roadmap-horizon]",
    ) as HTMLElement;
    expect(horizon).toHaveTextContent("14 Sept");
    expect(horizon).toHaveTextContent("6 Dec 2026");
    expect(horizon).not.toHaveTextContent("weeks");
    expect(screen.queryByText(/Version \d/)).toBeNull();

    const phase = screen.getByRole("heading", { name: "Aerobic base" });
    expect(phase).toBeTruthy();
    // "Aim for by", never "Due": the wording is the product decision in
    // ROADMAP_COPY, so the test asserts that string rather than a copy of it.
    expect(
      screen.getByText(`${ROADMAP_COPY.milestonePrefix} 20 Oct 2026`),
    ).toBeTruthy();
    // The app's own review, on the phase's last day (ADR-027). What the row
    // also holds from an earlier version is not shown.
    expect(
      screen.getByText(ROADMAP_COPY.reviewOnDate("26 Oct 2099")),
    ).toBeTruthy();
    expect(screen.queryByText("Is the long run still comfortable?")).toBeNull();
    expect(
      screen.queryByText("Four training days a week stay available."),
    ).toBeNull();
    // The goal is named from the goal read, not from the roadmap body.
    expect(screen.getByText("Finish a half marathon")).toBeTruthy();
    // Nothing has ended, so nothing asks to be reviewed.
    expect(getReviewedThrough).toHaveBeenCalledWith(version(3).id);
    expect(document.querySelector("[data-roadmap-review-due]")).toBeNull();
  });

  // ADR-027. A review is due from a phase's last day until it is marked.
  it("asks for a review above the roadmap once a phase has ended", async () => {
    listVersions.mockResolvedValue([endedVersion()]);

    render(await RoadmapPage());

    const due = document.querySelector(
      "[data-roadmap-review-due]",
    ) as HTMLElement;
    expect(due.getAttribute("data-roadmap-review-due")).toBe("0");
    expect(
      within(due).getByRole("heading", {
        name: ROADMAP_COPY.reviewDuePhase(1),
      }),
    ).toBeTruthy();
    expect(new FormData(due.querySelector("form")!).get("phaseIndex")).toBe(
      "0",
    );
    expect(
      within(due).getByRole("button", { name: ROADMAP_COPY.reviewedAction }),
    ).toBeTruthy();
    // Above the roadmap it is of.
    expect(
      due.compareDocumentPosition(
        document.querySelector("[data-roadmap-current]") as HTMLElement,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      [...document.querySelectorAll("[data-roadmap-review]")].map((entry) =>
        entry.getAttribute("data-roadmap-review"),
      ),
    ).toEqual(["due", "ahead"]);
  });

  it("asks for nothing once that phase is marked reviewed", async () => {
    listVersions.mockResolvedValue([endedVersion()]);
    getReviewedThrough.mockResolvedValue(0);

    render(await RoadmapPage());

    expect(document.querySelector("[data-roadmap-review-due]")).toBeNull();
    expect(
      [...document.querySelectorAll("[data-roadmap-review]")].map((entry) =>
        entry.getAttribute("data-roadmap-review"),
      ),
    ).toEqual(["done", "ahead"]);
  });

  it("says the roadmap has ended when its last phase has", async () => {
    const ended = endedVersion();
    ended.content.phases[1].endDate = "2020-12-31";
    listVersions.mockResolvedValue([ended]);
    getReviewedThrough.mockResolvedValue(0);

    render(await RoadmapPage());

    const due = document.querySelector(
      "[data-roadmap-review-due]",
    ) as HTMLElement;
    expect(due.getAttribute("data-roadmap-review-due")).toBe("1");
    expect(
      within(due).getByRole("heading", { name: ROADMAP_COPY.reviewDueRoadmap }),
    ).toBeTruthy();
  });

  it("starts with the coach's form when the owner has no roadmap and no proposal", async () => {
    render(await RoadmapPage());

    // No card saying so (owner, 14 Oct 2026): the form is the page.
    expect(screen.queryByText("No roadmap yet")).toBeNull();
    expect(document.querySelector("[data-roadmap-current]")).toBeNull();
    expect(
      document.querySelector('[data-roadmap-compose="initial"]'),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Roadmap" }),
    ).toBeTruthy();
  });

  // ADR-026. One answer, reached, on the roadmap in force. The fixture's
  // milestone was to be reached by 20 Oct 2026, which is long past.
  it("offers to mark a milestone of the roadmap in force, and never says missed", async () => {
    listVersions.mockResolvedValue([version(3)]);

    render(await RoadmapPage());

    expect(listMilestoneMarks).toHaveBeenCalledWith(version(3).id);
    const tick = document.querySelector(
      "[data-roadmap-current] [data-milestone-reached]",
    ) as HTMLFormElement;
    expect(tick.getAttribute("data-milestone-reached")).toBe("false");
    expect(
      within(tick).getByRole("button", {
        name: ROADMAP_COPY.milestoneReachLabel("Ninety minutes easy"),
      }),
    ).toBeTruthy();
    expect(new FormData(tick).get("versionId")).toBe(version(3).id);
    expect(new FormData(tick).get("reached")).toBe("true");
    expect(screen.queryByText(/missed|overdue|late|behind/i)).toBeNull();
    expect(screen.queryByText(/^Reached/)).toBeNull();
  });

  it("shows the day a milestone was marked reached, and the way to take it back", async () => {
    listVersions.mockResolvedValue([version(3)]);
    listMilestoneMarks.mockResolvedValue([
      { phaseIndex: 0, milestoneIndex: 0, reachedOn: "2026-10-18" },
    ]);

    render(await RoadmapPage());

    const tick = document.querySelector(
      "[data-milestone-reached]",
    ) as HTMLFormElement;
    expect(tick.getAttribute("data-milestone-reached")).toBe("true");
    expect(
      within(tick).getByText(ROADMAP_COPY.milestoneReached("18 Oct 2026")),
    ).toBeTruthy();
    expect(
      within(tick).getByRole("button", {
        name: ROADMAP_COPY.milestoneUndoLabel("Ninety minutes easy"),
      }),
    ).toBeTruthy();
    expect(new FormData(tick).get("reached")).toBe("false");
  });

  // A proposal is not the roadmap: nothing in it can be marked, and no marks
  // are read without a roadmap in force.
  it("offers no mark on a proposal, and reads none without a roadmap", async () => {
    const open = proposal({ decision: null });
    getReviewProposals.mockResolvedValue({
      open,
      declinedPredecessor: null,
      history: [open],
    });

    render(await RoadmapPage());

    expect(document.querySelector("[data-milestone-reached]")).toBeNull();
    expect(listMilestoneMarks).not.toHaveBeenCalled();
  });

  // Owner, 13 Oct 2026: the page is the roadmap in force. Earlier versions and
  // decided proposals stay stored and are not listed.
  it("lists no earlier version and no decided proposal", async () => {
    listVersions.mockResolvedValue([version(2), version(1)]);
    getReviewProposals.mockResolvedValue({
      open: null,
      declinedPredecessor: null,
      history: [proposal({ decision: "expired" })],
    });

    render(await RoadmapPage());

    expect(document.querySelector('[data-roadmap-version="2"]')).toBeTruthy();
    expect(screen.queryByText(/Version 1/)).toBeNull();
    expect(document.querySelector("[data-roadmap-superseded]")).toBeNull();
    expect(document.querySelector("[data-roadmap-proposals]")).toBeNull();
    expect(document.querySelector("[data-roadmap-proposal]")).toBeNull();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  // With a roadmap the page starts with it. What can be done with it is ⋯
  // beside its title (owner, 19 Oct 2026); a new one first asks who writes
  // it. Each form is in the sheet.
  const openActions = () => {
    const more = screen.getByRole("button", {
      name: ROADMAP_COPY.actionsLabel,
    });
    fireEvent.click(more);
    return document.getElementById(
      more.getAttribute("aria-controls") as string,
    ) as HTMLElement;
  };
  const openChoice = (choice: "change" | "fresh" | "write") => {
    openActions();
    if (choice === "change") {
      fireEvent.click(
        screen.getByRole("button", {
          name: ROADMAP_COPY.changeWithCoachAction,
        }),
      );
      return;
    }
    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_COPY.createRoadmapAction }),
    );
    const menu = screen.getByRole("dialog", {
      name: ROADMAP_COPY.createRoadmapAction,
    });
    fireEvent.click(
      menu.querySelector(`[data-roadmap-choice="${choice}"]`) as HTMLElement,
    );
  };

  it("starts with the roadmap, its actions beside its title", async () => {
    listVersions.mockResolvedValue([version(1)]);

    render(await RoadmapPage());

    expect(document.querySelector("[data-roadmap-compose]")).toBeNull();

    expect(
      within(openActions())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      ROADMAP_COPY.rewriteAction,
      ROADMAP_COPY.changeWithCoachAction,
      ROADMAP_COPY.createRoadmapAction,
      ROADMAP_COPY.deleteAction,
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_COPY.createRoadmapAction }),
    );
    const menu = screen.getByRole("dialog", {
      name: ROADMAP_COPY.createRoadmapAction,
    });
    expect(
      [...menu.querySelectorAll("[data-roadmap-choice]")].map(
        (choice) => choice.querySelector("strong")?.textContent,
      ),
    ).toEqual([ROADMAP_COPY.newWithCoachAction, ROADMAP_COPY.writeAction]);
    // Nothing is asked for until a way is chosen.
    expect(document.querySelector("[data-roadmap-compose]")).toBeNull();
    expect(document.querySelector("[data-roadmap-write]")).toBeNull();
  });

  // ADR-036: deleting asks first, in the middle of the screen, and answers to
  // the head this page read.
  it("asks before deleting the roadmap, against the head it read", async () => {
    getHead.mockResolvedValue({ revision: 3, currentVersionId: "v" });
    listVersions.mockResolvedValue([version(1)]);

    render(await RoadmapPage());
    openActions();
    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_COPY.deleteAction }),
    );

    const question = screen.getByRole("dialog", {
      name: ROADMAP_COPY.deleteTitle,
    });
    expect(within(question).getByText(ROADMAP_COPY.deleteDetail)).toBeTruthy();
    expect(
      (
        question.querySelector(
          'input[name="expectedHeadRevision"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("3");
    fireEvent.click(
      within(question).getByRole("button", { name: ROADMAP_COPY.deleteKeep }),
    );
    expect(
      screen.queryByRole("dialog", { name: ROADMAP_COPY.deleteTitle }),
    ).toBeNull();
  });

  // Owner, 19 Oct 2026: a roadmap whose last day has passed says so, and
  // offers a new one above it and below it; there is nothing left to edit.
  it("offers a new roadmap above and below one that has ended", async () => {
    const ended = version(1);
    ended.content.endDate = shiftIsoDate(today(), -1);
    ended.content.phases = ended.content.phases.map((phase) => ({
      ...phase,
      endDate: shiftIsoDate(today(), -1),
    }));
    listVersions.mockResolvedValue([ended]);

    render(await RoadmapPage());

    const notice = document.querySelector(
      "[data-roadmap-ended]",
    ) as HTMLElement;
    expect(
      within(notice).getByText(ROADMAP_COPY.reviewDueRoadmap),
    ).toBeTruthy();
    // It stands in for the review the ending was.
    expect(document.querySelector("[data-roadmap-review-due]")).toBeNull();
    expect(document.querySelectorAll("[data-roadmap-create]")).toHaveLength(2);

    expect(
      within(openActions())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([ROADMAP_COPY.createRoadmapAction, ROADMAP_COPY.deleteAction]);

    fireEvent.click(
      within(notice).getByRole("button", {
        name: ROADMAP_COPY.createRoadmapAction,
      }),
    );
    const menu = screen.getByRole("dialog", {
      name: ROADMAP_COPY.createRoadmapAction,
    });
    expect(menu.querySelectorAll("[data-roadmap-choice]")).toHaveLength(2);
  });

  // ADR-029: writing it yourself is a roadmap of the owner's own, empty to
  // start, saved against the head this page read.
  it("writes a roadmap by hand from Create a new roadmap", async () => {
    getHead.mockResolvedValue({ revision: 3, currentVersionId: "v" });
    listVersions.mockResolvedValue([version(3)]);

    render(await RoadmapPage());
    openChoice("write");

    const sheet = screen.getByRole("dialog", {
      name: ROADMAP_COPY.writeTitle,
    });
    expect(
      (
        sheet.querySelector(
          'input[name="expectedHeadRevision"]',
        ) as HTMLInputElement | null
      )?.value,
    ).toBe("3");
    const content = JSON.parse(
      (sheet.querySelector('input[name="content"]') as HTMLInputElement).value,
    );
    expect(content).toMatchObject({ title: "", endDate: "", phases: [{}] });
    expect(content.phases[0].goalAttention).toEqual([]);
    expect(
      within(sheet).getByText(ROADMAP_COPY.writeSupportReplaces),
    ).toBeTruthy();
  });

  it("offers to write one by hand while there is no roadmap", async () => {
    render(await RoadmapPage());

    // The coach's form is on the page, and writing is beside it.
    expect(document.querySelector("[data-roadmap-compose]")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_COPY.writeAction }),
    );
    const sheet = screen.getByRole("dialog", {
      name: ROADMAP_COPY.writeTitle,
    });
    expect(within(sheet).getByText(ROADMAP_COPY.writeSupport)).toBeTruthy();
  });

  it("does not offer writing while a proposal awaits a decision", async () => {
    getReviewProposals.mockResolvedValue({
      open: proposal({ decision: null }),
      declinedPredecessor: null,
      history: [],
    });

    render(await RoadmapPage());

    expect(
      screen.queryByRole("button", { name: ROADMAP_COPY.writeAction }),
    ).toBeNull();
  });

  it("asks the coach for a new roadmap from Create a new roadmap", async () => {
    listVersions.mockResolvedValue([version(1)]);

    render(await RoadmapPage());
    openChoice("fresh");

    const sheet = screen.getByRole("dialog", {
      name: ROADMAP_COPY.composeTitle,
    });
    expect(
      sheet
        .querySelector("[data-roadmap-compose]")
        ?.getAttribute("data-roadmap-compose"),
    ).toBe("initial");
    expect(
      within(sheet).getByRole("button", { name: ROADMAP_COPY.generateAction }),
    ).toBeTruthy();
    expect(sheet.querySelector('input[name="changeRoadmap"]')).toBeNull();
    // And the way back to the choice.
    fireEvent.click(within(sheet).getByRole("button", { name: "‹ Back" }));
    expect(
      screen.getByRole("dialog", { name: ROADMAP_COPY.createRoadmapAction }),
    ).toBeTruthy();
  });

  // ADR-028. The form says it is a change, asks what should change, and says
  // what the coach is sent; it names no roadmap, which the server reads.
  it("asks for the roadmap to be changed, from today to the day it ends", async () => {
    const current = version(1);
    current.content.endDate = shiftIsoDate(today(), 70);
    listVersions.mockResolvedValue([current]);

    render(await RoadmapPage());
    openChoice("change");

    const sheet = screen.getByRole("dialog", {
      name: ROADMAP_COPY.changeTitle,
    });
    const form = sheet.querySelector("form") as HTMLFormElement;
    expect(
      sheet
        .querySelector("[data-roadmap-compose]")
        ?.getAttribute("data-roadmap-compose"),
    ).toBe("change");
    expect(new FormData(form).get("changeRoadmap")).toBe("true");
    expect(
      [...new FormData(form).keys()].filter((key) =>
        /version|roadmapId/i.test(key),
      ),
    ).toEqual([]);
    expect(
      within(sheet).getByLabelText(ROADMAP_COPY.changeNoteLabel),
    ).toBeRequired();
    expect(within(sheet).getByText(ROADMAP_COPY.changeSupport)).toBeTruthy();
    expect(
      within(sheet).getByRole("button", { name: ROADMAP_COPY.changeConfirm }),
    ).toBeTruthy();

    const start = within(sheet).getByLabelText<HTMLInputElement>(
      ROADMAP_COPY.startDateLabel,
    );
    const end = within(sheet).getByLabelText<HTMLInputElement>(
      ROADMAP_COPY.endDateLabel,
    );
    expect(start.value).toBe(today());
    expect(end.value).toBe(current.content.endDate);
    // Both are the owner's to pick.
    expect(start.readOnly).toBe(false);
    expect(end.readOnly).toBe(false);
  });

  it("opens the change form on the usual end when the roadmap is nearly over", async () => {
    const current = version(1);
    current.content.endDate = shiftIsoDate(today(), 10);
    listVersions.mockResolvedValue([current]);

    render(await RoadmapPage());
    openChoice("change");

    const end = within(
      screen.getByRole("dialog", { name: ROADMAP_COPY.changeTitle }),
    ).getByLabelText<HTMLInputElement>(ROADMAP_COPY.endDateLabel);
    expect(end.value >= shiftIsoDate(today(), ROADMAP_MIN_DAYS)).toBe(true);
  });

  // Owner, 14 Oct 2026: a declined proposal is gone from the page, so the
  // sheet's second choice is a new roadmap, not another answer to it.
  it("offers a new roadmap in the sheet after a decline", async () => {
    listVersions.mockResolvedValue([version(1)]);
    const declined = proposal({ decision: "rejected" });
    getReviewProposals.mockResolvedValue({
      open: null,
      declinedPredecessor: declined,
      history: [declined],
    });

    render(await RoadmapPage());
    openChoice("fresh");

    const sheet = screen.getByRole("dialog", {
      name: ROADMAP_COPY.composeTitle,
    });
    expect(
      sheet
        .querySelector("[data-roadmap-compose]")
        ?.getAttribute("data-roadmap-compose"),
    ).toBe("initial");
  });

  // Decide, then ask again: nothing offers a second proposal beside an open one.
  it("offers no way to change the roadmap while a proposal awaits a decision", async () => {
    listVersions.mockResolvedValue([endedVersion()]);
    const open = proposal({ decision: null });
    getReviewProposals.mockResolvedValue({
      open,
      declinedPredecessor: null,
      history: [open],
    });

    render(await RoadmapPage());

    expect(
      screen.queryByRole("button", { name: ROADMAP_COPY.actionsLabel }),
    ).toBeNull();
    // The review is still due and can be marked; it leads nowhere else yet.
    const due = document.querySelector(
      "[data-roadmap-review-due]",
    ) as HTMLElement;
    expect(
      within(due).getByRole("button", { name: ROADMAP_COPY.reviewedAction }),
    ).toBeTruthy();
    expect(due.querySelector("[data-roadmap-change]")).toBeNull();
  });

  it("offers Edit with Coach from a due review, straight to its form", async () => {
    listVersions.mockResolvedValue([endedVersion()]);

    render(await RoadmapPage());

    const due = document.querySelector(
      "[data-roadmap-review-due]",
    ) as HTMLElement;
    fireEvent.click(
      within(due).getByRole("button", {
        name: ROADMAP_COPY.changeWithCoachAction,
      }),
    );

    const sheet = screen.getByRole("dialog", {
      name: ROADMAP_COPY.changeTitle,
    });
    expect(
      new FormData(sheet.querySelector("form") as HTMLFormElement).get(
        "changeRoadmap",
      ),
    ).toBe("true");
    // It did not come by way of the choice, so there is none to go back to.
    expect(within(sheet).queryByRole("button", { name: "‹ Back" })).toBeNull();
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
      within(compose).queryByLabelText(/What should the coach change/),
    ).toBeNull();
  });

  // The end is counted from the start: four to fifty-two weeks after it.
  it("moves the end with a start that leaves it too near, and keeps a half-typed start out of it", async () => {
    render(await RoadmapPage());

    const start = screen.getByLabelText<HTMLInputElement>(
      ROADMAP_COPY.startDateLabel,
    );
    const end = screen.getByLabelText<HTMLInputElement>(
      ROADMAP_COPY.endDateLabel,
    );
    const today = start.min;
    const nearest = shiftIsoDate(today, ROADMAP_MIN_DAYS);
    expect(end.min).toBe(nearest);
    fireEvent.change(end, { target: { value: nearest } });

    // On the way to a year, the field passes through ones like 0002.
    fireEvent.change(start, { target: { value: "0002-10-20" } });
    expect(end.value).toBe(nearest);
    expect(end.min).toBe(nearest);

    const later = shiftIsoDate(today, 10);
    fireEvent.change(start, { target: { value: later } });
    expect(end.value).toBe(shiftIsoDate(later, ROADMAP_MIN_DAYS));
    expect(end.min).toBe(shiftIsoDate(later, ROADMAP_MIN_DAYS));
    expect(end.max).toBe(shiftIsoDate(later, ROADMAP_MAX_DAYS));
  });

  // Decision 4: a regeneration needs a declined predecessor, the same dates,
  // and feedback. The form offers exactly that and nothing else.
  it("asks afresh after a decline, with nothing carried from the declined one", async () => {
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
    expect(compose.getAttribute("data-roadmap-compose")).toBe("initial");
    expect(
      compose.querySelector('input[name="previousProposalId"]'),
    ).toBeNull();
    expect(
      within(compose).queryByLabelText(/What should the coach change/),
    ).toBeNull();
  });

  // "Ask for another" is on the proposal, where it can be read (owner).
  it("offers Ask for another on the open proposal", async () => {
    const open = proposal({ decision: null });
    getReviewProposals.mockResolvedValue({
      open,
      declinedPredecessor: null,
      history: [open],
    });

    render(await RoadmapPage());

    fireEvent.click(
      screen.getByRole("button", { name: ROADMAP_COPY.askAgainAction }),
    );
    expect(screen.getByLabelText(ROADMAP_COPY.askAgainLabel)).toBeTruthy();
  });

  // The ceiling is a fact about these dates, not a missing control.
  it("offers no fourth ask on a proposal that is the third", async () => {
    const open = { ...proposal({ decision: null }), regenerationNumber: 3 };
    getReviewProposals.mockResolvedValue({
      open,
      declinedPredecessor: null,
      history: [open],
    });

    render(await RoadmapPage());

    expect(
      screen.getByRole("button", { name: ROADMAP_COPY.acceptAction }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: ROADMAP_COPY.askAgainAction }),
    ).toBeNull();
    // Said, not just gone.
    expect(screen.getByText(ROADMAP_COPY.outcomes.askAgainUsedUp)).toBeTruthy();
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

    expect(
      document.querySelector(`[data-roadmap-open-proposal="${EDIT_PROPOSAL}"]`),
    ).toBeTruthy();
    expect(screen.getAllByText("Awaiting your decision")).toHaveLength(1);
  });

  // The one mitigation the product owner chose over hiding the controls: a
  // fixture generation writes a canned roadmap into permanent history, so every
  // surface that shows one says where the words came from. The history entries
  // are covered as well as the proposal, because an accepted example is still
  // an example.
  it("labels every fixture-authored record an example, accepted included", async () => {
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

  it("lists each open suggestion with Accept and Reject, and links to Memory (owner, 19 Oct 2026)", async () => {
    listOpenMemorySuggestions.mockResolvedValue({
      revision: 4,
      suggestions: [
        { id: "m1", memoryType: "constraint", content: "Weekdays are short." },
        { id: "m2", memoryType: "preference", content: "Prefers mornings." },
      ],
    });

    render(await RoadmapPage());

    const panel = document.querySelector(
      "[data-roadmap-memory]",
    ) as HTMLElement;
    expect(within(panel).getByText("Weekdays are short.")).toBeTruthy();
    expect(
      within(panel).getByRole("button", {
        name: "Accept: Prefers mornings.",
      }),
    ).toHaveAttribute("value", "accept");
    expect(
      within(panel).getByRole("button", {
        name: "Reject: Weekdays are short.",
      }),
    ).toHaveAttribute("value", "reject");
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

/** Today as the page works it out for the mocked profile's time zone. */
function today(): string {
  return isoDateInTimezone(new Date(), "Europe/Berlin");
}

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
        // Far ahead on purpose: a test that does not mean to have a review
        // due must not grow one as the calendar moves.
        endDate: "2099-10-26",
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

/** A roadmap in two phases, the first of which ended years ago. */
function endedVersion() {
  const base = version(1);
  const [phase] = base.content.phases;
  return {
    ...base,
    content: {
      ...base.content,
      phases: [
        { ...phase, startDate: "2020-01-01", endDate: "2020-06-30" },
        {
          ...phase,
          title: "Sharpen",
          startDate: "2020-07-01",
          endDate: "2099-12-31",
          milestones: [],
        },
      ],
    },
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
    replaces: [],
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
