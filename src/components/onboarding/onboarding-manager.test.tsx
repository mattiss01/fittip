import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildRankPreview,
  isActionErrorStatus,
  OnboardingActionNotice,
  OnboardingManager,
} from "./onboarding-manager";
import type { OnboardingSnapshot } from "@/lib/onboarding/onboarding-contract";
import type { ProfileDetailsView } from "@/lib/profile/profile-contract";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("OnboardingManager", () => {
  it("explains storage and no-AI behavior before creating a draft", () => {
    render(
      <OnboardingManager profile={namedProfile()} snapshot={emptySnapshot()} />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Set up your coaching context.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/stored in your account so you can resume/),
    ).toBeVisible();
    expect(screen.getByText(/not sent to an AI provider/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start setup" })).toBeVisible();
  });

  it("opens on About you until a name is saved, and says what setup stores", () => {
    render(
      <OnboardingManager
        profile={{ ...namedProfile(), displayName: null }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 3 }) }}
      />,
    );

    expect(screen.getByText("Step 1 of 8 · About you")).toBeVisible();
    // An account that has just signed up lands here, past the start card,
    // so this step says what the start card says.
    expect(screen.getByText(/not sent to an AI provider/)).toBeVisible();
    expect(screen.getByLabelText("Name")).toBeRequired();
    for (const optional of [
      "Birthday (optional)",
      "Gender (optional)",
      "Height in cm (optional)",
      "Weight in kg (optional)",
    ]) {
      expect(screen.getByLabelText(optional)).not.toBeRequired();
    }
    // Suggested, shown and changeable rather than asked cold.
    expect(screen.getByLabelText("Units")).toHaveValue("metric");
    expect(screen.getByLabelText("Time zone")).toHaveValue("Europe/Berlin");
    // The draft is already at its third step; without a name nothing past
    // the first step opens.
    for (const later of [/2Your sports/, /3Goals/, /5Time and access/]) {
      expect(screen.getByRole("button", { name: later })).toBeDisabled();
    }
  });

  it("shows the stored measures in feet and pounds when the units say so", () => {
    render(
      <OnboardingManager
        profile={{
          ...namedProfile(),
          unitsSystem: "imperial",
          heightCm: 180.3,
          latestWeightKg: 79.83,
        }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /1About you/ }));

    expect(screen.getByLabelText("Height, feet (optional)")).toHaveValue("5");
    expect(screen.getByLabelText("Inches")).toHaveValue("11");
    expect(screen.getByLabelText("Weight in lb (optional)")).toHaveValue("176");

    fireEvent.change(screen.getByLabelText("Units"), {
      target: { value: "metric" },
    });
    expect(screen.getByLabelText("Height in cm (optional)")).toHaveValue(
      "180.3",
    );
  });

  it("offers the sports as chips, with the owner's own first and addable", () => {
    render(
      <OnboardingManager
        profile={{ ...namedProfile(), sports: ["Running", "Latzug"] }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /2Your sports/ }));

    expect(screen.getByText("Step 2 of 8 · Your sports")).toBeVisible();
    // By label, not by role: a role query walks all 64 chips each time and
    // took this test past its time limit when the whole suite ran.
    expect(screen.getByLabelText("Running")).toBeChecked();
    expect(screen.getByLabelText("Latzug")).toBeChecked();
    expect(screen.getByLabelText("Cycling")).not.toBeChecked();
    expect(screen.getByText("Your own")).toBeVisible();

    // A sport typed in is added ticked; a preset typed in is ticked where it
    // already stands rather than listed twice.
    const own = screen.getByLabelText("Add your own");
    fireEvent.change(own, { target: { value: "  Stabwurf " } });
    fireEvent.click(screen.getByText("Add", { selector: "button" }));
    expect(screen.getByLabelText("Stabwurf")).toBeChecked();
    fireEvent.change(own, { target: { value: "cycling" } });
    fireEvent.keyDown(own, { key: "Enter" });
    expect(screen.getAllByLabelText(/^cycling$/i)).toHaveLength(1);
    expect(screen.getByLabelText("Cycling")).toBeChecked();
  });

  it("renders eight textual steps and keeps later steps unavailable", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 2 }),
        }}
      />,
    );

    expect(screen.getByText("Step 4 of 8 · Current training")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /5Time and access/ }),
    ).toBeDisabled();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("asks a goal what Goals asks and sends the rest hidden", () => {
    const { container } = render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );

    expect(screen.getByText("Step 3 of 8 · Goals")).toBeVisible();
    expect(screen.getByLabelText("Goal title")).toBeRequired();
    expect(screen.getByLabelText("Desired outcome")).toBeRequired();
    expect(screen.getByLabelText("Sports")).toBeRequired();
    expect(screen.getByLabelText("Target date (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Attention")).toHaveValue("core");
    for (const gone of ["Category", "Start date", "Rank", "Rationale"]) {
      expect(screen.queryByLabelText(gone)).toBeNull();
    }

    // The draft still stores a whole goal, so every key the server reads is
    // sent. No rank: a goal is filed last among its own kind.
    const sent = (name: string) =>
      container.querySelector<HTMLInputElement>(`input[name="${name}:0"]`);
    expect(sent("goalCategory")).toHaveValue("other");
    expect(sent("goalStartDate")?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent("goalRank")).toHaveValue("");
    for (const name of [
      "goalTargetDetail",
      "goalMetricLabel",
      "goalMetricValue",
      "goalMetricUnit",
      "goalRationale",
      "goalConstraints",
    ]) {
      expect(sent(name)).toHaveValue("");
    }
  });

  it("shows the approved safety copy without a severity control", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 5 }),
        }}
      />,
    );

    expect(
      screen.getByText(
        /FitTip cannot assess or diagnose symptoms. If symptoms are severe, sudden, or getting worse/,
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText(/severity/i)).not.toBeInTheDocument();
    expect(screen.getByText(/not sent to an AI provider/)).toBeVisible();
  });

  it("stamps every review card with its permanent destination", () => {
    const goalId = "54000000-0000-4000-8000-000000000101";
    const memoryId = "54000000-0000-4000-8000-000000000102";
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 6 }),
          goalCandidates: [
            {
              id: goalId,
              position: 1,
              title: "Finish a calm 10K",
              desiredOutcome: "Run with even pacing.",
              category: "performance_event",
              activityAreas: ["Running"],
              startDate: "2026-08-02",
              priorityTier: "core",
              targetRank: 1,
              decision: "pending",
              resolution: null,
              targetGoalId: null,
              comparison: {
                kind: "new",
                targetId: null,
                existingLabel: null,
                existingDetail: null,
                existingStatus: null,
              },
            },
          ],
          memoryCandidates: [
            {
              id: memoryId,
              position: 1,
              fieldKey: "context:access",
              memoryType: "profile_fact",
              content: "Access and equipment: Track.",
              decision: "pending",
              resolution: null,
              targetMemoryId: null,
              comparison: {
                kind: "new",
                targetId: null,
                existingLabel: null,
                existingDetail: null,
                existingStatus: null,
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Choose where each statement lands.",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("Goals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Memory").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox", { name: "Decision" })).toHaveLength(
      2,
    );
    expect(
      screen.getByRole("button", { name: "Save accepted items" }),
    ).toBeVisible();
  });

  it("sends the profile's time zone and units with Time and access, unseen", () => {
    const { container } = render(
      <OnboardingManager
        profile={{ ...namedProfile(), unitsSystem: "imperial" }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 3 }) }}
      />,
    );

    expect(screen.getByText("Step 5 of 8 · Time and access")).toBeVisible();
    expect(screen.queryByLabelText("Timezone")).toBeNull();
    expect(screen.queryByLabelText("Units")).toBeNull();
    expect(
      container.querySelector('input[type="hidden"][name="timezoneName"]'),
    ).toHaveValue("Europe/Berlin");
    expect(
      container.querySelector('input[type="hidden"][name="units"]'),
    ).toHaveValue("imperial");
  });

  it("never offers the time zone or the units for Memory, and files them rejected", () => {
    const ids = [
      "54000000-0000-4000-8000-000000000a01",
      "54000000-0000-4000-8000-000000000a02",
      "54000000-0000-4000-8000-000000000a03",
    ];
    const candidate = (id: string, fieldKey: string, content: string) => ({
      id,
      position: 1,
      fieldKey,
      memoryType: "preference",
      content,
      decision: "pending" as const,
      resolution: null,
      targetMemoryId: null,
      comparison: {
        kind: "new" as const,
        targetId: null,
        existingLabel: null,
        existingDetail: null,
        existingStatus: null,
      },
    });
    const { container } = render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 6 }),
          memoryCandidates: [
            candidate(ids[0], "context:timezone", "Timezone: Europe/Berlin."),
            candidate(ids[1], "context:units", "Units: Metric."),
            candidate(ids[2], "preference:1", "Keep hard sessions short."),
          ],
        }}
      />,
    );

    expect(screen.queryByText("Timezone: Europe/Berlin.")).toBeNull();
    expect(screen.queryByText("Units: Metric.")).toBeNull();
    expect(screen.getByText("Keep hard sessions short.")).toBeVisible();
    expect(screen.getAllByRole("combobox", { name: "Decision" })).toHaveLength(
      1,
    );
    // Every candidate still gets a decision, or the draft refuses the save.
    const sent = new FormData(container.querySelector("form")!);
    expect(sent.getAll("candidateId")).toEqual(ids);
    expect(sent.get(`decision:${ids[0]}`)).toBe("rejected");
    expect(sent.get(`decision:${ids[1]}`)).toBe("rejected");
    expect(sent.get(`decision:${ids[2]}`)).toBe("accepted");
  });

  it("previews only accepted create and update decisions", () => {
    const snapshot = emptySnapshot();
    snapshot.activeGoalOrder = [
      {
        id: "54000000-0000-4000-8000-000000000201",
        title: "Existing core",
        priorityTier: "core",
        activeRank: 1,
      },
    ];
    snapshot.goalCandidates = [
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000301",
        title: "Rejected candidate",
        decision: "rejected",
      }),
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000302",
        title: "Kept exact",
        decision: "accepted",
        resolution: "keep",
        targetGoalId: "54000000-0000-4000-8000-000000000201",
        comparison: {
          kind: "exact",
          targetId: "54000000-0000-4000-8000-000000000201",
          existingLabel: "Existing core",
          existingDetail: "Existing outcome",
          existingStatus: null,
        },
      }),
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000303",
        title: "Accepted new",
        decision: "accepted",
        resolution: "create",
      }),
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000304",
        title: "Accepted replacement",
        decision: "accepted",
        resolution: "update",
        targetGoalId: "54000000-0000-4000-8000-000000000201",
        comparison: {
          kind: "conflict",
          targetId: "54000000-0000-4000-8000-000000000201",
          existingLabel: "Existing core",
          existingDetail: "Existing outcome",
          existingStatus: null,
        },
      }),
    ];

    expect(buildRankPreview(snapshot).map((goal) => goal.title)).toEqual([
      "Accepted new",
      "Accepted replacement",
    ]);
  });

  it("updates the complete rank preview from first-pass live choices", () => {
    const snapshot = emptySnapshot();
    snapshot.draft = draft({ currentStep: 6 });
    snapshot.activeGoalOrder = [
      {
        id: "54000000-0000-4000-8000-000000000501",
        title: "Existing one",
        priorityTier: "core",
        activeRank: 1,
      },
      {
        id: "54000000-0000-4000-8000-000000000502",
        title: "Existing two",
        priorityTier: "core",
        activeRank: 2,
      },
      {
        id: "54000000-0000-4000-8000-000000000503",
        title: "Existing three",
        priorityTier: "core",
        activeRank: 3,
      },
    ];
    snapshot.goalCandidates = [
      // Both start rejected, so the preview begins as the existing order and
      // each acceptance below is one change to it. An undecided card starts
      // accepted, which the test after this one covers.
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000511",
        position: 1,
        title: "New first",
        targetRank: 1,
        decision: "rejected",
      }),
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000512",
        position: 2,
        title: "Replacement first",
        targetRank: 1,
        decision: "rejected",
        comparison: {
          kind: "conflict",
          targetId: "54000000-0000-4000-8000-000000000502",
          existingLabel: "Existing two",
          existingDetail: "Existing outcome",
          existingStatus: null,
        },
      }),
    ];

    const { rerender } = render(
      <OnboardingManager profile={namedProfile()} snapshot={snapshot} />,
    );

    expect(rankTitles()).toEqual([
      "Existing one",
      "Existing two",
      "Existing three",
    ]);

    const newCard = screen
      .getByRole("heading", { name: "New first" })
      .closest("article")!;
    fireEvent.change(within(newCard).getByLabelText("Decision"), {
      target: { value: "accepted" },
    });
    expect(rankTitles()).toEqual([
      "New first",
      "Existing one",
      "Existing two",
      "Existing three",
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /would create 4 core goals/,
    );

    rerender(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...snapshot,
          draft: draft({ currentStep: 6, revision: 1 }),
        }}
      />,
    );
    expect(rankTitles()).toEqual([
      "New first",
      "Existing one",
      "Existing two",
      "Existing three",
    ]);

    fireEvent.change(within(newCard).getByLabelText("Decision"), {
      target: { value: "rejected" },
    });
    expect(rankTitles()).toEqual([
      "Existing one",
      "Existing two",
      "Existing three",
    ]);
    expect(
      screen.queryByText(/would create 4 core goals/),
    ).not.toBeInTheDocument();

    const replacementCard = screen
      .getByRole("heading", { name: "Replacement first" })
      .closest("article")!;
    fireEvent.change(within(replacementCard).getByLabelText("Decision"), {
      target: { value: "accepted" },
    });
    expect(rankTitles()).toEqual([
      "Replacement first",
      "Existing one",
      "Existing three",
    ]);

    fireEvent.change(within(replacementCard).getByLabelText("If accepted"), {
      target: { value: "keep" },
    });
    expect(rankTitles()).toEqual([
      "Existing one",
      "Existing two",
      "Existing three",
    ]);
    const submitted = new FormData(
      screen
        .getByRole("button", { name: "Save accepted items" })
        .closest("form")!,
    );
    expect(submitted.get("decision:54000000-0000-4000-8000-000000000511")).toBe(
      "rejected",
    );
    expect(submitted.get("decision:54000000-0000-4000-8000-000000000512")).toBe(
      "accepted",
    );
    expect(
      submitted.get("resolution:54000000-0000-4000-8000-000000000512"),
    ).toBe("keep");
  });

  it("starts an undecided card accepted, with no empty choice to make", () => {
    const snapshot = emptySnapshot();
    snapshot.draft = draft({ currentStep: 6 });
    snapshot.goalCandidates = [
      goalCandidate({
        id: "54000000-0000-4000-8000-000000000521",
        title: "Undecided goal",
        decision: "pending",
      }),
    ];

    render(<OnboardingManager profile={namedProfile()} snapshot={snapshot} />);

    const decision = screen.getByLabelText("Decision") as HTMLSelectElement;
    expect(decision.value).toBe("accepted");
    expect(Array.from(decision.options).map((option) => option.value)).toEqual([
      "accepted",
      "rejected",
    ]);
    expect(rankTitles()).toEqual(["Undecided goal"]);
  });

  it("does not offer setup again once it has been finished", () => {
    const snapshot = emptySnapshot();
    snapshot.hasPublished = true;

    render(<OnboardingManager profile={namedProfile()} snapshot={snapshot} />);

    expect(
      screen.getByRole("heading", { name: "Your setup is finished." }),
    ).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Goals" })).toHaveAttribute(
      "href",
      "/home/you/goals",
    );
  });

  it("surfaces inactive exact Memory and does not offer keep", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 6 }),
          memoryCandidates: [
            {
              id: "54000000-0000-4000-8000-000000000401",
              position: 1,
              fieldKey: "preference:1",
              memoryType: "preference",
              content: "Synthetic preference.",
              decision: "pending",
              resolution: null,
              targetMemoryId: null,
              comparison: {
                kind: "conflict",
                targetId: "54000000-0000-4000-8000-000000000402",
                existingLabel: "preference",
                existingDetail: "Synthetic preference.",
                existingStatus: "archived",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/Saved status: archived/)).toBeVisible();
    expect(
      screen.queryByRole("option", { name: /Keep what/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Update what/ }),
    ).toBeInTheDocument();
  });

  it("focuses the actionable error notice", async () => {
    render(
      <OnboardingActionNotice
        state={{
          status: "validation",
          message: "Review this step.",
          submission: 1,
        }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(isActionErrorStatus("validation")).toBe(true);
    expect(isActionErrorStatus("conflict")).toBe(true);
    expect(isActionErrorStatus("session")).toBe(true);
    expect(isActionErrorStatus("error")).toBe(true);
    expect(isActionErrorStatus("saved")).toBe(false);
  });
});

/** A profile whose name is saved, so setup opens on the draft's own step. */
function namedProfile(): ProfileDetailsView {
  return {
    displayName: "Alex",
    birthDate: null,
    gender: null,
    unitsSystem: "metric",
    heightCm: null,
    timezoneName: "Europe/Berlin",
    sports: [],
    latestWeightKg: null,
  };
}

function emptySnapshot(): OnboardingSnapshot {
  return {
    draft: null,
    activities: [],
    goalCandidates: [],
    memoryCandidates: [],
    goalRevision: 0,
    memoryRevision: 0,
    activeGoalOrder: [],
    promptDismissed: false,
    hasPublished: false,
  };
}

function draft(
  overrides: Partial<NonNullable<OnboardingSnapshot["draft"]>>,
): NonNullable<OnboardingSnapshot["draft"]> {
  return {
    id: "54000000-0000-4000-8000-000000000001",
    revision: 0,
    currentStep: 1,
    trainingStatus: null,
    availableDays: [],
    sessionsPerWeek: null,
    sessionDurationMinutes: null,
    accessLabels: [],
    timezoneName: "Europe/Berlin",
    units: "metric",
    idempotencyKey: "54000000-0000-4000-8000-000000000002",
    expiresAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function goalCandidate(
  overrides: Partial<OnboardingSnapshot["goalCandidates"][number]>,
): OnboardingSnapshot["goalCandidates"][number] {
  return {
    id: "54000000-0000-4000-8000-000000000399",
    position: 1,
    title: "Candidate",
    desiredOutcome: "Candidate outcome",
    category: "other",
    activityAreas: [],
    startDate: "2026-08-02",
    priorityTier: "core",
    targetRank: 2,
    decision: "pending",
    resolution: null,
    targetGoalId: null,
    comparison: {
      kind: "new",
      targetId: null,
      existingLabel: null,
      existingDetail: null,
      existingStatus: null,
    },
    ...overrides,
  };
}

function rankTitles() {
  const preview = screen
    .getByRole("heading", { name: "Result from your current choices" })
    .closest("section")!;
  return within(preview)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("strong")?.textContent);
}
