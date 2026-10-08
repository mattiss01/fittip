import { expect, test, type Page } from "@playwright/test";

import { fillDate } from "./support/date-field";
import path from "node:path";

import {
  mondayOf,
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

test.describe("M3-12 manual continuous planning", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("plans, edits, moves, duplicates, locks and cancels at 390x844", async ({
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
    const recoveryDate = ownerDate(3);

    try {
      await signIn(page, account.email, account.password);

      const planResponse = await page.goto("/home/plan");
      expect(planResponse?.status()).toBe(200);
      const headers = lowerCaseHeaders(planResponse?.headers() ?? {});
      expect(headers["cache-control"]).toContain("no-store");
      expect(headers["cache-control"]).toContain("private");

      // The owner confirms the zone explicitly before anything can be planned.
      await expect(
        page.getByRole("heading", { name: "Confirm your time zone" }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-12-confirm-zone-390x844.png"),
      });
      await page.getByRole("button", { name: `Use ${TIMEZONE}` }).click();

      await expect(
        page.getByRole("heading", { level: 1, name: "Plan", exact: true }),
      ).toBeVisible();
      // One week at a time, from Monday (R3a). Nothing before owner-local
      // today can be added to.
      await expect(page.locator("[data-plan-date]")).toHaveCount(7);
      await expect(page.locator("[data-plan-date]").first()).toHaveAttribute(
        "data-plan-date",
        mondayOf(today),
      );
      await expect(
        (await planDay(page, today)).getByText("—", { exact: true }),
      ).toBeVisible();
      await expect(
        page.locator('[data-past="true"] button[aria-label^="Add to"]'),
      ).toHaveCount(0);
      // The weeks before this one are behind it, read-only (owner, 2 Oct
      // 2026): none of a past week's days can be added to.
      await page.getByRole("button", { name: "Previous week" }).click();
      await expect(
        page.getByRole("heading", { name: "Last week", exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-plan-date]")).toHaveCount(7);
      await expect(page.locator('button[aria-label^="Add to"]')).toHaveCount(0);
      await page.getByRole("button", { name: "Next week" }).click();
      await expect(
        page.getByRole("heading", { name: "This week", exact: true }),
      ).toBeVisible();

      await addSession(page, today, "Aerobic run", "Running", "60");
      await expect(
        (await sessionCard(page, today, "Aerobic run")).getByText("60 min"),
      ).toBeVisible();

      // R3b-3: a single session may sit up to 180 days out - a race months
      // away - though recurring sessions are written only thirteen weeks
      // ahead. A far day offers the session and not "Repeat this session".
      const raceDay = ownerDate(150);
      const far = await openNewSession(page, raceDay);
      await expect(far.getByLabel("Repeat this session")).toHaveCount(0);
      await far.getByLabel("Title").fill("Autumn race");
      await far.getByLabel("Sport").fill("Running");
      await far.getByRole("button", { name: "Create session" }).click();
      await expect(
        await sessionCard(page, raceDay, "Autumn race"),
      ).toBeVisible();
      // The month calendar is the way back from a far week: it marks the day
      // that holds the race, and choosing today shows this week again.
      await page.getByRole("button", { name: "Open calendar" }).click();
      const calendar = page.getByRole("dialog");
      // The sheet opens on the month most of the race's week is in, which is
      // not always the race's own: step to it either way.
      const shownMonth = await calendar
        .locator("[data-plan-month]")
        .getAttribute("data-plan-month");
      if (shownMonth !== raceDay.slice(0, 7)) {
        await calendar
          .getByRole("button", {
            name:
              (shownMonth ?? "") < raceDay.slice(0, 7)
                ? "Next month"
                : "Previous month",
          })
          .click();
      }
      await expect(
        calendar.locator(`[data-month-date="${raceDay}"]`),
      ).toHaveAccessibleName(/, 1 session$/);
      for (let step = 0; step < 8; step += 1) {
        if (
          (await calendar.locator(`[data-month-date="${today}"]`).count()) > 0
        ) {
          break;
        }
        await calendar.getByRole("button", { name: "Previous month" }).click();
      }
      await calendar.locator(`[data-month-date="${today}"]`).click();
      await expect(calendar).toBeHidden();
      await expect(
        page.getByRole("heading", { name: "This week", exact: true }),
      ).toBeVisible();
      await planDay(page, raceDay);
      // This owner has no series, so the week says nothing about repeats.
      await expect(page.locator("[data-plan-repeats-through]")).toHaveCount(0);
      // Today, asked for that day, shows it and says why no repeat is there.
      await page.goto(`/home/today?date=${raceDay}`);
      await expect(
        page.getByRole("link", { name: "Autumn race", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator('[data-today-notice="beyond-window"]'),
      ).toContainText("A single session placed here is.");
      await page.goto("/home/plan");

      // Every verb lives on the session's own page since 29 Sep 2026 (owner):
      // the card opens it, Edit is in sight, and the rest sit behind ⋯. This
      // flow is the same journey through a surface that was replaced.
      await openSession(page, today, "Aerobic run");
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const edit = sessionPanel(page, "Edit session");
      await edit.getByLabel("Title").fill("Long aerobic run");
      await edit.getByLabel("Minutes").fill("95");
      await edit.getByRole("button", { name: "Save session" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Long aerobic run" }),
      ).toBeVisible();
      await expect(page.getByText("Running · 95 min")).toBeVisible();

      // Lock, then unlock, in one tap each. A lock never blocks the owner's
      // own edits.
      await chooseMore(page, "Lock");
      await expect(
        sessionSheet(page).getByText("Locked", { exact: true }),
      ).toBeVisible();
      await chooseMore(page, "Unlock");
      await expect(
        sessionSheet(page).getByText("Locked", { exact: true }),
      ).toBeHidden();

      // Duplicate to tomorrow, then move the copy on a day. A session's date
      // is a field on the edit form, so moving one is saving an edit.
      await chooseMore(page, "Duplicate");
      const duplicate = sessionPanel(page, "Duplicate");
      await fillDate(duplicate, "Copy to", tomorrow);
      await duplicate
        .getByRole("button", { name: "Duplicate session" })
        .click();
      await expect(page.locator("[role='status']").first()).toContainText(
        "Session duplicated.",
      );
      await backToPlan(page);
      await expect(
        await sessionCard(page, tomorrow, "Long aerobic run"),
      ).toBeVisible();

      await openSession(page, tomorrow, "Long aerobic run");
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const copyEdit = sessionPanel(page, "Edit session");
      await fillDate(copyEdit, "Date", dayAfter);
      await copyEdit.getByRole("button", { name: "Save session" }).click();
      await expect(page.locator("[role='status']").first()).toContainText(
        "Session updated.",
      );
      await backToPlan(page);
      await expect(
        await sessionCard(page, dayAfter, "Long aerobic run"),
      ).toBeVisible();
      await expect(
        (await planDay(page, tomorrow)).getByText("—", { exact: true }),
      ).toBeVisible();

      // Recovery day: set from the day's +, then clear. An unlabelled empty
      // date stays unplanned.
      await toggleRecoveryDay(page, recoveryDate);
      await expect(await planDay(page, recoveryDate)).toHaveAttribute(
        "data-recovery",
        "true",
      );
      await expect(
        (await planDay(page, recoveryDate)).getByText("Recovery day", {
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-12-plan-window-390x844.png"),
      });

      // Cancel keeps the identity on the record rather than deleting it.
      await openSession(page, today, "Long aerobic run");
      await chooseMore(page, "Cancel session");
      const cancel = sessionPanel(page, "Cancel session");
      await expect(
        cancel.getByText(/keeps the session on the record/i),
      ).toBeVisible();
      await cancel.getByRole("button", { name: "Cancel session" }).click();
      await expect(
        page.getByRole("button", { name: "Reactivate" }),
      ).toBeVisible();
      await backToPlan(page);
      // Cancelled stays on the record, on its day.
      await expect(
        (await planDay(page, today))
          .locator("[data-cancelled]")
          .getByText("Cancelled", { exact: true }),
      ).toBeVisible();

      await toggleRecoveryDay(page, recoveryDate);
      await expect(await planDay(page, recoveryDate)).toHaveAttribute(
        "data-recovery",
        "false",
      );

      // Keyboard reach: a day's + opens its sheet, and Escape closes it.
      const add = (await planDay(page, today)).getByRole("button", {
        name: /^Add to /,
      });
      await add.focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(
        sheet.getByRole("button", { name: "New session" }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(add).toBeFocused();

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m3-12-final-390x844.png"),
      });
      expect(pageErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });

  test("refuses an eleventh session on one date and says why", async ({
    page,
    request,
  }) => {
    const account = await createConfirmedLocalUser(request);
    const today = ownerDate(0);

    try {
      await signIn(page, account.email, account.password);
      await page.goto("/home/plan");
      await page.getByRole("button", { name: `Use ${TIMEZONE}` }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Plan", exact: true }),
      ).toBeVisible();

      for (let index = 0; index < 10; index += 1) {
        await addSession(page, today, `Session ${index}`, "Running");
      }
      await expect(
        (await planDay(page, today)).getByRole("heading", {
          name: "Session 9",
        }),
      ).toBeVisible();

      const createDisclosure = await openNewSession(page, today);
      await createDisclosure.getByLabel("Title").fill("Eleventh");
      await createDisclosure.getByLabel("Sport").fill("Running");
      await createDisclosure
        .getByRole("button", { name: "Create session" })
        .click();

      const notice = page.locator("[role='status']").first();
      await expect(notice).toHaveAttribute("data-state", "rule");
      await expect(notice).toContainText(/at most ten sessions/i);
      // The refused draft is returned rather than thrown away.
      await expect(createDisclosure.getByLabel("Title")).toHaveValue(
        "Eleventh",
      );
      await expect(
        page
          .locator(`[data-plan-date="${today}"]`)
          .getByRole("heading", { name: "Eleventh" }),
      ).toBeHidden();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-12-daily-limit-390x844.png"),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

function ownerDate(offset: number) {
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const shifted = new Date(`${local}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

async function sessionCard(page: Page, date: string, title: string) {
  return (await planDay(page, date))
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

/** Opens a session's own page from its card on the Plan. */
async function openSession(page: Page, date: string, title: string) {
  await (await sessionCard(page, date, title))
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
}

function sessionSheet(page: Page) {
  return page.locator("article").filter({
    has: page.getByRole("heading", { level: 1 }),
  });
}

/** The panel a verb opened below the session, by its heading. */
function sessionPanel(page: Page, heading: string) {
  return page.locator(`[data-session-panel="${heading}"]`);
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

async function addSession(
  page: Page,
  date: string,
  title: string,
  sport: string,
  minutes?: string,
) {
  const form = await openNewSession(page, date);
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Sport").fill(sport);
  if (minutes) await form.getByLabel("Minutes").fill(minutes);
  await form.getByRole("button", { name: "Create session" }).click();
  await expect(
    (await planDay(page, date)).getByRole("heading", {
      name: title,
      exact: true,
    }),
  ).toBeVisible();
}

function lowerCaseHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home\/today$/);
}

async function createConfirmedLocalUser(
  request: import("@playwright/test").APIRequestContext,
) {
  const email = `fittip-m3-12-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
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

async function deleteLocalUser(
  request: import("@playwright/test").APIRequestContext,
  userId: string,
) {
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
