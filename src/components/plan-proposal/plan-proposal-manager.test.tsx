import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanProposalManager } from "@/components/plan-proposal/plan-proposal-manager";

vi.mock("@/app/home/plan/proposal/actions", () => ({
  generatePlanProposalAction: vi.fn(),
  rejectPlanProposalAction: vi.fn(),
}));

const proposal = {
  id: "70000000-0000-4000-8000-000000000001",
  weekDescription: "Three deliberate days.",
  assumptions: [],
  uncertainties: [],
  safetyConsiderations: [],
};

describe("plan proposal manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Europe/Berlin",
    } as Intl.ResolvedDateTimeFormatOptions);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(callback, 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
      window.clearTimeout(handle),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("contains dialog focus, makes the background inert, closes on Escape and restores the invoker", () => {
    const outsideButton = document.createElement("button");
    document.body.append(outsideButton);
    renderManager({ proposal });

    const continueButton = screen.getByRole("button", { name: "Continue" });
    fireEvent.click(continueButton);
    const continueDialog = screen.getByRole("dialog", {
      name: "Proposal saved for review",
    });
    const continueAction = within(continueDialog).getByRole("button", {
      name: "Keep reviewing",
    });
    expect(
      continueDialog.parentElement?.querySelector("[inert]"),
    ).not.toBeNull();
    expect(outsideButton).toHaveAttribute("inert");
    act(() => vi.advanceTimersByTime(1));
    expect(continueAction).toHaveFocus();
    fireEvent.keyDown(continueDialog, { key: "Tab" });
    expect(continueAction).toHaveFocus();
    fireEvent.keyDown(continueDialog, { key: "Escape" });
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(continueButton).toHaveFocus();
    expect(outsideButton).not.toHaveAttribute("inert");

    const rejectButton = screen.getByRole("button", {
      name: "Reject proposal",
    });
    fireEvent.click(rejectButton);
    const rejectDialog = screen.getByRole("dialog", {
      name: "Reject proposal?",
    });
    const rejectAction = within(rejectDialog).getByRole("button", {
      name: "Reject proposal",
    });
    const keepAction = within(rejectDialog).getByRole("button", {
      name: "Keep proposal",
    });
    act(() => vi.advanceTimersByTime(1));
    expect(rejectAction).toHaveFocus();
    fireEvent.keyDown(rejectDialog, { key: "Tab", shiftKey: true });
    expect(keepAction).toHaveFocus();
    fireEvent.keyDown(rejectDialog, { key: "Tab" });
    expect(rejectAction).toHaveFocus();
    fireEvent.keyDown(rejectDialog, { key: "Escape" });
    act(() => vi.advanceTimersByTime(1));
    expect(rejectButton).toHaveFocus();
    outsideButton.remove();
  });

  it("resets the compose start date when owner-local today rolls over", async () => {
    vi.setSystemTime(new Date("2026-08-12T21:59:59.900Z"));
    renderManager({ proposal: null });

    const startDate = screen.getByLabelText("Start date");
    expect(startDate).toHaveValue("2026-08-12");
    fireEvent.change(startDate, { target: { value: "2026-08-15" } });
    expect(startDate).toHaveValue("2026-08-15");

    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-08-13");
  });
});

function renderManager({
  proposal: current,
}: {
  proposal: typeof proposal | null;
}) {
  return render(
    <PlanProposalManager
      contextSummary={{ goals: 1, memory: 0, recentSessions: 0 }}
      openMemoryCandidateCount={0}
      proposal={current}
      proposalDays={<div>Proposal days</div>}
      rememberedDayCount={3}
    />,
  );
}
