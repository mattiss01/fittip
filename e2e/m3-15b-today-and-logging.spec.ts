import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import path from "node:path";

const evidenceDirectory = path.join(
  process.cwd(),
  "docs",
  "validation",
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
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();

      await addSession(page, today, "Tempo run", "Running");
      await addSession(page, today, "Easy spin", "Cycling");
      await addSession(page, today, "Core circuit", "Strength");
      await addSession(page, today, "Rest swap", "Yoga");
      await addSession(page, tomorrow, "Long ride", "Cycling");
      await addSeries(page, today, tomorrow, "Aerobic base", "Running");

      await planCard(page, today, "Core circuit")
        .getByRole("button", { name: "Lock", exact: true })
        .click();
      await expect(
        planCard(page, today, "Core circuit").getByText("Locked", {
          exact: true,
        }),
      ).toBeVisible();

      const doomed = planCard(page, today, "Rest swap");
      await openDisclosure(doomed, "Cancel");
      await doomed.getByRole("button", { name: "Cancel session" }).click();
      await expect(
        planCard(page, today, "Rest swap").getByText(
          "Yoga · Cancelled, kept on the record",
        ),
      ).toBeVisible();

      await planDay(page, dayAfter)
        .getByRole("button", { name: "Mark recovery day" })
        .click();
      await expect(
        planDay(page, dayAfter).getByRole("button", {
          name: "Clear recovery day",
        }),
      ).toBeVisible();

      // ---- Today shows exactly that day, and says which day it is. ----
      const response = await page.goto("/home/today");
      expect(response?.status()).toBe(200);
      expect(response?.headers()["cache-control"]).toContain("private");
      expect(response?.headers()["cache-control"]).toContain("no-store");
      await expect(page.getByRole("heading", { name: "Today." })).toBeVisible();
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
      await page.goto(`/home/today?date=${ownerDate(14)}`);
      await expect(
        page.locator('[data-today-notice="beyond-window"]'),
      ).toContainText("unfilled rather than empty");
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
      await expect(
        page.getByRole("heading", { name: "Log training." }),
      ).toBeVisible();
      await expect(page.locator("[data-log-source]")).toContainText(
        "Tempo run",
      );
      // The conservative signal handling AGENTS.md requires, in the wording
      // M1-03 approved and M2-02 shipped.
      await expect(
        page.getByText(/stop training and speak to a qualified/),
      ).toBeVisible();
      await page.getByRole("radio", { name: /^Completed/ }).check();
      await page.getByLabel("Duration (minutes)").fill("42");
      await page.getByLabel("Effort (1-10)").fill("7");
      await page.getByLabel("How it felt").selectOption("good");
      await page.getByLabel("Note").fill("Held the pace to the last rep.");
      await page.getByLabel("I felt pain").check();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-log-form-390x844.png"),
      });
      await page.getByRole("button", { name: "Save log" }).click();
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

      // ---- Skip is a completion status, written the same way. ----
      await todayCard(page, "Easy spin")
        .getByRole("link", { name: "Log this session" })
        .click();
      await expect(page.getByLabel("Duration (minutes)")).toBeVisible();
      await page.getByRole("radio", { name: /^Skipped/ }).check();
      // Training that did not happen has no duration, no effort and no way it
      // felt, so it is not asked for them.
      await expect(page.getByLabel("Duration (minutes)")).toHaveCount(0);
      await expect(page.getByLabel("Effort (1-10)")).toHaveCount(0);
      await expect(page.getByLabel("How it felt")).toHaveCount(0);
      // An owner may skip precisely because of pain: the note, the four
      // signals and the notice that qualifies them all stay.
      await expect(page.getByLabel("Note", { exact: true })).toBeVisible();
      for (const signal of [
        "I felt pain",
        "I was ill",
        "I was injured",
        "I was severely fatigued",
      ]) {
        await expect(page.getByLabel(signal, { exact: true })).toBeVisible();
      }
      await expect(
        page.getByText(/stop training and speak to a qualified/),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-skip-form-390x844.png"),
      });
      await page.getByRole("button", { name: "Save log" }).click();
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
      await expect(page.locator("[data-log-fixed-outcome]")).toContainText(
        "no planned session attached",
      );
      await page.getByLabel("Title", { exact: true }).fill("Sunrise swim");
      await page.getByLabel("Sport", { exact: true }).fill("Swimming");
      await page.getByLabel("Duration (minutes)").fill("30");
      await page
        .getByLabel("Note", { exact: true })
        .fill("Walked the long way home.");
      await page.getByRole("button", { name: "Save log" }).click();
      await page.getByRole("link", { name: "Back to that day" }).click();

      const unplanned = page.locator("[data-today-completion]");
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

      // Reopening shows both, and offers to change neither: the write
      // function refuses an activity list on an edit.
      await unplanned.getByRole("link", { name: "Edit log" }).click();
      const naming = page.locator("[data-log-fixed-naming]");
      await expect(naming).toContainText("Sunrise swim");
      await expect(naming).toContainText("Swimming");
      await expect(naming).toContainText("cannot be changed yet");
      await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Sport", { exact: true })).toHaveCount(0);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15B-unplanned-edit-390x844.png"),
      });
      await page.getByRole("link", { name: "Cancel" }).click();
      await expect(page.locator(`[data-today-date="${today}"]`)).toBeVisible();

      // ---- A mistaken log is corrected, including to skipped. ----
      await todayCard(page, "Tempo run")
        .getByRole("link", { name: "Edit log" })
        .click();
      await expect(page.locator("[data-log-source]")).toContainText(
        "Editing a log",
      );
      await expect(page.getByLabel("Duration (minutes)")).toHaveValue("42");
      await expect(page.locator("[data-log-clears]")).toHaveCount(0);
      await page.getByRole("radio", { name: /^Skipped/ }).check();
      await expect(page.getByLabel("Duration (minutes)")).toHaveCount(0);
      await expect(page.locator("[data-log-clears]")).toContainText(
        "removes the duration, the effort and how it felt",
      );
      await page.getByRole("button", { name: "Save log" }).click();
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

      // ---- The end_series receipt now reports a completed survivor. ----
      await todayCard(page, "Aerobic base")
        .getByRole("link", { name: "Log this session" })
        .click();
      await page.getByRole("radio", { name: /^Completed/ }).check();
      await page.getByRole("button", { name: "Save log" }).click();
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();

      await page.goto("/home/plan");
      const occurrence = planCard(page, today, "Aerobic base");
      await openDisclosure(occurrence, "Cancel");
      await scope(occurrence, "This and all future sessions")
        .last()
        .getByRole("button", { name: "Remove this and all future sessions" })
        .click();
      const receipt = page
        .getByRole("status")
        .filter({ hasText: "Future recurring sessions removed permanently" });
      await expect(receipt).toContainText(/\d+ locked kept/);
      await expect(receipt).toContainText("1 completed kept");
      await page.screenshot({
        fullPage: true,
        path: path.join(
          evidenceDirectory,
          "M3-15B-completed-survivor-390x844.png",
        ),
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

function planDay(page: Page, date: string) {
  return page.locator(`[data-plan-date="${date}"]`);
}

function planCard(page: Page, date: string, title: string) {
  return planDay(page, date)
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
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

function disclosure(container: Locator, label: string) {
  return container.locator("details").filter({
    has: container.page().locator(":scope > summary", { hasText: label }),
  });
}

async function openDisclosure(container: Locator, label: string) {
  const details = disclosure(container, label);
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
}

async function addSession(
  page: Page,
  date: string,
  title: string,
  sport: string,
) {
  const details = disclosure(page.locator("body"), "Create session");
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
  await details.getByLabel("Date").fill(date);
  await details.getByLabel("Title").fill(title);
  await details.getByLabel("Sport").fill(sport);
  await details.getByRole("button", { name: "Create session" }).click();
  await expect(
    planDay(page, date).getByRole("heading", { name: title, exact: true }),
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
  const details = disclosure(page.locator("body"), "Create session");
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
  await details.getByLabel("Date").fill(startDate);
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
    planDay(page, startDate).getByRole("heading", { name: title, exact: true }),
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
