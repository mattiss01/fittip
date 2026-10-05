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
import { AboutYouForm, SportsForm } from "@/components/profile/profile-forms";
import { adoptBrowserTimezoneAction } from "@/app/home/you/profile-actions";
import type { OnboardingSnapshot } from "@/lib/onboarding/onboarding-contract";
import type { ProfileDetailsView } from "@/lib/profile/profile-contract";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// The profile's own steps save through these. Each save goes through, so a
// test can walk from one question to the next.
vi.mock("@/app/home/you/profile-actions", () => {
  const saved = vi.fn(async (previous: { submission: number }) => ({
    status: "saved",
    message: "",
    submission: previous.submission + 1,
  }));
  return {
    saveProfileDetailsAction: saved,
    saveProfileSportsAction: saved,
    saveAppSettingsAction: saved,
    deleteWeightEntryAction: saved,
    adoptBrowserTimezoneAction: vi.fn(async () => {}),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(adoptBrowserTimezoneAction).mockClear();
});

describe("OnboardingManager", () => {
  it("explains storage and no-AI behavior before creating a draft", () => {
    render(
      <OnboardingManager profile={namedProfile()} snapshot={emptySnapshot()} />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Set up your coaching context",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/stored in your account so you can resume/),
    ).toBeVisible();
    expect(screen.getByText(/not sent to an AI provider/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start setup" })).toBeVisible();
  });

  it("opens on the name until one is saved, with a bar for how far setup is", () => {
    render(
      <OnboardingManager
        profile={{ ...namedProfile(), displayName: null }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 3 }) }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "What's your name?" }),
    ).toBeVisible();
    // Nothing is done on the first of twelve steps.
    const bar = screen.getByRole("progressbar", {
      name: "Guided setup progress",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuetext", "Step 1 of 12, 0% done");
    // One bar, not a row of steps to jump between, and no way to delete the
    // draft: a step is left by Back, Next or "Continue later".
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /cancel|delete/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue later" }),
    ).toBeVisible();
    // Not said here: an account that has just signed up is not told what
    // the start card says (owner, 5 Oct 2026).
    expect(screen.queryByText(/not sent to an AI provider/)).toBeNull();
    // Neither the units nor the time zone is asked: both are sent as the
    // browser has them, and the zone only while the profile has none.
    expect(screen.queryByLabelText("Units")).toBeNull();
    expect(screen.queryByLabelText("Time zone")).toBeNull();
    const sent = new FormData(
      document.querySelector<HTMLFormElement>("form[data-about-you]")!,
    );
    expect(sent.get("unitsSystem")).toBe("metric");
    expect(sent.get("timezoneName")).toBe("");
  });

  it("asks About you one question at a time, saving each, and only the name must be answered", async () => {
    render(
      <OnboardingManager
        profile={{ ...namedProfile(), displayName: null }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );
    const heading = (name: string) => screen.findByRole("heading", { name });
    const next = () =>
      fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // The name is the one field the browser will not send empty.
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Alex" },
    });
    // Next saves the form as it stands and only then moves on.
    next();
    expect(await heading("When is your birthday?")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "8",
    );
    // The question is the heading, so its one field shows no label; the
    // name it has is for a screen reader. An optional one says so.
    expect(
      screen.getByRole("group", { name: "Birthday (optional)" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).not.toBeVisible();
    expect(
      screen
        .getAllByText("Optional")
        .some((hint) => hint.closest("[hidden]") === null),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await heading("What's your name?")).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Alex");

    next();
    expect(await heading("When is your birthday?")).toBeVisible();
    next();
    expect(await heading("What's your gender?")).toBeVisible();
    next();
    expect(await heading("How tall are you?")).toBeVisible();
    next();
    expect(await heading("How much do you weigh?")).toBeVisible();

    // Every step's button says Next; the last question's moves setup on to
    // the sports.
    next();
    expect(await heading("Your sports")).toBeVisible();
  });

  it("stores the browser's time zone as setup opens, and only for a profile without one", () => {
    const view = render(
      <OnboardingManager
        profile={{ ...namedProfile(), displayName: null, timezoneName: null }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );
    // Before any answer: an owner who leaves at the first question still
    // has a day for Today to show.
    expect(adoptBrowserTimezoneAction).toHaveBeenCalledExactlyOnceWith(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    view.rerender(
      <OnboardingManager
        profile={{ ...namedProfile(), displayName: null, timezoneName: null }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );
    expect(adoptBrowserTimezoneAction).toHaveBeenCalledOnce();

    cleanup();
    vi.mocked(adoptBrowserTimezoneAction).mockClear();
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );
    expect(adoptBrowserTimezoneAction).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the first unanswered question",
      { birthDate: "1990-05-17" },
      "What's your gender?",
    ],
    [
      "the sports once every question is answered",
      {
        birthDate: "1990-05-17",
        gender: "other" as const,
        heightCm: 180,
        latestWeightKg: 80,
      },
      "Your sports",
    ],
    [
      "the draft once the sports are chosen too",
      {
        birthDate: "1990-05-17",
        gender: "other" as const,
        heightCm: 180,
        latestWeightKg: 80,
        sports: ["Running"],
      },
      "Goals",
    ],
  ])("resumes an untouched setup at %s", (_label, answers, heading) => {
    render(
      <OnboardingManager
        profile={{ ...justNamedProfile(), ...answers }}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
  });

  it("goes back by the arrow at the top, across the profile's steps and the draft's", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 2, revision: 3 }),
        }}
      />,
    );
    const back = () =>
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const heading = (name: string) => screen.getByRole("heading", { name });

    // A draft that has been worked on opens where it is.
    expect(heading("Current training")).toBeVisible();
    back();
    expect(heading("Goals")).toBeVisible();
    back();
    expect(heading("Your sports")).toBeVisible();
    back();
    expect(heading("How much do you weigh?")).toBeVisible();
    for (let question = 0; question < 4; question += 1) back();
    expect(heading("What's your name?")).toBeVisible();
    // The first question has nowhere to go back to.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("asks before opening setup again for an owner who chose Continue later", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        reminder
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 2 }) }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Your setup is not finished" }),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("link", { name: "Skip for now" })).toHaveAttribute(
      "href",
      "/home/today",
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    expect(
      screen.getByRole("heading", { name: "Current training" }),
    ).toBeVisible();
  });

  it("takes a birthday typed as day, month and year, and sends it as one date", () => {
    const { container } = render(
      <AboutYouForm
        profile={justNamedProfile()}
        question={1}
        submitLabel="Next"
      />,
    );
    const date = () =>
      container.querySelector<HTMLInputElement>('input[name="birthDate"]');
    const type = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });

    // Not answered is sent as no date at all.
    expect(date()).toHaveValue("");
    type("Day", "7");
    // A full part moves on to the one after it, so the keyboard alone fills
    // the date. Which comes after the month depends on the language.
    type("Month", "05");
    expect(document.activeElement).toHaveAttribute("data-part");
    expect(document.activeElement).not.toBe(screen.getByLabelText("Month"));
    type("Year", "1990");
    expect(date()).toHaveValue("1990-05-07");
    // Only digits are kept.
    type("Day", "1x");
    expect(screen.getByLabelText("Day")).toHaveValue("1");
  });

  it("shows a saved birthday in its three fields", () => {
    render(
      <AboutYouForm
        profile={{ ...justNamedProfile(), birthDate: "1990-05-17" }}
        submitLabel="Save"
      />,
    );
    expect(screen.getByLabelText("Day")).toHaveValue("17");
    expect(screen.getByLabelText("Month")).toHaveValue("05");
    expect(screen.getByLabelText("Year")).toHaveValue("1990");
  });

  it("starts the goal step from the goals the account already has", () => {
    const { container } = render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 1, revision: 1 }),
          existingGoals: [
            {
              title: "10k under 48 minutes",
              desiredOutcome: "Run it in autumn.",
              category: "endurance",
              activityAreas: ["Running", "Hiking"],
              startDate: "2026-09-01",
              targetDate: "2026-11-15",
              priorityTier: "supporting",
              targetRank: 2,
              rationale: "Kept from before",
            },
          ],
        }}
      />,
    );

    // Goals made before setup are edited here instead of typed again.
    expect(screen.getByLabelText("Goal title")).toHaveValue(
      "10k under 48 minutes",
    );
    expect(screen.getByLabelText("Desired outcome")).toHaveValue(
      "Run it in autumn.",
    );
    expect(screen.getByRole("radio", { name: "Supporting" })).toBeChecked();
    // Everything the goal stores travels with it, so sent back unchanged it
    // is recognised at review as the goal already saved.
    const sent = new FormData(container.querySelector("form")!);
    expect(sent.get("goalActivities:0")).toBe("Running, Hiking");
    expect(sent.get("goalCategory:0")).toBe("endurance");
    expect(sent.get("goalStartDate:0")).toBe("2026-09-01");
    expect(sent.get("goalTargetDate:0")).toBe("2026-11-15");
    expect(sent.get("goalRank:0")).toBe("2");
    expect(sent.get("goalRationale:0")).toBe("Kept from before");
  });

  it("asks a measure as a number with its unit beside it and a step either way", () => {
    render(
      <AboutYouForm
        profile={justNamedProfile()}
        question={3}
        submitLabel="Next"
      />,
    );
    const height = screen.getByLabelText("Height in cm (optional)");
    const press = (name: string) =>
      fireEvent.click(screen.getByRole("button", { name }));

    // Empty until answered, with the unit there before and after typing.
    expect(height).toHaveValue("");
    expect(screen.getByText("cm")).toBeVisible();
    // The first step lands in the middle of what people enter, not on the
    // smallest height allowed.
    press("More: Height in cm (optional)");
    expect(height).toHaveValue("170");
    press("More: Height in cm (optional)");
    press("Less: Height in cm (optional)");
    press("Less: Height in cm (optional)");
    expect(height).toHaveValue("169");
    // It can still be typed, with a comma, and stepped from there.
    fireEvent.change(height, { target: { value: "180,5" } });
    press("More: Height in cm (optional)");
    expect(height).toHaveValue("181.5");
    expect(screen.getByText("cm")).toBeVisible();
  });

  it("shows the stored measures in feet and pounds when the units say so", () => {
    render(
      <AboutYouForm
        profile={{
          ...namedProfile(),
          unitsSystem: "imperial",
          heightCm: 180.3,
          latestWeightKg: 79.83,
        }}
        submitLabel="Save"
      />,
    );

    // Settings shows every field at once, each under its label.
    expect(screen.getByLabelText("Name")).toHaveValue("Alex");
    expect(screen.getByLabelText("Height, feet (optional)")).toHaveValue("5");
    expect(screen.getByLabelText("Inches")).toHaveValue("11");
    expect(screen.getByLabelText("Weight in lb (optional)")).toHaveValue("176");
    expect(screen.queryByLabelText("Height in cm (optional)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue later" })).toBeNull();
  });

  it("offers the sports as chips, with the owner's own first and addable", () => {
    render(<SportsForm sports={["Running", "Latzug"]} submitLabel="Save" />);

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

  it("opens a named account on the draft's own step, counted among all twelve", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 2 }),
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Current training" }),
    ).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Step 8 of 12, 58% done",
    );
    expect(
      screen.getByRole("button", { name: "Continue later" }),
    ).toBeVisible();
  });

  it("still offers a sport the draft holds that is no longer among the owner's", () => {
    render(
      <OnboardingManager
        profile={{ ...namedProfile(), sports: ["Cycling"] }}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 1, revision: 1 }),
          goalCandidates: [goalCandidate({ activityAreas: ["Running"] })],
        }}
      />,
    );

    const sport = screen.getByRole("button", { name: /^Sport/ });
    expect(sport).toHaveTextContent("Running");
    fireEvent.click(sport);
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Cycling", "Running", "Add another sport…"]);
    expect(screen.getByRole("option", { name: "Running" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("lets a goal that was just added be taken away again, but not the first", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{
          ...emptySnapshot(),
          draft: draft({ currentStep: 1, revision: 1 }),
        }}
      />,
    );
    const remove = () =>
      screen.queryByRole("button", { name: "Remove this goal" });

    expect(remove()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add another goal" }));
    expect(screen.getAllByLabelText("Goal title")).toHaveLength(2);
    fireEvent.click(remove()!);
    expect(screen.getAllByLabelText("Goal title")).toHaveLength(1);
    expect(remove()).toBeNull();
  });

  it("asks again before leaving setup, and says what setup is for", () => {
    render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 2 }) }}
      />,
    );
    const later = () => screen.getByRole("button", { name: "Continue later" });

    // The link only asks; nothing in the form says "leave" yet.
    expect(later()).toHaveAttribute("type", "button");
    fireEvent.click(later());
    const popup = screen.getByRole("alertdialog", {
      name: "Setup makes FitTip useful",
    });
    expect(popup).toHaveAttribute("aria-modal", "true");

    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(later());
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // Asked again and confirmed, it is the step's own save with the intent
    // to leave, and it does not wait on a field.
    fireEvent.click(later());
    expect(later()).toHaveAttribute("name", "intent");
    expect(later()).toHaveAttribute("value", "finish");
    expect(later()).toHaveAttribute("formnovalidate");
  });

  it("asks a goal what Goals asks and sends the rest hidden", () => {
    const { container } = render(
      <OnboardingManager
        profile={namedProfile()}
        snapshot={{ ...emptySnapshot(), draft: draft({ currentStep: 1 }) }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Goals" })).toBeVisible();
    expect(screen.getByLabelText("Goal title")).toBeRequired();
    expect(screen.getByLabelText("Desired outcome")).toBeRequired();
    expect(screen.getByText("What you want to train for")).toBeVisible();
    // The goal has exactly one sport, chosen from the ones picked in "Your
    // sports" or made up here; nothing is chosen to begin with.
    const sport = screen.getByRole("button", { name: /^Sport/ });
    const goalSport = () =>
      container.querySelector<HTMLInputElement>(
        'input[name="goalActivities:0"]',
      );
    const choose = (name: string) => {
      fireEvent.click(sport);
      fireEvent.click(screen.getByRole("option", { name }));
    };
    expect(sport).toHaveTextContent("Choose a sport");
    expect(goalSport()).toHaveValue("");
    // The first goal must name one: a field stands in for the hidden value
    // so the browser can refuse the step and point at it.
    expect(
      container.querySelector('input[required][aria-hidden="true"]'),
    ).toHaveValue("");
    // The list is ours, opened under its button and closed by a choice.
    expect(screen.queryByRole("listbox")).toBeNull();
    choose("Running");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(sport).toHaveTextContent("Running");
    expect(goalSport()).toHaveValue("Running");

    choose("Add another sport…");
    const made = screen.getByLabelText("New sport");
    expect(made).toBeRequired();
    fireEvent.change(made, { target: { value: "  Stabwurf " } });
    expect(goalSport()).toHaveValue("Stabwurf");
    // The target date is typed or picked from a calendar, and optional.
    const target = screen.getByRole("group", {
      name: "Target date (optional)",
    });
    expect(
      within(target).getByRole("button", {
        name: "Pick target date (optional) from a calendar",
      }),
    ).toBeVisible();
    fireEvent.change(within(target).getByLabelText("Day"), {
      target: { value: "15" },
    });
    fireEvent.change(within(target).getByLabelText("Month"), {
      target: { value: "11" },
    });
    fireEvent.change(within(target).getByLabelText("Year"), {
      target: { value: "2026" },
    });
    expect(
      container.querySelector('input[name="goalTargetDate:0"]'),
    ).toHaveValue("2026-11-15");
    // Two choices side by side, as on Goals, and an outcome field that
    // starts one line tall.
    expect(screen.getByRole("radio", { name: "Core" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Supporting" })).not.toBeChecked();
    expect(screen.getByLabelText("Desired outcome")).toHaveAttribute(
      "rows",
      "1",
    );
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
        name: "Choose where each statement lands",
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

    expect(
      screen.getByRole("heading", { name: "Time and access" }),
    ).toBeVisible();
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
      screen.getByRole("heading", { name: "Your setup is finished" }),
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

/**
 * A profile with every "About you" question answered and a sport chosen, so
 * setup opens on the draft's own step.
 */
function namedProfile(): ProfileDetailsView {
  return {
    displayName: "Alex",
    birthDate: "1990-05-17",
    gender: "other",
    unitsSystem: "metric",
    heightCm: 180,
    timezoneName: "Europe/Berlin",
    sports: ["Running"],
    latestWeightKg: 80,
  };
}

/** Only the name saved: the rest of "About you" and the sports are open. */
function justNamedProfile(): ProfileDetailsView {
  return {
    ...namedProfile(),
    birthDate: null,
    gender: null,
    heightCm: null,
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
    existingGoals: [],
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
