import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));

vi.mock("@/app/home/plan/roadmap/actions", () => ({
  generateRoadmapAction: vi.fn(),
  acceptRoadmapAction: vi.fn(),
  declineRoadmapAction: vi.fn(),
  editRoadmapAction: vi.fn(),
}));

import { editRoadmapAction } from "@/app/home/plan/roadmap/actions";
import { INITIAL_ROADMAP_ACTION_STATE } from "@/app/home/plan/roadmap/action-state";
import type { RoadmapActionState } from "@/app/home/plan/roadmap/action-state";
import { RoadmapManager, type RoadmapManagerState } from "./roadmap-manager";

import {
  RECOVERY_NOTICE_MS,
  RENDER_GRACE_MS,
  WATCH_INTERVAL_MS,
} from "@/features/goals/mutation-watchdog";

const PROPOSAL_ID = "00000000-0000-4000-8000-000000000010";
const DECLINED_ID = "00000000-0000-4000-8000-000000000011";
const RECOVERY_FLAG = "fittip.roadmap.recovered:v1";
const PAGE_ORIGIN = "http://localhost";
const PAGE_PATH = "/home/plan/roadmap";

let clock = 0;
let reload: ReturnType<typeof vi.fn>;
let realLocation: Location | null = null;
let realPerformanceObserver: typeof globalThis.PerformanceObserver | undefined;
let observerStubbed = false;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  if (realLocation) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    realLocation = null;
  }
  if (observerStubbed) {
    if (realPerformanceObserver === undefined) {
      delete (globalThis as { PerformanceObserver?: unknown })
        .PerformanceObserver;
    } else {
      globalThis.PerformanceObserver = realPerformanceObserver;
    }
    observerStubbed = false;
  }
});

beforeEach(() => {
  useActionStateMock.mockReturnValue([
    INITIAL_ROADMAP_ACTION_STATE,
    vi.fn(),
    false,
  ]);
});

describe("RoadmapManager", () => {
  // The defect this replaces left the owner on the compose form with their own
  // proposal already generated and invisible below it.
  it("advances from compose to the proposal review once a generation returns", () => {
    const { rerender } = render(<RoadmapManager {...props(emptyState())} />);

    fireEvent.click(screen.getByRole("button", { name: "Create roadmap" }));
    expect(
      screen.getByRole("heading", { name: "Shape your roadmap" }),
    ).toBeVisible();

    // The server action returned a proposal, and the revalidated page carries
    // it. Both arrive in the same commit.
    setActionState({
      status: "proposal",
      message: "",
      submission: 1,
      proposalId: PROPOSAL_ID,
      memoryCandidateCount: 1,
    });
    rerender(<RoadmapManager {...props(reviewingState())} />);

    expect(screen.getByText("Direction, not a promise.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Accept roadmap" }),
    ).toBeVisible();
    // Decision 3's three sections under the spine, in the approved words.
    expect(screen.getByText("What this assumes")).toBeVisible();
    expect(screen.getByText("When to reassess")).toBeVisible();
    expect(screen.getByText("Review on 2026-09-20")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Shape your roadmap" }),
    ).toBeNull();

    // The review's own actions still work with that result on screen: the
    // editor opens rather than being overridden back to the review.
    fireEvent.click(screen.getByRole("button", { name: "Edit proposal" }));
    expect(
      screen.getByRole("heading", { name: "Edit proposal" }),
    ).toBeVisible();
  });

  it("reopens compose after a generation instead of showing the review again", () => {
    setActionState({
      status: "proposal",
      message: "",
      submission: 1,
      proposalId: PROPOSAL_ID,
    });
    render(<RoadmapManager {...props(declinedState())} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Regenerate proposal" }),
    );

    expect(
      screen.getByRole("heading", { name: "Shape your roadmap" }),
    ).toBeVisible();
  });

  it("stays on compose while the request is still running", () => {
    const { rerender } = render(<RoadmapManager {...props(emptyState())} />);

    fireEvent.click(screen.getByRole("button", { name: "Create roadmap" }));
    setActionState({ ...INITIAL_ROADMAP_ACTION_STATE }, true);
    rerender(<RoadmapManager {...props(emptyState())} />);

    expect(
      screen.getByText(
        "Building your roadmap proposal... Your current roadmap stays unchanged.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Generate roadmap proposal" }),
    ).toBeDisabled();
  });

  // The regeneration defect: declining is what makes a regeneration possible
  // and is also what removes the proposal from the screen, so the predecessor
  // has to come from the server or it is lost exactly when it is needed.
  it("sends the declined predecessor with a regeneration", () => {
    const { container } = render(
      <RoadmapManager {...props(declinedState())} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Regenerate proposal" }),
    );

    expect(
      container.querySelector('input[name="previousProposalId"]'),
    ).toHaveValue(DECLINED_ID);
    // Decision 4: same horizon, prefilled but editable note, empty feedback.
    expect(screen.getByLabelText(/Roadmap ends/)).toHaveValue("2026-11-02");
    expect(screen.getByLabelText(/Roadmap ends/)).toHaveAttribute("readonly");
    expect(
      screen.getByLabelText(/Anything the coach should account for/),
    ).toHaveValue("Only 45 minutes on weekdays.");
    expect(screen.getByLabelText(/What should the coach change/)).toHaveValue(
      "",
    );
    expect(
      screen.getByText(
        "The previous proposal will be shared with the coach. Nothing changes until you accept.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Generate another proposal" }),
    ).toBeVisible();
  });

  it("keeps a cleared planning note cleared on a regeneration", () => {
    render(<RoadmapManager {...props(declinedState())} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Regenerate proposal" }),
    );
    const note = screen.getByLabelText(/Anything the coach should account for/);
    fireEvent.change(note, { target: { value: "" } });

    expect(note).toHaveValue("");
  });

  it("offers no regeneration without a declined predecessor", () => {
    render(<RoadmapManager {...props(emptyState())} />);

    expect(
      screen.queryByRole("button", { name: "Regenerate proposal" }),
    ).toBeNull();
    expect(screen.getByText(/You have no roadmap\./)).toBeVisible();
  });

  it("ends the chain at the third regeneration instead of offering a fourth", () => {
    render(
      <RoadmapManager
        {...props({ ...declinedState(), regenerationsRemaining: 0 })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Regenerate proposal" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "You have used all three regenerations for these dates. Edit the proposal directly, or change the dates to start a fresh request.",
      ),
    ).toBeVisible();
  });

  it("confirms a decline in the approved words before deciding anything", () => {
    render(<RoadmapManager {...props(reviewingState())} />);

    fireEvent.click(screen.getByRole("button", { name: "Decline proposal" }));

    expect(
      screen.getByText(
        "Decline this proposal? It will stay in your roadmap history and will not become current.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Keep reviewing" }),
    ).toBeVisible();
  });

  // M2-05's lost-render defect reproduces here: three of six local compose
  // runs left the pending form on screen with the server's answer already
  // delivered, and a reload showed the proposal every time.
  it("reloads when a reply arrives and never reaches the screen", () => {
    useControlledClock();
    stubLocation();
    stubPerformanceObserver([
      { name: `${PAGE_ORIGIN}${PAGE_PATH}`, responseEnd: 1_010 },
    ]);
    setActionState({ ...INITIAL_ROADMAP_ACTION_STATE }, true);
    render(<RoadmapManager {...props(emptyState())} />);

    advance(RENDER_GRACE_MS + WATCH_INTERVAL_MS + 100);

    const notice = screen.getAllByRole("status")[0];
    expect(notice).toHaveTextContent(
      "This roadmap step did not appear. Reloading to show what is saved.",
    );
    // Says only what is observable: a reply came back and never rendered.
    // Whether it accepted, conflicted or failed is not knowable from here.
    expect(notice).not.toHaveTextContent("Roadmap accepted");
    expect(reload).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RECOVERY_FLAG)).toBe("1");

    advance(RECOVERY_NOTICE_MS + 100);
    expect(reload).toHaveBeenCalled();
  });

  it("waits rather than declaring an unanswered generation lost", () => {
    useControlledClock();
    stubLocation();
    stubPerformanceObserver([]);
    const { rerender } = render(<RoadmapManager {...props(emptyState())} />);
    fireEvent.click(screen.getByRole("button", { name: "Create roadmap" }));
    setActionState({ ...INITIAL_ROADMAP_ACTION_STATE }, true);
    rerender(<RoadmapManager {...props(emptyState())} />);

    // Far past a form save's budget. A provider call has no such deadline.
    advance(30_000);

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      "Building your roadmap proposal",
    );
  });

  it("explains the reload it triggered, until the next step", () => {
    window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    render(<RoadmapManager {...props(emptyState())} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your last roadmap step did not appear, so this page was reloaded. What you see below is what is saved.",
    );

    cleanup();
    // A surface that has already handled a step is not a reloaded one.
    setActionState({
      status: "declined",
      message: "",
      submission: 5,
      proposalId: PROPOSAL_ID,
    });
    render(<RoadmapManager {...props(emptyState())} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // An edit creates a new proposal, so the review under the editor is stale
  // the moment it closes. Continuous integration caught the revalidated tree
  // not arriving with the editor's own transition.
  it("re-reads the surface after an edit creates a new proposal", async () => {
    vi.mocked(editRoadmapAction).mockResolvedValue({
      status: "edited",
      message: "",
      submission: 2,
      proposalId: "00000000-0000-4000-8000-000000000012",
    });
    render(<RoadmapManager {...props(reviewingState())} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit proposal" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save as a new proposal" }),
    );

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("reloads when an edit's new proposal never reaches the surface", async () => {
    stubLocation();
    vi.mocked(editRoadmapAction).mockResolvedValue({
      status: "edited",
      message: "",
      submission: 3,
      proposalId: "00000000-0000-4000-8000-000000000013",
    });
    // The surface still shows the proposal the edit came from.
    render(<RoadmapManager {...props(reviewingState())} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit proposal" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save as a new proposal" }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole("status")[0]).toHaveTextContent(
        "This roadmap step did not appear. Reloading to show what is saved.",
      ),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 3_000 });
  });

  it("shows no confidence score, percentage or certainty badge", () => {
    const { container } = render(
      <RoadmapManager {...props(reviewingState())} />,
    );

    expect(container.textContent).not.toMatch(/%/);
    expect(container.textContent).not.toMatch(/confidence/i);
  });
});

function setActionState(state: RoadmapActionState, pending = false) {
  useActionStateMock.mockReturnValue([state, vi.fn(), pending]);
}

/** The watchdog reads the monotonic clock, so the fake timers are paired with
 *  an explicit `performance.now`. Nothing here depends on elapsed real time. */
function useControlledClock(startAt = 1_000) {
  clock = startAt;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
}

function advance(ms: number) {
  const step = 50;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    clock += step;
    act(() => {
      vi.advanceTimersByTime(step);
    });
  }
}

function stubLocation() {
  realLocation = window.location;
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: PAGE_ORIGIN,
      pathname: PAGE_PATH,
      search: "",
      href: `${PAGE_ORIGIN}${PAGE_PATH}`,
      reload,
    },
  });
}

/** Reports the given resource entries as soon as the surface observes. */
function stubPerformanceObserver(
  entries: { name: string; responseEnd: number }[],
) {
  realPerformanceObserver = globalThis.PerformanceObserver;
  observerStubbed = true;
  globalThis.PerformanceObserver = class {
    constructor(
      private readonly report: (list: { getEntries: () => unknown[] }) => void,
    ) {}
    observe() {
      this.report({ getEntries: () => entries });
    }
    disconnect() {}
  } as unknown as typeof globalThis.PerformanceObserver;
}

function props(state: RoadmapManagerState) {
  return {
    state,
    minDate: "2026-09-07",
    maxDate: "2027-08-10",
    currentSpine: <div>current spine</div>,
    proposalSpine: <div>proposal spine</div>,
  };
}

function emptyState(): RoadmapManagerState {
  return {
    today: "2026-08-10",
    headRevision: 0,
    defaultEndDate: "2026-11-02",
    hasSafetySignal: false,
    regenerationsRemaining: 3,
    openMemoryCandidateCount: 0,
    goalSummary: { core: 1, supporting: 0 },
    memoryCount: 2,
    trainingSummary: { sessionsIncluded: 4, windowStartDate: "2026-06-16" },
    goalsOutsideHorizon: [],
    currentVersionNumber: null,
    currentTitle: null,
    historyCount: 0,
    proposal: null,
    regeneration: null,
  };
}

function reviewingState(): RoadmapManagerState {
  return {
    ...emptyState(),
    proposal: {
      id: PROPOSAL_ID,
      title: "Toward the hilly half",
      summary: "Twelve weeks of steady building, then sharpening.",
      startDate: "2026-08-10",
      endDate: "2026-11-02",
      planningNote: "Only 45 minutes on weekdays.",
      regenerationNumber: 0,
      assumptions: ["Weekday sessions stay under 45 minutes."],
      uncertainties: [],
      safetyConsiderations: [],
      reviewPoints: [
        {
          title: "End of the first phase",
          triggerDate: "2026-09-20",
          triggerCondition: null,
          question: "Is this workload still the right size for you?",
        },
      ],
      content: {
        title: "Toward the hilly half",
        summary: "Twelve weeks of steady building, then sharpening.",
        startDate: "2026-08-10",
        endDate: "2026-11-02",
        phases: [
          {
            title: "Build the base",
            focus: "Steady, repeatable weeks.",
            startDate: "2026-08-10",
            endDate: "2026-09-20",
            goalAttention: [],
            milestones: [],
          },
        ],
        assumptions: ["Weekday sessions stay under 45 minutes."],
        uncertainties: [],
        reviewPoints: [
          {
            title: "End of the first phase",
            triggerDate: "2026-09-20",
            triggerCondition: null,
            question: "Is this workload still the right size for you?",
          },
        ],
        safetyConsiderations: null,
      },
    },
  };
}

function declinedState(): RoadmapManagerState {
  return {
    ...emptyState(),
    regeneration: {
      previousProposalId: DECLINED_ID,
      endDate: "2026-11-02",
      planningNote: "Only 45 minutes on weekdays.",
    },
  };
}
