import {
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
import { MemoryManager, type MemoryView } from "./memory-manager";

const TODAY = "2026-08-01";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
