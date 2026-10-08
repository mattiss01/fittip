import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  leaveSetupAction,
  recordSetupStepAction,
  saveSetupGoalsAction,
} from "@/app/home/you/onboarding/actions";
import { adoptBrowserTimezoneAction } from "@/app/home/you/profile-actions";
import { OnboardingManager } from "@/components/onboarding/onboarding-manager";
import { AboutYouForm, SportsForm } from "@/components/profile/profile-forms";
import { TrainingSetupForm } from "@/components/profile/training-forms";
import type { ProfileDetailsView } from "@/lib/profile/profile-contract";
import type { SetupGoalView } from "@/lib/setup/setup-steps";

// Setup's own two screens save through these. Each save goes through, so a
// test can press Next; a test that needs a refusal says so itself.
vi.mock("@/app/home/you/onboarding/actions", () => {
  const saved = vi.fn(async (previous: { submission: number }) => ({
    status: "saved",
    message: "",
    submission: previous.submission + 1,
  }));
  return {
    saveSetupGoalsAction: saved,
    finishSetupAction: vi.fn(saved.getMockImplementation()),
    leaveSetupAction: vi.fn(async () => {}),
    recordSetupStepAction: vi.fn(async () => {}),
    startSetupAction: vi.fn(async () => {}),
  };
});

// The profile's screens save through these.
vi.mock("@/app/home/you/profile-actions", () => {
  const saved = vi.fn(async (previous: { submission: number }) => ({
    status: "saved",
    message: "",
    submission: previous.submission + 1,
  }));
  return {
    saveProfileDetailsAction: saved,
    saveProfileSportsAction: saved,
    saveTrainingSetupAction: saved,
    saveAppSettingsAction: saved,
    deleteWeightEntryAction: saved,
    adoptBrowserTimezoneAction: vi.fn(async () => {}),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const heading = (name: string) => screen.findByRole("heading", { name });
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const back = () =>
  fireEvent.click(screen.getByRole("button", { name: "Back" }));

describe("OnboardingManager", () => {
  it("offers setup to an account it was never begun for, and says what it is", () => {
    render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), null)} />,
    );

    expect(
      screen.getByRole("heading", { name: "Set up your coaching context" }),
    ).toBeVisible();
    expect(screen.getByText(/Each answer is saved as you go/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start setup" })).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not offer setup again once it has been finished", () => {
    render(
      <OnboardingManager
        goals={[]}
        profile={{
          ...namedProfile(),
          setup: { step: 12, finished: true, skipped: false },
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Your setup is finished" }),
    ).toBeVisible();
    for (const place of ["Goals", "Memory", "Settings"]) {
      expect(screen.getByRole("link", { name: place })).toBeVisible();
    }
    expect(screen.queryByRole("button", { name: /setup/i })).toBeNull();
  });

  it("opens on the name until one is saved, with a bar for how far setup is", () => {
    render(
      <OnboardingManager
        goals={[]}
        // Whatever screen is stored: the name comes first.
        profile={atStep({ ...namedProfile(), displayName: null }, 9)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "What's your name?" }),
    ).toBeVisible();
    // Nothing is done on the first of twelve screens.
    const bar = screen.getByRole("progressbar", {
      name: "Guided setup progress",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuetext", "Step 1 of 12, 0% done");
    // One bar, not a row of steps to jump between, and nothing to delete: a
    // screen is left by Back, Next or "Continue later".
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /cancel|delete/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue later" }),
    ).toBeVisible();
    // Neither the units nor the time zone is asked.
    expect(screen.queryByLabelText("Units")).toBeNull();
    expect(screen.queryByLabelText("Time zone")).toBeNull();
  });

  it("asks About you one question at a time, saving each, and only the name must be answered", async () => {
    render(
      <OnboardingManager
        goals={[]}
        profile={atStep({ ...namedProfile(), displayName: null }, 1)}
      />,
    );

    // The name is the one field the browser will not send empty.
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Alex" },
    });
    // Next saves the form as it stands and only then moves on, and the
    // screen it moves to is stored, so setup reopens there.
    next();
    expect(await heading("When is your birthday?")).toBeVisible();
    expect(recordSetupStepAction).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "8",
    );
    // The question is the heading, so its one field shows no label; the
    // name it has is for a screen reader.
    expect(
      screen.getByRole("group", { name: "Birthday (optional)" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).not.toBeVisible();

    back();
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
    // Every screen's button says Next; the last question's moves on to the
    // sports.
    next();
    expect(await heading("Your sports")).toBeVisible();
    expect(recordSetupStepAction).toHaveBeenLastCalledWith(6);
  });

  it("reopens on the screen the profile stores", () => {
    render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 9)} />,
    );

    expect(
      screen.getByRole("heading", { name: "Any days you can't train?" }),
    ).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Step 9 of 12, 67% done",
    );
  });

  it("stores the browser's time zone as setup opens, and only for a profile without one", () => {
    render(
      <OnboardingManager
        goals={[]}
        profile={atStep({ ...namedProfile(), timezoneName: null }, 1)}
      />,
    );
    expect(adoptBrowserTimezoneAction).toHaveBeenCalledWith(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );

    cleanup();
    vi.mocked(adoptBrowserTimezoneAction).mockClear();
    render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 1)} />,
    );
    expect(adoptBrowserTimezoneAction).not.toHaveBeenCalled();
  });

  it("asks before opening setup again for an owner who chose Continue later", () => {
    render(
      <OnboardingManager
        goals={[]}
        profile={atStep(namedProfile(), 8)}
        reminder
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Your setup is not finished" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Skip for now" })).toHaveAttribute(
      "href",
      "/home/today",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    // It goes on where it was left, not from the start.
    expect(
      screen.getByRole("heading", { name: "How often do you want to train?" }),
    ).toBeVisible();
  });

  it("asks again before leaving setup, says what setup is for, and leaves from the screen it is on", async () => {
    render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 7)} />,
    );
    const later = () => screen.getByRole("button", { name: "Continue later" });

    // The link only asks; nothing in the form says "leave" yet.
    expect(later()).toHaveAttribute("type", "button");
    fireEvent.click(later());
    const popup = screen.getByRole("alertdialog", {
      name: "Setup makes FitTip useful",
    });
    expect(popup).toHaveAttribute("aria-modal", "true");

    // Tab stays among the popup's two buttons, whichever way it goes.
    const keep = screen.getByRole("button", { name: "Keep going" });
    const leave = within(popup).getByRole("button", { name: "Continue later" });
    leave.focus();
    fireEvent.keyDown(popup, { key: "Tab" });
    expect(keep).toHaveFocus();
    fireEvent.keyDown(popup, { key: "Tab", shiftKey: true });
    expect(leave).toHaveFocus();
    // From the popup itself, where a press on its text leaves focus.
    popup.focus();
    expect(popup).toHaveFocus();
    fireEvent.keyDown(popup, { key: "Tab" });
    expect(keep).toHaveFocus();

    // Closed, focus is back on the link that opened it.
    fireEvent.click(keep);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(later()).toHaveFocus();
    fireEvent.click(later());
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // Asked again and confirmed, it is the screen's own save with the intent
    // to leave, and it does not wait on a field.
    fireEvent.click(later());
    expect(later()).toHaveAttribute("name", "intent");
    expect(later()).toHaveAttribute("value", "later");
    expect(later()).toHaveAttribute("formnovalidate");

    // On a profile screen the answer is saved first and setup is then left
    // from that screen, so it reopens there.
    cleanup();
    render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 8)} />,
    );
    fireEvent.click(later());
    fireEvent.click(later());
    await waitFor(() => expect(leaveSetupAction).toHaveBeenCalledWith(8));
  });

  it("starts the goals screen from the goals the account already has, and saves them as goals", async () => {
    render(
      <OnboardingManager
        goals={[savedGoal()]}
        profile={atStep(namedProfile(), 7)}
      />,
    );

    expect(screen.getByRole("heading", { name: "Goals" })).toBeVisible();
    expect(screen.getByText("What you want to train for")).toBeVisible();
    expect(screen.queryByText(/up to three/i)).toBeNull();
    // A goal made before setup is edited here instead of typed again.
    expect(screen.getByLabelText("Goal title")).toHaveValue(
      "10k under 48 minutes",
    );
    expect(screen.getByLabelText("Desired outcome")).toHaveValue(
      "Run it in autumn.",
    );
    expect(screen.getByRole("radio", { name: "Supporting" })).toBeChecked();
    // A saved goal is changed or removed on Goals, not taken away here.
    expect(
      screen.queryByRole("button", { name: "Remove this goal" }),
    ).toBeNull();

    next();
    await waitFor(() => expect(saveSetupGoalsAction).toHaveBeenCalled());
    const sent = vi.mocked(saveSetupGoalsAction).mock.calls[0][1];
    // It carries its id, which is what makes saving it an edit, and every
    // sport it names.
    expect(sent.get("goalCount")).toBe("1");
    expect(sent.get("goalId:0")).toBe(GOAL_ID);
    expect(sent.get("goalTitle:0")).toBe("10k under 48 minutes");
    expect(sent.get("goalActivities:0")).toBe("Running, Hiking");
    expect(sent.get("goalTargetDate:0")).toBe("2026-11-15");
    expect(sent.get("goalTier:0")).toBe("supporting");
    expect(sent.get("intent")).toBe("continue");
    // Saved, setup moves on to how often.
    expect(await heading("How often do you want to train?")).toBeVisible();
    expect(recordSetupStepAction).toHaveBeenLastCalledWith(8);
  });

  it("asks a goal what Goals asks, takes any number of them, and lets an unsaved one go again", () => {
    const { container } = render(
      <OnboardingManager
        goals={[]}
        profile={atStep(
          { ...namedProfile(), sports: ["Cycling", "Running"] },
          7,
        )}
      />,
    );
    const remove = () =>
      screen.queryAllByRole("button", { name: "Remove this goal" });
    const add = () =>
      fireEvent.click(screen.getByRole("button", { name: "Add another goal" }));

    // The first goal must be given; nothing else is asked for firmly.
    expect(screen.getByLabelText("Goal title")).toBeRequired();
    expect(screen.getByLabelText("Desired outcome")).toBeRequired();
    expect(remove()).toHaveLength(0);
    // Not limited to three: that is the limit on core goals, which Goals'
    // own rule keeps.
    add();
    add();
    add();
    expect(screen.getAllByLabelText("Goal title")).toHaveLength(4);
    expect(remove()).toHaveLength(4);
    fireEvent.click(remove()[1]);
    expect(screen.getAllByLabelText("Goal title")).toHaveLength(3);

    // Its sports as on Goals: the owner's own offered from the first
    // letter, and nothing before one is typed.
    const sports = () => screen.getAllByLabelText("Sports");
    const goalSports = () =>
      container.querySelector<HTMLInputElement>(
        'input[name="goalActivities:0"]',
      );
    expect(screen.queryByRole("group", { name: "Suggestions" })).toBeNull();
    fireEvent.change(sports()[0], { target: { value: "r" } });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Suggestions" })).getByRole(
        "button",
        { name: "Running" },
      ),
    );
    expect(goalSports()).toHaveValue("Running");
    // Or one made up on the spot, which the save adds to the owner's sports.
    fireEvent.change(sports()[0], { target: { value: "  Stabwurf " } });
    expect(goalSports()).toHaveValue("Running, Stabwurf");

    // A goal with a title must name a sport too, whichever row it is in.
    expect(sports()[1]).not.toBeRequired();
    expect(sports()[2]).not.toBeRequired();
    fireEvent.change(screen.getAllByLabelText("Goal title")[2], {
      target: { value: "Bench press 80 kg" },
    });
    expect(sports()[2]).toBeRequired();

    // The target date is typed or picked from a calendar, and optional.
    const target = screen.getAllByRole("group", {
      name: "Target date (optional)",
    })[0];
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
    // Two choices side by side, and a new goal starts as core.
    expect(screen.getAllByRole("radio", { name: "Core" })[0]).toBeChecked();
  });

  it("keeps a refused goals screen as it was typed, with the ids of the rows that were saved", async () => {
    vi.mocked(saveSetupGoalsAction).mockImplementationOnce(
      async (previous) => ({
        status: "conflict",
        message:
          "At most three goals can be core. Make one of them supporting.",
        submission: previous.submission + 1,
        goalIds: [GOAL_ID, null],
      }),
    );
    const { container } = render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 7)} />,
    );
    fireEvent.change(screen.getByLabelText("Goal title"), {
      target: { value: "Run a marathon" },
    });
    fireEvent.submit(container.querySelector("form[data-goals]")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "At most three goals can be core",
    );
    expect(await screen.findByRole("alert")).toHaveFocus();
    // Still on the goals screen, with what was typed.
    expect(screen.getByRole("heading", { name: "Goals" })).toBeVisible();
    expect(screen.getByLabelText("Goal title")).toHaveValue("Run a marathon");
    // The row that went through is that goal now: pressing Next again edits
    // it and does not make it a second time.
    await waitFor(() =>
      expect(container.querySelector('input[name="goalId:0"]')).toHaveValue(
        GOAL_ID,
      ),
    );
  });

  it("asks how often with a number to step, and the days that are out as chips", async () => {
    const { container } = render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 8)} />,
    );

    const often = screen.getByLabelText("Sessions a week");
    expect(often).toHaveValue("");
    fireEvent.click(
      screen.getByRole("button", { name: "More: Sessions a week" }),
    );
    expect(often).toHaveValue("3");
    fireEvent.click(
      screen.getByRole("button", { name: "More: Sessions a week" }),
    );
    expect(often).toHaveValue("4");
    expect(
      new FormData(container.querySelector("form")!).getAll("part"),
    ).toEqual(["frequency"]);

    next();
    expect(await heading("Any days you can't train?")).toBeVisible();
    // Every day is free until it is tapped.
    const days = screen.getAllByRole("checkbox");
    expect(days.map((day) => day.getAttribute("value"))).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
    expect(days.every((day) => !(day as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Sunday" }));
    fireEvent.change(
      screen.getByLabelText("Anything else about your week (optional)"),
      { target: { value: "Mondays only after 18:00" } },
    );
    const sent = new FormData(container.querySelector("form")!);
    expect(sent.getAll("part")).toEqual(["days"]);
    expect(sent.getAll("unavailableDays")).toEqual(["sunday"]);
    expect(sent.get("availabilityNote")).toBe("Mondays only after 18:00");
  });

  it("asks what there is at home only of someone who trains there", async () => {
    // No Home among the places: the equipment screen is passed over, both
    // ways.
    const { rerender } = render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 10)} />,
    );
    expect(
      screen.getByRole("heading", { name: "Where can you train?" }),
    ).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Gym" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Gym" }));
    // A place of the owner's own joins the list, ticked.
    fireEvent.change(screen.getByLabelText("Add another place"), {
      target: { value: "Company gym" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("checkbox", { name: "Company gym" })).toBeChecked();
    next();
    expect(await heading("Anything your coach should know?")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Step 12 of 12, 92% done",
    );
    back();
    expect(await heading("Where can you train?")).toBeVisible();

    // With Home saved, the same Next leads to the equipment.
    rerender(
      <OnboardingManager
        goals={[]}
        profile={atStep(
          {
            ...namedProfile(),
            training: { ...namedProfile().training, trainingPlaces: ["Home"] },
          },
          10,
        )}
      />,
    );
    next();
    expect(await heading("What do you have at home?")).toBeVisible();
    expect(screen.getByRole("group", { name: "Weights" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Dumbbells" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /bike$/i })).toBeNull();
  });

  it("offers what to write about on the last screen, a field for each tap", async () => {
    const { container } = render(
      <OnboardingManager goals={[]} profile={atStep(namedProfile(), 12)} />,
    );
    const form = () => new FormData(container.querySelector("form")!);
    const tap = (name: string) =>
      fireEvent.click(screen.getByRole("button", { name }));

    expect(
      screen.getByRole("heading", { name: "Anything your coach should know?" }),
    ).toBeVisible();
    expect(screen.getByText(/A few words are enough/)).toBeVisible();
    // Says who reads it, and stays non-diagnostic.
    expect(
      screen.getByText(/Your coach reads what you write here/),
    ).toBeVisible();
    expect(screen.getByText(/cannot assess or diagnose/)).toBeVisible();
    // Nothing to fill in until a prompt is tapped.
    expect(screen.queryByRole("textbox")).toBeNull();
    for (const prompt of [
      "An old injury",
      "A health condition to consider",
      "What I enjoy",
      "What I can't stand",
      "My training background",
      "Why I'm doing this",
      "My job and daily routine",
      "Other preference",
      "Other limitation",
    ]) {
      expect(screen.getByRole("button", { name: prompt })).toBeVisible();
    }

    tap("An old injury");
    const first = await screen.findByLabelText("An old injury");
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.change(first, { target: { value: "Left knee, 2019" } });
    // Any prompt can be tapped again for another field.
    tap("An old injury");
    tap("What I enjoy");
    expect(screen.getAllByLabelText("An old injury")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("What I enjoy"), {
      target: { value: "Long runs outdoors" },
    });
    expect(form().getAll("noteKind")).toEqual(["injury", "injury", "enjoy"]);
    expect(form().getAll("noteText")).toEqual([
      "Left knee, 2019",
      "",
      "Long runs outdoors",
    ]);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove: An old injury" })[1],
    );
    expect(form().getAll("noteKind")).toEqual(["injury", "enjoy"]);
    // The last screen's button finishes setup.
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

    // No more fields than the coach has room for.
    await act(async () => {
      for (let count = 2; count < 12; count += 1) tap("Other preference");
    });
    expect(screen.getAllByRole("textbox")).toHaveLength(12);
    expect(
      screen.getByRole("button", { name: "An old injury" }),
    ).toBeDisabled();
  });

  it("shows the whole training setup on Settings, equipment only with Home", () => {
    const { container } = render(
      <TrainingSetupForm
        training={{
          sessionsPerWeek: 4,
          unavailableDays: ["sunday"],
          availabilityNote: null,
          trainingPlaces: ["Gym"],
          homeEquipment: ["Mat"],
        }}
      />,
    );
    const parts = () =>
      new FormData(container.querySelector("form")!).getAll("part");

    expect(screen.getByLabelText("Sessions a week")).toHaveValue("4");
    expect(screen.getByRole("checkbox", { name: "Sunday" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Gym" })).toBeChecked();
    // Not named as a part without Home, so what was saved for it is kept.
    expect(screen.queryByRole("checkbox", { name: "Mat" })).toBeNull();
    expect(parts()).toEqual(["frequency", "days", "places"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Home" }));
    expect(screen.getByRole("checkbox", { name: "Mat" })).toBeChecked();
    expect(parts()).toEqual(["frequency", "days", "places", "equipment"]);
    expect(
      screen.getByRole("button", { name: "Save training setup" }),
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
});

const GOAL_ID = "70000000-0000-4000-8000-000000000001";

function savedGoal(): SetupGoalView {
  return {
    id: GOAL_ID,
    title: "10k under 48 minutes",
    desiredOutcome: "Run it in autumn.",
    sports: ["Running", "Hiking"],
    targetDate: "2026-11-15",
    priorityTier: "supporting",
  };
}

/** Setup begun and standing on `step`; null for one that was never begun. */
function atStep(
  profile: ProfileDetailsView,
  step: number | null,
): ProfileDetailsView {
  return { ...profile, setup: { step, finished: false, skipped: false } };
}

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
    training: {
      sessionsPerWeek: null,
      unavailableDays: [],
      availabilityNote: null,
      trainingPlaces: [],
      homeEquipment: [],
    },
    setup: { step: 1, finished: false, skipped: false },
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
