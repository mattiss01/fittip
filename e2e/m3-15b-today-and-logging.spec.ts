import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import path from "node:path";

import { changeLogAnswer, logInSteps, logStep } from "./support/log-steps";
import {
  openNewSession,
  planDay,
  toggleRecoveryDay,
} from "./support/plan-week";

const evidenceDirectory = path.join(
  process.cwd(),
  "test-results",
  "M3",
  "evidence",
);

const TIMEZONE = "Europe/Berlin";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("M3-15B today and logging", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("pages one owner-local day, logs, skips, and corrects at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);
    const today = ownerDate(0);
    const tomorrow = ownerDate(1);
    const dayAfter = ownerDate(2);

    try {
      await signIn(page, account.email, account.password);

      // ---- Arrange one day carrying every kind of plan content. ----
      await page.goto("/home/plan");
      await page.getByRole("button", { name: `Use ${TIMEZONE}` }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Plan", exact: true }),
      ).toBeVisible();

      await addSession(page, today, "Tempo run", "Running");
      await addSession(page, today, "Easy spin", "Cycling");
      await addSession(page, today, "Core circuit", "Strength");
      await addSession(page, today, "Rest swap", "Yoga");
      await addSession(page, tomorrow, "Long ride", "Cycling");
      await addSession(page, today, "Easy jog", "Running");
      // Before the series: the create form keeps "Repeat" switched on after
      // one, and its activity rows reset with the form after every create.
      await addSessionWithActivity(
        page,
        today,
        "Serve and volley",
        "Tennis",
        "Serve practice",
      );
      await addSeries(page, today, tomorrow, "Aerobic base", "Running");

      // Plan verbs live on the session's own page since 29 Sep 2026.
      await openSession(page, today, "Core circuit");
      await chooseMore(page, "Lock");
      await expect(
        page.locator("article").getByText("Locked", { exact: true }),
      ).toBeVisible();
      await backToPlan(page);
      await expect(
        (await planCard(page, today, "Core circuit")).getByText("Locked", {
          exact: true,
        }),
      ).toBeVisible();

      await openSession(page, today, "Rest swap");
      await chooseMore(page, "Cancel session");
      await page
        .locator('[data-session-panel="Cancel session"]')
        .getByRole("button", { name: "Cancel session" })
        .click();
      await expect(
        page.getByRole("button", { name: "Reactivate" }),
      ).toBeVisible();
      await backToPlan(page);
      await expect(
        (await planCard(page, today, "Rest swap")).getByText("Cancelled", {
          exact: true,
        }),
      ).toBeVisible();

      await toggleRecoveryDay(page, dayAfter);
      await expect(await planDay(page, dayAfter)).toHaveAttribute(
        "data-recovery",
        "true",
      );

      // ---- Today shows exactly that day, and says which day it is. ----
      const response = await page.goto("/home/today");
      expect(response?.status()).toBe(200);
      expect(response?.headers()["cache-control"]).toContain("private");
      expect(response?.headers()["cache-control"]).toContain("no-store");
      await expect(
        page.getByRole("heading", { name: "Today", exact: true }),
      ).toBeVisible();
      await expect(page.locator(`[data-today-date="${today}"]`)).toBeVisible();

      for (const title of [
        "Tempo run",
        "Easy spin",
        "Core circuit",
        "Rest swap",
        "Aerobic base",
      ]) {
        await expect(todayCard(page, title)).toBeVisible();
      }
      await expect(
        todayCard(page, "Core circuit").getByText("Locked", { exact: true }),
      ).toBeVisible();
      await expect(
        todayCard(page, "Rest swap").getByText("Cancelled, kept on the record"),
      ).toBeVisible();
      await expect(
        todayCard(page, "Aerobic base").getByText("Recurring", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-today-390x844.png"),
      });

      // ---- Paging moves one day at a time and comes back. ----
      await page.getByRole("link", { name: /Next day/ }).click();
      await expect(
        page.locator(`[data-today-date="${tomorrow}"]`),
      ).toBeVisible();
      await expect(todayCard(page, "Long ride")).toBeVisible();
      await page.getByRole("link", { name: /Next day/ }).click();
      await expect(
        page.locator(`[data-today-date="${dayAfter}"]`),
      ).toBeVisible();
      await expect(page.getByText("Recovery day")).toBeVisible();
      await expect(
        page.getByText("Nothing is planned on this day."),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to today" }).click();
      await expect(page.locator(`[data-today-date="${today}"]`)).toBeVisible();

      await page.getByRole("link", { name: /Previous day/ }).click();
      await expect(
        page.locator(`[data-today-date="${ownerDate(-1)}"]`),
      ).toBeVisible();
      await expect(
        page.getByText("Nothing was planned on this day."),
      ).toBeVisible();

      // A date past the materialization window is unfilled, never empty.
      await page.goto(`/home/today?date=${ownerDate(91)}`);
      await expect(
        page.locator('[data-today-notice="beyond-window"]'),
      ).toContainText("repeats are not on it yet");
      await expect(page.locator('[data-today-empty="sessions"]')).toHaveCount(
        0,
      );
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-unfilled-day-390x844.png"),
      });

      // ---- Log a planned session. ----
      await page.goto("/home/today");
      await todayCard(page, "Tempo run")
        .getByRole("link", { name: "Log this session" })
        .click();
      await expect(page.locator("[data-log-source]")).toContainText(
        "Tempo run",
      );
      // Logging in steps (owner, 3 Oct 2026): one question at a time.
      await expect(
        page.getByRole("heading", { name: "What did you do?" }),
      ).toBeVisible();
      await logInSteps(
        page,
        {
          outcome: "Completed",
          minutes: "42",
          effort: 7,
          feeling: "Good",
          signals: ["I felt pain"],
          note: "Held the pace to the last rep.",
        },
        { save: false },
      );
      // A new log ends on its summary, every answer with its own Change.
      const answers = logStep(page, "summary");
      await expect(answers).toContainText("42 min");
      await expect(answers).toContainText("7 of 10");
      await expect(answers).toContainText("I felt pain");
      // The conservative signal handling CLAUDE.md requires, in the wording
      // M1-03 approved and M2-02 shipped, on the question it qualifies.
      await changeLogAnswer(page, "Anything off");
      await expect(
        logStep(page, "off").getByText(
          /stop training and speak to a qualified/,
        ),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-log-form-390x844.png"),
      });
      await logStep(page, "off")
        .getByRole("button", { name: "Back to summary" })
        .click();
      await answers.getByRole("button", { name: "Save log" }).click();
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();

      const logged = todayCard(page, "Tempo run");
      await expect(
        logged.getByText("Completed", { exact: true }),
      ).toBeVisible();
      await expect(logged.getByText("42 min")).toBeVisible();
      // Recorded here so the later assertion that a skip removes all three is
      // about something that was actually there.
      await expect(logged.getByText("7 of 10")).toBeVisible();
      await expect(logged.getByText("Good", { exact: true })).toBeVisible();
      await expect(logged.getByText(/You reported: Pain/)).toBeVisible();
      await expect(
        logged.getByRole("link", { name: "Log this session" }),
      ).toHaveCount(0);

      // ---- A4bc: per-activity actuals, the log's own name, a correction. ----
      // The row is unmeasured, which every activity validator refused until
      // A4bc: nothing in this flow logged a session carrying one before.
      await todayCard(page, "Serve and volley")
        .getByRole("link", { name: "Log this session" })
        .click();
      const serves = () =>
        page
          .locator("[data-log-activity]")
          .filter({ hasText: "Serve practice" });
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        "Serve and volley",
      );
      await logInSteps(page, {
        title: "Serve and return",
        activities: async () => {
          await expect(serves().getByText("Planned: no target")).toBeVisible();
          await expect(serves().getByText("Did: not measured")).toBeVisible();
        },
      });
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();

      // The plan keeps its own name: the card is still found by it.
      await todayCard(page, "Serve and volley")
        .getByRole("link", { name: "Edit log" })
        .click();
      await expect(page.locator("[data-log-source]")).toContainText(
        "Serve and return",
      );
      // A correction opens on the summary; Change opens the one answer.
      await changeLogAnswer(page, "Activities");
      await serves().getByRole("button", { name: "Adjust" }).click();
      await serves()
        .getByLabel("Measured as")
        .selectOption("duration_intensity");
      await serves().getByLabel("Minutes").fill("20");
      await logStep(page, "activities")
        .getByRole("button", { name: "Back to summary" })
        .click();
      await logStep(page, "summary")
        .getByRole("button", { name: "Save log" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Log updated." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();
      await todayCard(page, "Serve and volley")
        .getByRole("link", { name: "Edit log" })
        .click();
      await changeLogAnswer(page, "Activities");
      await expect(serves().getByText("Did: 20 min")).toBeVisible();
      await expect(serves().getByText("Planned: no target")).toBeVisible();
      await page.goto("/home/today");

      // ---- A4d: replaced points at what replaced it. ----
      // Logged inline: one save writes the replaced log and the ride.
      await todayCard(page, "Core circuit")
        .getByRole("link", { name: "Log this session" })
        .click();
      await logInSteps(page, {
        outcome: "Replaced",
        replaced: async () => {
          const instead = logStep(page, "replaced");
          await expect(instead.getByLabel("Log it now")).toBeChecked();
          await instead.getByLabel("Title of what you did").fill("Hill ride");
          await instead.getByLabel("Sport of what you did").fill("Cycling");
          await instead.getByLabel("Duration (minutes)").fill("70");
        },
      });
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();
      await expect(
        todayCard(page, "Core circuit").locator("[data-replaced-by]"),
      ).toContainText("Instead: Hill ride (Cycling)");

      // Picked: the same ride stands for a second session.
      await todayCard(page, "Easy jog")
        .getByRole("link", { name: "Log this session" })
        .click();
      await logInSteps(page, {
        outcome: "Replaced",
        replaced: async () => {
          const instead = logStep(page, "replaced");
          await instead.getByLabel("I already logged it").check();
          await expect(instead.getByLabel("Which training")).toContainText(
            "Hill ride · Cycling",
          );
        },
      });
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();
      await expect(
        todayCard(page, "Easy jog").locator("[data-replaced-by]"),
      ).toContainText("Instead: Hill ride (Cycling)");

      // ---- Skip is a completion status, written the same way. ----
      await todayCard(page, "Easy spin")
        .getByRole("link", { name: "Log this session" })
        .click();
      await logStep(page, "what")
        .getByRole("button", { name: "Next", exact: true })
        .click();
      await logStep(page, "outcome")
        .getByRole("button", { name: /^Skipped/ })
        .click();
      // Training that did not happen has no duration, no effort and no way it
      // felt, so it is not asked for them: a skip goes straight to "Anything
      // off?", since an owner may skip precisely because of pain. The four
      // signals, the notice that qualifies them, and the note all stay.
      await expect(
        page.getByRole("heading", { name: "Anything off?" }),
      ).toBeVisible();
      await expect(page.locator("#log-duration")).toHaveCount(0);
      await expect(logStep(page, "effort")).toHaveCount(0);
      await expect(logStep(page, "feeling")).toHaveCount(0);
      await expect(page.locator("#log-note")).toHaveCount(1);
      for (const signal of [
        "I felt pain",
        "I was ill",
        "I was injured",
        "I was severely fatigued",
      ]) {
        await expect(
          page.getByRole("button", { name: signal, exact: true }),
        ).toBeVisible();
      }
      await expect(
        page.getByText(/stop training and speak to a qualified/),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-skip-form-390x844.png"),
      });
      await logInSteps(page);
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();
      await expect(
        todayCard(page, "Easy spin").getByText("Skipped", { exact: true }),
      ).toBeVisible();
      // The plan was not touched: the session is still planned, not cancelled.
      await expect(
        todayCard(page, "Easy spin").getByText("Cancelled, kept on the record"),
      ).toHaveCount(0);

      // ---- Unplanned training has its own entry. ----
      await page.getByRole("link", { name: "Log unplanned training" }).click();
      // Unplanned training has one outcome, so "How did it go?" is not asked.
      await expect(logStep(page, "outcome")).toHaveCount(0);
      await logInSteps(page, {
        title: "Sunrise swim",
        sport: "Swimming",
        minutes: "30",
        note: "Walked the long way home.",
      });
      await page.getByRole("link", { name: "Back to that day" }).click();

      // The ride that replaced two sessions is unplanned training too; this
      // one is the swim.
      const unplanned = page
        .locator("[data-today-completion]")
        .filter({ hasNotText: "Hill ride" });
      await expect(unplanned).toHaveCount(1);
      await expect(
        unplanned.getByRole("heading", { name: "Sunrise swim", exact: true }),
      ).toBeVisible();
      await expect(
        unplanned.getByText("Swimming", { exact: true }),
      ).toBeVisible();
      // The nameless card the owner objected to is gone, not merely joined.
      await expect(unplanned.getByText("Unplanned training")).toHaveCount(0);
      // "Unplanned" alone is the outcome stamp, which is a different fact.
      await expect(
        unplanned.getByText("Unplanned", { exact: true }),
      ).toBeVisible();

      // Reopening offers both for correction: unplanned training carries its
      // name as its one activity, so this is the only place that name lives.
      await unplanned.getByRole("link", { name: "Edit log" }).click();
      await expect(logStep(page, "summary")).toContainText(
        "Sunrise swim · Swimming",
      );
      await changeLogAnswer(page, "What");
      const title = page.getByLabel("Title", { exact: true });
      const sport = page.getByLabel("Sport", { exact: true });
      await expect(title).toHaveValue("Sunrise swim");
      await expect(sport).toHaveValue("Swimming");
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-unplanned-edit-390x844.png"),
      });

      // M3-23: a typo in what the owner called their own training used to be
      // permanent. Correcting it is an ordinary edit.
      await title.fill("Sunrise lake swim");
      await sport.fill("Open water");
      await logStep(page, "what")
        .getByRole("button", { name: "Back to summary" })
        .click();
      await logStep(page, "summary")
        .getByRole("button", { name: "Save log" })
        .click();
      await page.getByRole("link", { name: "Back to that day" }).click();
      await expect(page.locator(`[data-today-date="${today}"]`)).toBeVisible();
      await expect(
        unplanned.getByRole("heading", {
          name: "Sunrise lake swim",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        unplanned.getByText("Open water", { exact: true }),
      ).toBeVisible();

      // ---- A mistaken log is corrected, including to skipped. ----
      await todayCard(page, "Tempo run")
        .getByRole("link", { name: "Edit log" })
        .click();
      await expect(page.locator("[data-log-source]")).toHaveAttribute(
        "data-log-kind",
        "Editing a log",
      );
      const summary = logStep(page, "summary");
      await expect(summary).toContainText("42 min");
      await expect(page.locator("[data-log-clears]")).toHaveCount(0);
      await changeLogAnswer(page, "How it went");
      await logStep(page, "outcome")
        .getByRole("button", { name: /^Skipped/ })
        .click();
      await expect(page.locator("#log-duration")).toHaveCount(0);
      await expect(summary.locator("[data-log-clears]")).toContainText(
        "removes the duration, the effort and how it felt",
      );
      await summary.getByRole("button", { name: "Save log" }).click();
      await expect(
        page.getByRole("heading", { name: "Log updated." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();
      const corrected = todayCard(page, "Tempo run");
      await expect(
        corrected.getByText("Skipped", { exact: true }),
      ).toBeVisible();
      // The three the form stopped asking for are gone from the record.
      await expect(corrected.getByText("42 min")).toHaveCount(0);
      await expect(corrected.getByText("7 of 10")).toHaveCount(0);
      await expect(corrected.getByText("Good", { exact: true })).toHaveCount(0);
      // The note and the reported signal are facts about the owner, not about
      // a session that happened, so they survive.
      await expect(
        corrected.getByText("Held the pace to the last rep."),
      ).toBeVisible();
      await expect(corrected.getByText(/You reported: Pain/)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-logged-day-390x844.png"),
      });

      // ---- A logged occurrence is settled; its series ends from the next. ----
      await todayCard(page, "Aerobic base")
        .getByRole("link", { name: "Log this session" })
        .click();
      await logInSteps(page, { outcome: "Completed" });
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();

      // Owner, 3 Oct 2026: once logged, its log is what changes, not its
      // plan. The page offers Edit log and the copy actions, nothing more.
      await page.goto("/home/today");
      await todayCard(page, "Aerobic base")
        .getByRole("link", { name: "Aerobic base", exact: true })
        .click();
      await expect(
        page
          .locator("[data-session-actions]")
          .getByRole("link", { name: "Edit log" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Edit", exact: true }),
      ).toHaveCount(0);
      // The menu holds what a Progress record offers, and no plan verb.
      await page.getByRole("button", { name: "More actions" }).click();
      const menu = page.locator("[data-session-actions] li");
      await expect(menu.getByText("Save to library")).toBeVisible();
      await expect(menu.getByText("Delete")).toHaveCount(0);
      await page.keyboard.press("Escape");

      // Tomorrow's occurrence is not logged, so the series ends from there,
      // and today's logged one is kept.
      await page.goto(`/home/today?date=${tomorrow}`);
      await todayCard(page, "Aerobic base")
        .getByRole("link", { name: "Aerobic base", exact: true })
        .click();
      await chooseMore(page, "Delete");
      await scope(
        page.locator('[data-session-panel="Delete session"]'),
        "This and all future sessions",
      )
        .last()
        .getByRole("button", { name: "Delete this and all future sessions" })
        .click();
      await expect(page.locator(`[data-today-date="${tomorrow}"]`)).toBeVisible(
        { timeout: 30_000 },
      );
      await expect(todayCard(page, "Aerobic base")).toHaveCount(0);
      await page.goto("/home/today");
      await expect(todayCard(page, "Aerobic base")).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-series-ended-390x844.png"),
      });

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m3-15b-final-390x844.png"),
      });
      expect(pageErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

function ownerDate(offset: number) {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shifted = new Date(`${local}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

async function planCard(page: Page, date: string, title: string) {
  return (await planDay(page, date))
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

/** Opens a session's own page from its card on the Plan. */
async function openSession(page: Page, date: string, title: string) {
  await (await planCard(page, date, title))
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
}

/** Picks a verb from the session page's ⋯ menu. */
async function chooseMore(page: Page, label: string) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page
    .locator("[data-session-actions] li")
    .getByText(label, { exact: true })
    .click();
}

async function backToPlan(page: Page) {
  await page.locator("[data-back-link]").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Plan", exact: true }),
  ).toBeVisible();
}

/** One card on Today, found by the only thing the owner can see: its title. */
function todayCard(page: Page, title: string) {
  return page
    .locator("[data-today-session]")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function scope(container: Locator, heading: string) {
  return container.locator("section").filter({ hasText: heading });
}

async function addSession(
  page: Page,
  date: string,
  title: string,
  sport: string,
) {
  const details = await openNewSession(page, date);
  await details.getByLabel("Title").fill(title);
  await details.getByLabel("Sport").fill(sport);
  await details.getByRole("button", { name: "Create session" }).click();
  await expect(
    (await planDay(page, date)).getByRole("heading", {
      name: title,
      exact: true,
    }),
  ).toBeVisible();
}

/** A one-off session holding one activity, left unmeasured as it is added. */
async function addSessionWithActivity(
  page: Page,
  date: string,
  title: string,
  sport: string,
  activity: string,
) {
  const details = await openNewSession(page, date);
  await details.getByLabel("Title", { exact: true }).fill(title);
  // The session's own, filled before a row exists to carry a second "Sport".
  await details.getByLabel("Sport", { exact: true }).fill(sport);
  await details.getByRole("button", { name: "Add activity" }).click();
  await details
    .locator('[data-activity-row="0"]')
    .getByLabel("Name")
    .fill(activity);
  await details.getByRole("button", { name: "Create session" }).click();
  await expect(
    (await planDay(page, date)).getByRole("heading", {
      name: title,
      exact: true,
    }),
  ).toBeVisible();
}

/** A bounded daily rule, so the day under test carries a real occurrence. */
async function addSeries(
  page: Page,
  startDate: string,
  endDate: string,
  title: string,
  sport: string,
) {
  const details = await openNewSession(page, startDate);
  await details.getByLabel("Title").fill(title);
  await details.getByLabel("Sport").fill(sport);
  await details.getByLabel("Repeat this session").check();
  await details.getByLabel("Repeat", { exact: true }).selectOption("daily");
  await details.getByLabel("Every").fill("1");
  await details.getByText("No end date", { exact: true }).click();
  await details.getByLabel("End date", { exact: true }).fill(endDate);
  await details
    .getByRole("button", { name: "Review recurring sessions" })
    .click();
  await expect(
    page.getByRole("heading", { name: "First occurrences" }),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Create recurring sessions" })
    .click();
  await expect(
    (await planDay(page, startDate)).getByRole("heading", {
      name: title,
      exact: true,
    }),
  ).toBeVisible();
}

type LocalAccount = { email: string; password: string; userId: string };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home\/today$/);
}

async function createConfirmedLocalUser(
  request: APIRequestContext,
): Promise<LocalAccount> {
  const email = `fittip-m3-15b-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9`;
  const response = await request.post(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      data: { email, password, email_confirm: true },
    },
  );
  if (!response.ok()) {
    throw new Error(`Local Auth provisioning failed: ${response.status()}`);
  }
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new Error("Local Auth provisioning returned no user id.");
  return { email, password, userId: body.id };
}

async function deleteLocalUser(request: APIRequestContext, userId: string) {
  const response = await request.delete(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok()) {
    throw new Error(`Local Auth cleanup failed: ${response.status()}`);
  }
}
