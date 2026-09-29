import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

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
      await duplicate.getByLabel("Copy to").selectOption(tomorrow);
      await duplicate
        .getByRole("button", { name: "Duplicate session" })
        .click();
      await expect(page.locator("[role='status']").first()).toContainText(
        "Session duplicated.",
      );
      await backToPlan(page);
      await expect(
        sessionCard(page, tomorrow, "Long aerobic run"),
      ).toBeVisible();

      await openSession(page, tomorrow, "Long aerobic run");
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const copyEdit = sessionPanel(page, "Edit session");
      await copyEdit.getByLabel("Date").selectOption(dayAfter);
      await copyEdit.getByRole("button", { name: "Save session" }).click();
      await expect(page.locator("[role='status']").first()).toContainText(
        "Session updated.",
      );
      await backToPlan(page);
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
      await expect(
        day(page, today).getByText("Cancelled", { exact: true }),
      ).toBeVisible();
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

      // Keyboard reach: the single Plan create flow opens and starts on date.
      const createDisclosure = disclosure(
        page.locator("body"),
        "Create session",
      );
      const createSummary = createDisclosure.locator(":scope > summary");
      if ((await createDisclosure.getAttribute("open")) !== null) {
        await createSummary.click();
      }
      await createSummary.focus();
      await page.keyboard.press("Enter");
      await expect(createDisclosure).toHaveAttribute("open", "");
      await page.keyboard.press("Tab");
      await expect(createDisclosure.getByLabel("Date")).toBeFocused();

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

      const createDisclosure = disclosure(
        page.locator("body"),
        "Create session",
      );
      if ((await createDisclosure.getAttribute("open")) === null) {
        await createDisclosure.locator(":scope > summary").click();
      }
      await createDisclosure.getByLabel("Date").fill(today);
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

/** Opens a session's own page from its card on the Plan. */
async function openSession(page: Page, date: string, title: string) {
  await sessionCard(page, date, title)
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
    page.getByRole("heading", { name: "Plan ahead." }),
  ).toBeVisible();
}

/** The disclosure whose own summary carries this label. */
function disclosure(scope: Locator, label: string) {
  // Anchored on the summary. Filtering the whole `details` subtree matched body
  // copy as well as the label, so a disclosure whose consequence text happened
  // to contain another disclosure's label matched both at once.
  return scope.locator("details").filter({
    has: scope.page().locator(":scope > summary", { hasText: label }),
  });
}

async function addSession(
  page: Page,
  date: string,
  title: string,
  sport: string,
  minutes?: string,
) {
  const details = disclosure(page.locator("body"), "Create session");
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
  await details.getByLabel("Date").fill(date);
  await details.getByLabel("Title").fill(title);
  await details.getByLabel("Sport").fill(sport);
  if (minutes) await details.getByLabel("Minutes").fill(minutes);
  await details.getByRole("button", { name: "Create session" }).click();
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
