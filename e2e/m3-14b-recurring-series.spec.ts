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

test.describe("M3-14B recurring series surface", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("creates, scopes, ends and extends recurring sessions at 390x844", async ({
    page,
    request,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const account = await createConfirmedLocalUser(request);
    const today = ownerDate(0);
    const dailyStart = ownerDate(1);
    const secondDaily = ownerDate(3);
    const dailyEnd = ownerDate(7);
    const capDate = ownerDate(10);
    const weeklyVisibleDate = ownerDate(11);

    try {
      await signIn(page, account.email, account.password);
      await page.goto("/home/plan");
      await page.getByRole("button", { name: "Use " + TIMEZONE }).click();
      await expect(page.getByText(new RegExp(TIMEZONE))).toBeVisible();

      // There is one Plan-level create action, including while every date is
      // empty. A non-recurring submission keeps M3-12's ordinary add path.
      await expect(
        page.locator("summary", { hasText: "Create session" }),
      ).toHaveCount(1);
      await expect(
        page.getByText("Add a session", { exact: true }),
      ).toHaveCount(0);
      const create = page.locator("details").filter({
        has: page.locator("summary", { hasText: "Create session" }),
      });
      await openDisclosure(page.locator("body"), "Create session");
      await create.getByLabel("Date").fill(today);
      await create.getByLabel("Title").fill("Ordinary base");
      await create.getByLabel("Sport").fill("Running");
      await create.getByLabel("Minutes").fill("45");
      await create.getByRole("button", { name: "Create session" }).click();
      const source = sessionCard(page, today, "Ordinary base");
      await expect(source).toBeVisible();
      const exposedActions = source.locator("[data-session-actions]");
      await expect(
        exposedActions.locator(":scope > details > summary"),
      ).toHaveText(["Edit", "Remove"]);
      await expect(exposedActions.locator(":scope > form button")).toHaveText(
        "Lock",
      );
      await expect(source.getByRole("link", { name: "Repeat" })).toHaveCount(0);

      // Save remains available inside Edit, and saved-session reuse remains
      // ordinary M3-13 behavior without a recurrence shortcut.
      await openDisclosure(source, "Edit");
      await openDisclosure(source, "Save to library");
      await source.getByLabel("Name it").fill("Base template");
      await source.getByRole("button", { name: "Save to library" }).click();
      await expect(source.getByText("Saved to your library.")).toBeVisible();
      await page.goto("/home/plan/saved");
      const saved = savedCard(page, "Ordinary base");
      await expect(saved.getByRole("link", { name: "Repeat" })).toHaveCount(0);
      await openDisclosure(saved, "Use in plan");
      await saved.getByLabel("Add to").selectOption(ownerDate(9));
      await saved.getByRole("button", { name: "Add to plan" }).click();
      await expect(page.locator("[role='status']").first()).toContainText(
        "Added to your plan.",
      );
      await page.getByRole("link", { name: "Back to the plan" }).click();

      // The same create flow reveals recurrence only when requested, with an
      // explicit occurrence review before the bounded series write.
      await openDisclosure(page.locator("body"), "Create session");
      await create.getByLabel("Date").fill(dailyStart);
      await create.getByLabel("Title").fill("Aerobic base");
      await create.getByLabel("Sport").fill("Running");
      await create.getByLabel("Minutes").fill("45");
      await create.getByLabel("Repeat this session").check();

      // Bounded daily interval, with an explicit review before the write.
      await create.getByLabel("Repeat", { exact: true }).selectOption("daily");
      await create.getByLabel("Every").fill("2");
      await create.getByText("No end date", { exact: true }).click();
      await create.getByLabel("End date", { exact: true }).fill(dailyEnd);
      await create
        .getByRole("button", { name: "Review recurring sessions" })
        .click();
      await expect(
        page.getByRole("heading", { name: "First occurrences" }),
      ).toBeVisible();
      await expect(page.getByText(longDate(dailyStart))).toBeVisible();
      await expect(page.getByText(longDate(secondDaily))).toBeVisible();
      await create
        .getByRole("button", { name: "Create recurring sessions" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "created" }),
      ).toBeVisible();

      let first = sessionCard(page, dailyStart, "Aerobic base");
      await expect(first.getByText("Recurring", { exact: true })).toBeVisible();

      // Only this session changes one occurrence and marks it as diverged.
      await openDisclosure(first, "Edit");
      const onlyThis = scope(first, "Only this session").first();
      await onlyThis.getByLabel("Title").fill("Diverged aerobic");
      await onlyThis
        .getByRole("button", { name: "Change only this session" })
        .click();
      first = sessionCard(page, dailyStart, "Diverged aerobic");
      await expect(first.getByText("Changed", { exact: true })).toBeVisible();
      await expect(
        sessionCard(page, secondDaily, "Aerobic base"),
      ).toBeVisible();

      // This-and-future starts a successor and leaves the earlier divergence.
      let second = sessionCard(page, secondDaily, "Aerobic base");
      await openDisclosure(second, "Edit");
      const future = scope(second, "This and all future sessions").first();
      await future.getByLabel("Title").fill("Future steady");
      await future.getByLabel("Repeat", { exact: true }).selectOption("daily");
      await future.getByLabel("Every").fill("1");
      await future
        .getByRole("button", { name: "Change this and future sessions" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Earlier occurrences" }),
      ).toBeVisible();
      await expect(
        sessionCard(page, dailyStart, "Diverged aerobic"),
      ).toBeVisible();
      second = sessionCard(page, secondDaily, "Future steady");
      await expect(second).toBeVisible();

      // Consequences appear before future removal and carry no forecast count.
      const endFrom = ownerDate(5);
      const ending = sessionCard(page, endFrom, "Future steady");
      await openDisclosure(ending, "Remove");
      const futureRemoval = scope(
        ending,
        "This and all future sessions",
      ).last();
      const permanent = futureRemoval.getByText(
        /Permanent\. Removes this occurrence/,
      );
      await expect(permanent).toContainText("Locked sessions are kept");
      await expect(permanent).toContainText("completed training is untouched");
      await expect(permanent).toContainText("no undo");
      await expect(permanent).not.toContainText(/\b\d+\b/);
      await futureRemoval
        .getByRole("button", {
          name: "Remove this and all future sessions",
        })
        .click();
      const authoritative = page
        .getByRole("status")
        .filter({ hasText: "Future recurring sessions removed permanently" });
      await expect(authoritative).toContainText(/\d+ unchanged removed/);
      await expect(authoritative).toContainText(/\d+ changed removed/);
      await expect(authoritative).toContainText(/\d+ locked kept/);
      await expect(
        sessionCard(page, dailyStart, "Diverged aerobic"),
      ).toBeVisible();
      await expect(sessionCard(page, endFrom, "Future steady")).toHaveCount(0);

      // Fill one later date to the cap through the owner's accepted change
      // function, then use the same Plan create flow for an open weekly rule.
      const token = await signInForApi(
        request,
        account.email,
        account.password,
      );
      await seedFullDate(request, token, capDate, today, ownerDate(13));
      await page.goto("/home/plan");
      const weeklyCreate = page.locator("details").filter({
        has: page.locator("summary", { hasText: "Create session" }),
      });
      await openDisclosure(page.locator("body"), "Create session");
      await weeklyCreate.getByLabel("Date").fill(capDate);
      await weeklyCreate.getByLabel("Title").fill("Weekly strength");
      await weeklyCreate.getByLabel("Sport").fill("Strength");
      await weeklyCreate.getByLabel("Repeat this session").check();
      await weeklyCreate
        .getByLabel("Repeat", { exact: true })
        .selectOption("weekly");
      await weeklyCreate.getByLabel("Every").fill("1");
      await expect(
        weeklyCreate.locator(
          `input[name="weekdays"][value="${weekday(capDate)}"]`,
        ),
      ).toBeChecked();
      await weeklyCreate
        .locator(
          `input[name="weekdays"][value="${weekday(weeklyVisibleDate)}"]`,
        )
        .check();
      await weeklyCreate
        .getByRole("button", { name: "Review recurring sessions" })
        .click();
      await expect(page.getByText(longDate(capDate))).toBeVisible();
      await expect(page.getByText(longDate(weeklyVisibleDate))).toBeVisible();
      await weeklyCreate
        .getByRole("button", { name: "Create recurring sessions" })
        .click();
      const skipped = page.getByRole("heading", { name: "Dates not added" });
      await expect(skipped).toBeVisible();
      const skippedCard = skipped.locator("..");
      await expect(skippedCard).toContainText(longDate(capDate));
      await expect(skippedCard).toContainText("already has ten sessions");
      await expect(
        sessionCard(page, weeklyVisibleDate, "Weekly strength").getByText(
          "Recurring",
          { exact: true },
        ),
      ).toBeVisible();

      // Existing honest recovery surfaces remain reachable.
      await page.context().setOffline(true);
      await expect(page.getByText(/^Offline\./)).toBeVisible();
      await page.context().setOffline(false);
      await page.goto("/home/plan/series/new");
      await expect(page).toHaveURL(/\/home\/plan$/);

      const privateResponse = await page.goto("/home/plan");
      expect(privateResponse).not.toBeNull();
      await expect(
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();
      await expect(
        sessionCard(page, weeklyVisibleDate, "Weekly strength"),
      ).toBeVisible();
      const headers = lowerCaseHeaders(privateResponse!.headers());
      expect(headers["cache-control"]).toBe(
        "private, no-cache, no-store, must-revalidate, max-age=0",
      );
      expect(headers.pragma).toBe("no-cache");
      expect(headers.expires).toBe("0");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-14B-390x844.png"),
      });
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await page.context().setOffline(false);
      await deleteLocalUser(request, account.userId);
    }
  });
});

function planDay(page: Page, localDate: string) {
  return page.locator('[data-plan-date="' + localDate + '"]');
}

function sessionCard(page: Page, localDate: string, title: string) {
  return planDay(page, localDate)
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
}

function savedCard(page: Page, title: string) {
  return page
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
}

function scope(container: Locator, heading: string) {
  return container.locator("section").filter({ hasText: heading });
}

async function openDisclosure(container: Locator, label: string) {
  const summary = container
    .locator("summary")
    .filter({ hasText: label })
    .first();
  await expect(summary).toBeVisible();
  await summary.click();
}

function ownerDate(offset: number) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return date.toISOString().slice(0, 10);
}

function weekday(isoDate: string) {
  return new Date(isoDate + "T00:00:00.000Z").getUTCDay();
}

function longDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDate + "T12:00:00.000Z"));
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home\/today$/);
}

async function signInForApi(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const response = await request.post(
    process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/token?grant_type=password",
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
      },
      data: { email, password },
    },
  );
  if (!response.ok()) {
    throw new Error("Local sign-in for seeding failed: " + response.status());
  }
  return ((await response.json()) as { access_token: string }).access_token;
}

async function seedFullDate(
  request: APIRequestContext,
  token: string,
  localDate: string,
  windowStart: string,
  windowEnd: string,
) {
  const sliceResponse = await request.post(
    process.env.NEXT_PUBLIC_SUPABASE_URL +
      "/rest/v1/rpc/get_rolling_plan_slice",
    {
      headers: apiHeaders(token),
      data: { p_start_date: windowStart, p_end_date: windowEnd },
    },
  );
  if (!sliceResponse.ok()) {
    throw new Error(
      "Reading the Plan revision failed: " + sliceResponse.status(),
    );
  }
  const revision = ((await sliceResponse.json()) as { plan_revision: number })
    .plan_revision;
  const response = await request.post(
    process.env.NEXT_PUBLIC_SUPABASE_URL +
      "/rest/v1/rpc/apply_rolling_plan_change_set",
    {
      headers: apiHeaders(token),
      data: {
        p_expected_plan_revision: revision,
        p_idempotency_key: crypto.randomUUID(),
        p_provenance: "owner_manual",
        p_changes: Array.from({ length: 10 }, (_, position) => ({
          operation: "add",
          sessionId: crypto.randomUUID(),
          session: {
            localDate,
            position,
            title: "Cap session " + (position + 1),
            sport: "Synthetic",
            isLocked: false,
            activities: [],
          },
        })),
      },
    },
  );
  if (!response.ok()) {
    throw new Error("Seeding the full date failed: " + response.status());
  }
}

function apiHeaders(token: string) {
  return {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

function lowerCaseHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

async function createConfirmedLocalUser(request: APIRequestContext) {
  const email =
    "fittip-m3-14b-" +
    Date.now() +
    "-" +
    Math.floor(Math.random() * 1e6) +
    "@example.test";
  const password = "Local-" + crypto.randomUUID() + "-9";
  const response = await request.post(
    process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/admin/users",
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      data: { email, password, email_confirm: true },
    },
  );
  if (!response.ok()) {
    throw new Error("Local Auth provisioning failed: " + response.status());
  }
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new Error("Local Auth provisioning returned no user id.");
  return { email, password, userId: body.id };
}

async function deleteLocalUser(request: APIRequestContext, userId: string) {
  const response = await request.delete(
    process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/admin/users/" + userId,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  );
  if (!response.ok()) {
    throw new Error("Local Auth cleanup failed: " + response.status());
  }
}
