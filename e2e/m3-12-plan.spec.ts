import { expect, test, type Locator, type Page } from "@playwright/test";
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
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();
      await expect(page.getByText(`${TIMEZONE} · Revision 0`)).toBeVisible();
      // The window starts at owner-local today: no past date is offered at all.
      await expect(page.locator("[data-plan-date]")).toHaveCount(14);
      await expect(page.locator("[data-plan-date]").first()).toHaveAttribute(
        "data-plan-date",
        today,
      );
      await expect(
        day(page, today).getByText("Nothing planned."),
      ).toBeVisible();

      await addSession(page, today, "Aerobic run", "Running", "60");
      await expect(
        day(page, today).getByText("Running · 60 min"),
      ).toBeVisible();

      // Edit
      const card = sessionCard(page, today, "Aerobic run");
      await openDisclosure(card, "Edit");
      await card.getByLabel("Title").fill("Long aerobic run");
      await card.getByLabel("Minutes").fill("95");
      await card.getByRole("button", { name: "Save session" }).click();
      await expect(
        sessionCard(page, today, "Long aerobic run").getByText(
          "Running · 95 min",
        ),
      ).toBeVisible();

      // Lock, then unlock. A lock never blocks the owner's own edits.
      const locked = sessionCard(page, today, "Long aerobic run");
      await locked.getByRole("button", { name: "Lock", exact: true }).click();
      await expect(
        sessionCard(page, today, "Long aerobic run").getByText("Locked", {
          exact: true,
        }),
      ).toBeVisible();
      await sessionCard(page, today, "Long aerobic run")
        .getByRole("button", { name: "Unlock", exact: true })
        .click();
      await expect(
        sessionCard(page, today, "Long aerobic run").getByText("Locked", {
          exact: true,
        }),
      ).toBeHidden();

      // Duplicate to tomorrow, then move the copy on a day.
      const source = sessionCard(page, today, "Long aerobic run");
      await openDisclosure(source, "Duplicate");
      await source
        .locator("form")
        .filter({
          has: page.getByRole("button", { name: "Duplicate session" }),
        })
        .getByLabel("Copy to")
        .selectOption(tomorrow);
      await source.getByRole("button", { name: "Duplicate session" }).click();
      await expect(
        sessionCard(page, tomorrow, "Long aerobic run"),
      ).toBeVisible();

      const copy = sessionCard(page, tomorrow, "Long aerobic run");
      await openDisclosure(copy, "Move");
      await copy
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Move session" }) })
        .getByLabel("Move to")
        .selectOption(dayAfter);
      await copy.getByRole("button", { name: "Move session" }).click();
      await expect(
        sessionCard(page, dayAfter, "Long aerobic run"),
      ).toBeVisible();
      await expect(
        day(page, tomorrow).getByText("Nothing planned."),
      ).toBeVisible();

      // Recovery day: set, then clear. An unlabelled empty date stays unplanned.
      await day(page, recoveryDate)
        .getByRole("button", { name: "Mark recovery day" })
        .click();
      await expect(day(page, recoveryDate)).toHaveAttribute(
        "data-recovery",
        "true",
      );
      await expect(
        day(page, recoveryDate).getByText(
          "Recovery day. Nothing is planned here.",
        ),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-12-plan-window-390x844.png"),
      });

      // Cancel keeps the identity on the record rather than deleting it.
      const doomed = sessionCard(page, today, "Long aerobic run");
      await openDisclosure(doomed, "Cancel");
      await expect(
        doomed.getByText(/keeps the session on the record/i),
      ).toBeVisible();
      await doomed.getByRole("button", { name: "Cancel session" }).click();
      await expect(day(page, today).getByText("Cancelled")).toBeVisible();
      await expect(
        day(page, today).getByText("Running · Cancelled, kept on the record"),
      ).toBeVisible();
      await expect(
        day(page, today).getByText("Nothing planned."),
      ).toBeVisible();

      await day(page, recoveryDate)
        .getByRole("button", { name: "Clear recovery day" })
        .click();
      await expect(day(page, recoveryDate)).toHaveAttribute(
        "data-recovery",
        "false",
      );

      // Keyboard reach: the add disclosure opens and its first field takes focus.
      const addDisclosure = day(page, tomorrow)
        .locator("details")
        .filter({ hasText: "Add a session" });
      await addDisclosure.locator(":scope > summary").focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expect(addDisclosure.getByLabel("Title")).toBeFocused();

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
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();

      for (let index = 0; index < 10; index += 1) {
        await addSession(page, today, `Session ${index}`, "Running");
      }
      await expect(
        day(page, today).getByRole("heading", { name: "Session 9" }),
      ).toBeVisible();

      const addDisclosure = day(page, today)
        .locator("details")
        .filter({ hasText: "Add a session" });
      if ((await addDisclosure.getAttribute("open")) === null) {
        await addDisclosure.locator(":scope > summary").click();
      }
      await addDisclosure.getByLabel("Title").fill("Eleventh");
      await addDisclosure.getByLabel("Sport").fill("Running");
      await addDisclosure.getByRole("button", { name: "Add session" }).click();

      const notice = page.locator("[role='status']").first();
      await expect(notice).toHaveAttribute("data-state", "rule");
      await expect(notice).toContainText(/at most ten sessions/i);
      // The refused draft is returned rather than thrown away.
      await expect(addDisclosure.getByLabel("Title")).toHaveValue("Eleventh");
      await expect(
        day(page, today).getByRole("heading", { name: "Eleventh" }),
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

function day(page: Page, date: string) {
  return page.locator(`[data-plan-date="${date}"]`);
}

function sessionCard(page: Page, date: string, title: string) {
  return day(page, date)
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

async function openDisclosure(scope: Locator, label: string) {
  const details = scope.locator("details").filter({ hasText: label });
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
}

async function addSession(
  page: Page,
  date: string,
  title: string,
  sport: string,
  minutes?: string,
) {
  const details = day(page, date)
    .locator("details")
    .filter({ hasText: "Add a session" });
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
  await details.getByLabel("Title").fill(title);
  await details.getByLabel("Sport").fill(sport);
  if (minutes) await details.getByLabel("Minutes").fill(minutes);
  await details.getByRole("button", { name: "Add session" }).click();
  await expect(
    day(page, date).getByRole("heading", { name: title, exact: true }),
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
