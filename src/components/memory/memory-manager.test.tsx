import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("@/app/home/you/memory/actions", () => ({
  changeMemoryAction: vi.fn(),
}));

import { INITIAL_MEMORY_ACTION_STATE } from "@/app/home/you/memory/action-state";
import {
  CONFIRMATION_BUDGET_MS,
  RECOVERY_NOTICE_MS,
  RENDER_GRACE_MS,
  WATCH_INTERVAL_MS,
} from "@/features/goals/mutation-watchdog";
import { MemoryManager, type MemoryView } from "./memory-manager";

const TODAY = "2026-08-01";
const RECOVERY_FLAG = "fittip.memory.recovered:v1";
const PAGE_ORIGIN = "http://localhost";
const PAGE_PATH = "/home/you/memory";

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

/**
 * The watchdog reads the monotonic clock rather than the wall clock, so the
 * fake timers are paired with an explicit `performance.now`. Nothing in these
 * tests depends on real elapsed time.
 */
function useControlledClock(startAt = 1_000) {
  clock = startAt;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
}

/** Steps the monotonic clock and the fake timers together, never in one jump,
 *  so a timer scheduled mid-way does not observe time that has not passed. */
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

describe("MemoryManager", () => {
  it("says nothing is stored rather than claiming the coach has learned anything", () => {
    renderManager([]);

    expect(
      screen.getByText(
        /Nothing is stored yet\. FitTip knows only what you write/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/learned/i)).not.toBeInTheDocument();
  });

  it("files each class separately and stamps its status and origin", () => {
    renderManager([
      item({ id: "a", memoryType: "profile_fact", content: "Trains at 6am." }),
      item({
        id: "b",
        memoryType: "constraint",
        content: "No pool this month.",
      }),
      item({
        id: "c",
        memoryType: "preference",
        content: "Prefers Sundays off.",
      }),
      item({
        id: "d",
        memoryType: "observed_pattern",
        status: "proposed",
        provenance: "inferred_proposed",
        confidence: 70,
        sourceReference: "training log",
        content: "Often misses Thursday.",
      }),
    ]);

    for (const heading of [
      "Facts",
      "Constraints",
      "Preferences",
      "Needs your review",
    ]) {
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    }
    // Proposals are filed first, then each class in its own section.
    expect(cardContents()).toEqual([
      "Often misses Thursday.",
      "Trains at 6am.",
      "No pool this month.",
      "Prefers Sundays off.",
    ]);
    expect(stamps()).toEqual([
      "Proposed · needs your review",
      "Active",
      "Active",
      "Active",
    ]);
    expect(
      screen.getByText(
        /Proposed from your records · confidence 70% · training log/,
      ),
    ).toBeInTheDocument();
  });

  it("offers accept and decline only for a proposal, and never preselects one", () => {
    renderManager([
      item({ id: "p", status: "proposed", memoryType: "observed_pattern" }),
    ]);

    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByText("Decline")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    // The destructive confirmations stay closed until the owner opens them.
    for (const details of document.querySelectorAll("details")) {
      expect(details.hasAttribute("open")).toBe(false);
    }
  });

  it("shows a passed review date as review due without changing the record", () => {
    renderManager([
      item({
        id: "e",
        expiresOn: "2026-07-15",
        content: "No pool this month.",
      }),
    ]);

    expect(
      screen.getByRole("heading", { name: "Review due" }),
    ).toBeInTheDocument();
    expect(stamps()).toEqual(["Review due"]);
    expect(screen.getByText("Review was due 2026-07-15.")).toBeInTheDocument();
    expect(cardContents()).toEqual(["No pool this month."]);
    expect(
      screen.getByRole("button", { name: "Update review date" }),
    ).toBeInTheDocument();
  });

  it("filters by status without hiding what each status means", () => {
    renderManager([
      item({ id: "a", content: "Active memory." }),
      item({ id: "b", status: "archived", content: "Disabled memory." }),
      item({ id: "c", status: "rejected", content: "Declined memory." }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Disabled 1" }));

    expect(cardContents()).toEqual(["Disabled memory."]);
    expect(
      screen.getByText(/Disabled memory stays inspectable/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disabled 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps every version inspectable with its author and change", () => {
    renderManager([
      item({
        id: "h",
        content: "Needs an easy day after two hard sessions.",
        revisionNumber: 2,
        history: [
          revision({
            id: "r2",
            revisionNumber: 2,
            content: "Needs an easy day after two hard sessions.",
            changeKind: "edited_and_accepted",
          }),
          revision({
            id: "r1",
            revisionNumber: 1,
            content: "Recovers slowly after two hard sessions.",
            authorClass: "system",
            changeKind: "created",
          }),
        ],
      }),
    ]);

    const history = screen
      .getByText("Version history (2)")
      .closest("details") as HTMLElement;
    expect(
      within(history).getByText("Recovers slowly after two hard sessions."),
    ).toBeInTheDocument();
    expect(
      within(history).getByText(/v1 · Created · by FitTip/),
    ).toBeInTheDocument();
    expect(
      within(history).getByText(/v2 · Edited and accepted · by you/),
    ).toBeInTheDocument();
  });

  it("explains what permanent deletion does before asking for confirmation", () => {
    renderManager([item({ id: "d" })]);

    expect(
      screen.getByText(/erases the current text and every earlier version/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm permanent delete" }),
    ).toBeInTheDocument();
  });

  it("shows the static safety notice where memory is written and nowhere else", () => {
    renderManager([item({ id: "d", content: "Knee soreness after hills." })]);

    const notices = screen.getAllByText(
      /stop training and speak to a qualified health professional/,
    );
    expect(notices).not.toHaveLength(0);
    for (const notice of notices) {
      expect(notice.closest("form")).not.toBeNull();
    }
    // Nothing about the entry is graded, diagnosed or scored.
    expect(screen.queryByText(/severity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnos/i)).not.toBeInTheDocument();
  });

  it("reports a conflict with a real recovery action", () => {
    renderManager([item({ id: "a" })], {
      ...INITIAL_MEMORY_ACTION_STATE,
      status: "conflict",
      message:
        "Memory changed in another tab. Reload before trying this change again.",
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      /changed in another tab/,
    );
    expect(
      screen.getByRole("link", { name: "Reload current memory" }),
    ).toHaveAttribute("href", "/home/you/memory");
  });

  it("disables every control while a change is in flight", () => {
    renderManager([item({ id: "a" })], INITIAL_MEMORY_ACTION_STATE, true);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Saving memory change…",
    );
    // The filter buttons stay usable; every submitting control locks.
    const submits = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "button:not([type='button'])",
      ),
    );
    expect(submits).not.toHaveLength(0);
    for (const button of submits) expect(button).toBeDisabled();
  });
});

/** Scopes to the Add-memory panel: a card's own editor uses the same label. */
function addMemoryPanel() {
  const panel = screen.getByText("Add memory").closest("details");
  if (!panel) throw new Error("the Add memory panel is missing");
  return within(panel as HTMLElement);
}

describe("MemoryManager add-memory draft", () => {
  it("keeps an unsaved draft when an unrelated card completes an action", () => {
    const { rerender } = renderManager([item({ id: "a" })]);
    const draft = "Sharp left knee pain on stairs since 12 July.";
    fireEvent.change(
      addMemoryPanel().getByLabelText("What FitTip should remember"),
      { target: { value: draft } },
    );

    // Any other card finishing an action advances the shared counter.
    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_MEMORY_ACTION_STATE,
        status: "saved",
        message: "Memory disabled.",
        submission: 1,
        operation: "disable",
        itemId: "a",
      },
      vi.fn(),
      false,
    ]);
    rerender(
      <MemoryManager
        items={[item({ id: "a" })]}
        expectedRevision={4}
        today={TODAY}
      />,
    );

    expect(
      addMemoryPanel().getByLabelText("What FitTip should remember"),
    ).toHaveValue(draft);
  });

  it("clears the form once the memory it holds is created", () => {
    const { rerender } = renderManager([]);
    fireEvent.change(
      addMemoryPanel().getByLabelText("What FitTip should remember"),
      { target: { value: "Trains before work." } },
    );

    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_MEMORY_ACTION_STATE,
        status: "saved",
        message: "Memory saved.",
        submission: 1,
        operation: "create",
      },
      vi.fn(),
      false,
    ]);
    rerender(
      <MemoryManager
        items={[item({ id: "a", content: "Trains before work." })]}
        expectedRevision={5}
        today={TODAY}
      />,
    );

    expect(
      addMemoryPanel().getByLabelText("What FitTip should remember"),
    ).toHaveValue("");
  });

  it("returns the owner's own words after a rejected create", () => {
    const { rerender } = renderManager([]);

    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_MEMORY_ACTION_STATE,
        status: "validation",
        message: "Enter between 1 and 1000 characters.",
        submission: 1,
        operation: "create",
        draft: {
          memoryType: "constraint",
          content: "No pool this month.",
          reviewDate: "",
        },
      },
      vi.fn(),
      false,
    ]);
    rerender(<MemoryManager items={[]} expectedRevision={4} today={TODAY} />);

    expect(
      addMemoryPanel().getByLabelText("What FitTip should remember"),
    ).toHaveValue("No pool this month.");
    expect(addMemoryPanel().getByLabelText("Memory type")).toHaveValue(
      "constraint",
    );
  });
});

/**
 * M2-02's own defect, not an inherited concern. Continuous-integration run
 * 30728162026 and a local six-run repeat both froze this surface on "Saving
 * memory change…" with stale content, at different mutations. In the CI trace
 * the server had answered in 33 ms with a complete `{"status":"saved"}`
 * payload, so the transition carrying it never committed.
 */
describe("MemoryManager mutation recovery", () => {
  it("reports a reply that never rendered, then reloads to show what is saved", () => {
    useControlledClock();
    stubLocation();
    // The response arrives immediately; the transition never commits.
    stubPerformanceObserver([
      { name: `${PAGE_ORIGIN}${PAGE_PATH}`, responseEnd: 1_010 },
    ]);
    renderManager([item({ id: "a" })], INITIAL_MEMORY_ACTION_STATE, true);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Saving memory change…",
    );

    // The grace period plus one watch interval, so the check that crosses it
    // has actually run.
    advance(RENDER_GRACE_MS + WATCH_INTERVAL_MS + 100);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "This memory change did not appear. Reloading to show what is saved.",
    );
    expect(notice).toHaveAttribute("data-state", "lost-render");
    // Says only what is observable. The reload is what settles the outcome, so
    // the notice never reports this change as applied.
    expect(notice).not.toHaveTextContent("Memory saved.");
    expect(reload).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RECOVERY_FLAG)).toBe("1");

    advance(RECOVERY_NOTICE_MS + 100);
    expect(reload).toHaveBeenCalled();
  });

  it("reports an unconfirmed change and offers a reload when no reply arrives", () => {
    useControlledClock();
    stubLocation();
    stubPerformanceObserver([]);
    renderManager([item({ id: "a" })], INITIAL_MEMORY_ACTION_STATE, true);

    advance(CONFIRMATION_BUDGET_MS + 100);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "This memory change has not been confirmed. Reload to see whether it was saved.",
    );
    expect(notice).toHaveAttribute("data-state", "unconfirmed");
    expect(
      screen.getByRole("link", { name: "Reload current memory" }),
    ).toHaveAttribute("href", PAGE_PATH);
    // Nothing is assumed either way, so the surface never reloads by itself.
    expect(reload).not.toHaveBeenCalled();
  });

  it("explains the reload it triggered, until the next change", () => {
    window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    renderManager([item({ id: "a" })]);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "Your last memory change did not appear, so this page was reloaded. What you see below is what is saved.",
    );
    expect(notice).toHaveAttribute("data-state", "recovered");

    cleanup();
    // A surface that has already handled a mutation is not a reloaded one.
    renderManager([item({ id: "a" })], {
      ...INITIAL_MEMORY_ACTION_STATE,
      status: "saved",
      message: "Memory saved.",
      submission: 1,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Memory saved.");
  });

  it("says nothing while a change is still inside its budget", () => {
    useControlledClock();
    stubLocation();
    stubPerformanceObserver([]);
    renderManager([item({ id: "a" })], INITIAL_MEMORY_ACTION_STATE, true);

    advance(RENDER_GRACE_MS + 100);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Saving memory change…",
    );
    expect(reload).not.toHaveBeenCalled();
  });
});

function cardContents() {
  return Array.from(document.querySelectorAll("[data-memory-content]")).map(
    (node) => node.textContent,
  );
}

function stamps() {
  return Array.from(document.querySelectorAll("[data-memory-stamp]")).map(
    (node) => node.textContent,
  );
}

function renderManager(
  items: MemoryView[],
  state = INITIAL_MEMORY_ACTION_STATE,
  pending = false,
) {
  useActionStateMock.mockReturnValue([state, vi.fn(), pending]);
  return render(
    <MemoryManager items={items} expectedRevision={4} today={TODAY} />,
  );
}

function item(overrides: Partial<MemoryView> = {}): MemoryView {
  return {
    id: "53000000-0000-4000-8000-0000000000b1",
    memoryType: "profile_fact",
    status: "active",
    provenance: "user_created",
    confidence: null,
    sourceReference: null,
    expiresOn: null,
    userConfirmedAt: null,
    content: "Trains before work.",
    revisionNumber: 1,
    history: [revision({})],
    ...overrides,
  };
}

function revision(
  overrides: Partial<MemoryView["history"][number]>,
): MemoryView["history"][number] {
  return {
    id: "revision-1",
    revisionNumber: 1,
    content: "Trains before work.",
    authorClass: "user",
    provenance: "user_created",
    changeKind: "created",
    statusAfter: "active",
    createdAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  };
}
