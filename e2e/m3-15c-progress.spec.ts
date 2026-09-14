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

test.describe("M3-15C progress", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("reads one month of the record and one completion beside its snapshot at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);
    const today = ownerDate(0);
    const thisMonth = today.slice(0, 7);
    const previousMonth = shiftMonth(thisMonth, -1);

    try {
      await signIn(page, account.email, account.password);

      // ---- The plan needs the owner's zone before any date exists. ----
      await page.goto("/home/plan");
      await page.getByRole("button", { name: `Use ${TIMEZONE}` }).click();
      // `Plan ahead.` is rendered above the zone fork, so it is already on
      // screen when the click is dispatched and waiting on it would resolve
      // instantly - leaving the next navigation to abort the in-flight
      // action. The plan window cannot exist until the zone is stored, so
      // that is what this waits for.
      await expect(page.locator("[data-plan-date]").first()).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Confirm your time zone" }),
      ).toHaveCount(0);

      // ---- An owner who has logged nothing is told so in its own words. ----
      const first = await page.goto("/home/progress");
      expect(first?.status()).toBe(200);
      expect(first?.headers()["cache-control"]).toContain("private");
      expect(first?.headers()["cache-control"]).toContain("no-store");
      await expect(
        page.getByRole("heading", { name: "Progress." }),
      ).toBeVisible();
      await expect(page.locator('[data-progress-empty="never"]')).toContainText(
        "Your record starts here.",
      );
      // The first-run sentence and the empty-month sentence are two different
      // facts and never appear together.
      await expect(page.locator('[data-progress-empty="month"]')).toHaveCount(
        0,
      );
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15C-first-run-390x844.png"),
      });

      // ---- Arrange one planned session and log two kinds of training. ----
      await page.goto("/home/plan");
      await addSession(
        page,
        today,
        "Tempo run",
        "Running",
        "55",
        "Six by three minutes.",
      );

      await page.goto("/home/today");
      await todayCard(page, "Tempo run")
        .getByRole("link", { name: "Log this session" })
        .click();
      await page.getByRole("radio", { name: /^Completed/ }).check();
      await page.getByLabel("Duration (minutes)").fill("42");
      await page.getByLabel("Effort (1-10)").fill("7");
      await page.getByLabel("How it felt").selectOption("good");
      await page
        .getByLabel("Note", { exact: true })
        .fill("Held the pace to the last rep.");
      await page.getByLabel("I felt pain").check();
      await page.getByRole("button", { name: "Save log" }).click();
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to that day" }).click();

      await page.getByRole("link", { name: "Log unplanned training" }).click();
      await page.getByLabel("Title", { exact: true }).fill("Sunrise swim");
      await page.getByLabel("Sport", { exact: true }).fill("Swimming");
      await page.getByLabel("Duration (minutes)").fill("30");
      await page.getByRole("button", { name: "Save log" }).click();
      await expect(
        page.getByRole("heading", { name: "Log saved." }),
      ).toBeVisible();

      // ---- The month shows both, each with what the owner recorded. ----
      await page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Progress" })
        .click();
      await expect(
        page.locator(`[data-progress-month="${thisMonth}"]`),
      ).toBeVisible();
      await expect(page.locator("[data-progress-entry]")).toHaveCount(2);

      const planned = progressEntry(page, "Tempo run");
      await expect(
        planned.getByText("Completed", { exact: true }),
      ).toBeVisible();
      await expect(planned.getByText("Running", { exact: true })).toBeVisible();
      await expect(planned.getByText("42 min")).toBeVisible();
      await expect(planned.getByText("7 of 10")).toBeVisible();
      await expect(planned.getByText("Good", { exact: true })).toBeVisible();
      await expect(
        planned.getByText("Held the pace to the last rep."),
      ).toBeVisible();
      await expect(planned.getByText(/You reported: Pain/)).toBeVisible();

      // Unplanned training carries its own title and sport, never a placeholder.
      const unplanned = progressEntry(page, "Sunrise swim");
      await expect(
        unplanned.getByText("Unplanned", { exact: true }),
      ).toBeVisible();
      await expect(
        unplanned.getByText("Swimming", { exact: true }),
      ).toBeVisible();
      await expect(unplanned.getByText("Unplanned training")).toHaveCount(0);
      // The product decision of 31 August 2026: a record, not a summary.
      // Nothing on this surface totals, counts, ranks, or streaks.
      for (const summarized of [/total/i, /streak/i, /average/i]) {
        await expect(page.getByText(summarized)).toHaveCount(0);
      }
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15C-month-390x844.png"),
      });

      // ---- One completion, beside the plan it was measured against. ----
      await planned.getByRole("link", { name: "Tempo run" }).click();
      await expect(
        page.getByRole("heading", { name: "One session." }),
      ).toBeVisible();
      const recordUrl = page.url();
      expect(recordUrl).toMatch(/\/home\/progress\/[0-9a-f-]{36}$/);

      const recorded = page.locator('[data-progress-sheet="recorded"]');
      await expect(
        recorded.getByRole("heading", { name: "Tempo run" }),
      ).toBeVisible();
      await expect(
        recorded.getByText("Completed", { exact: true }),
      ).toBeVisible();
      await expect(recorded.getByText("42 min")).toBeVisible();
      await expect(recorded.getByText(TIMEZONE)).toBeVisible();
      await expect(recorded.getByText(/You reported: Pain/)).toBeVisible();

      const carbon = page.locator('[data-progress-sheet="planned"]');
      await expect(carbon.getByText("Carbon copy")).toBeVisible();
      await expect(
        carbon.getByRole("heading", { name: "Tempo run" }),
      ).toBeVisible();
      await expect(carbon.getByText("55 min")).toBeVisible();
      await expect(carbon.getByText("Six by three minutes.")).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15C-one-session-390x844.png"),
      });

      // ---- Editing the plan afterwards does not touch the copy. ----
      await page.goto("/home/plan");
      const card = planCard(page, today, "Tempo run");
      await openDisclosure(card, "Edit");
      await disclosure(card, "Edit")
        .getByLabel("Title", { exact: true })
        .fill("Renamed after the fact");
      await disclosure(card, "Edit")
        .getByRole("button", { name: "Save session" })
        .click();
      await expect(
        planDay(page, today).getByRole("heading", {
          name: "Renamed after the fact",
          exact: true,
        }),
      ).toBeVisible();

      await page.goto(recordUrl);
      // The whole of F-005 Review history step 4: the snapshot is the
      // completion's own stored copy, so the plan's new title cannot reach it.
      await expect(
        carbon.getByRole("heading", { name: "Tempo run" }),
      ).toBeVisible();
      await expect(page.getByText("Renamed after the fact")).toHaveCount(0);
      await page.screenshot({
        fullPage: true,
        path: path.join(
          evidenceDirectory,
          "M3-15C-snapshot-unmoved-390x844.png",
        ),
      });

      // ---- Paging months, and a month with nothing logged in it. ----
      await page.getByRole("link", { name: /Back to/ }).click();
      await expect(
        page.locator(`[data-progress-month="${thisMonth}"]`),
      ).toBeVisible();
      await page.getByRole("link", { name: /Previous month/ }).click();
      await expect(
        page.locator(`[data-progress-month="${previousMonth}"]`),
      ).toBeVisible();
      await expect(page.locator('[data-progress-empty="month"]')).toContainText(
        "Nothing was logged in",
      );
      await expect(page.locator('[data-progress-empty="never"]')).toHaveCount(
        0,
      );
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15C-empty-month-390x844.png"),
      });
      await page.getByRole("link", { name: "Back to this month" }).click();
      await expect(page.locator("[data-progress-entry]")).toHaveCount(2);
      await page.getByRole("link", { name: /Next month/ }).click();
      await expect(
        page.locator(`[data-progress-month="${shiftMonth(thisMonth, 1)}"]`),
      ).toBeVisible();

      // ---- A record that is not yours reads exactly like one that is gone. ----
      const unowned = await page.goto(`/home/progress/${crypto.randomUUID()}`);
      expect(unowned?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "That record is not there." }),
      ).toBeVisible();
      const unownedCopy = await page
        .locator('[data-progress-state="no-completion"]')
        .innerText();

      const missing = await page.goto("/home/progress/not-a-uuid");
      // The same status and the same words: nothing here tells one owner
      // that another owner's record exists.
      expect(missing?.status()).toBe(unowned?.status());
      const missingCopy = await page
        .locator('[data-progress-state="no-completion"]')
        .innerText();
      expect(missingCopy).toBe(unownedCopy);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15C-not-found-390x844.png"),
      });

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m3-15c-final-390x844.png"),
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

function shiftMonth(month: string, months: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

/** One entry in the month, found by the only thing the owner can see. */
function progressEntry(page: Page, title: string) {
  return page
    .locator("[data-progress-entry]")
    .filter({ has: page.getByRole("link", { name: title }) });
}

function planDay(page: Page, date: string) {
  return page.locator(`[data-plan-date="${date}"]`);
}

function planCard(page: Page, date: string, title: string) {
  return planDay(page, date)
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

/** One card on Today, found by its title. */
function todayCard(page: Page, title: string) {
  return page
    .locator("[data-today-session]")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
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
  minutes: string,
  intent: string,
) {
  const details = disclosure(page.locator("body"), "Create session");
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
  await details.getByLabel("Date").fill(date);
  await details.getByLabel("Title", { exact: true }).fill(title);
  await details.getByLabel("Sport", { exact: true }).fill(sport);
  await details.getByLabel("Minutes", { exact: true }).fill(minutes);
  await details.getByLabel("Intent", { exact: true }).fill(intent);
  await details.getByRole("button", { name: "Create session" }).click();
  await expect(
    planDay(page, date).getByRole("heading", { name: title, exact: true }),
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
  const email = `fittip-m3-15c-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
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
