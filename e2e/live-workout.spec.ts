import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { logInSteps } from "./support/log-steps";

/**
 * Logging a session live (ADR-037), at 390x844: a planned session is started
 * from Today, sets are ticked and an activity's measurement is changed, the
 * workout survives leaving it and is found again by the clock on another
 * page, and Finish opens the log steps filled in; saving the log removes the
 * workout. A workout started from scratch can be discarded.
 */

const TIMEZONE = "Europe/Berlin";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("logging a session live", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("starts, ticks, leaves, comes back, finishes and discards", async ({
    page,
    request,
  }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);
    try {
      await arrange(request, account);
      await signIn(page, account.email, account.password);

      // ---- Start the planned session from Today. ----
      const card = page.locator("[data-today-session]", {
        has: page.getByRole("heading", { name: "Upper body", exact: true }),
      });
      await card.getByRole("button", { name: /Track live/ }).click();
      await expect(page).toHaveURL(/\/home\/log\/live$/);
      await expect(page.locator("[data-live-clock]")).toHaveText(/^\d+:\d\d$/);

      const bench = page.locator('[data-live-activity="Bench press"]');
      await expect(bench.getByText("0 of 2 sets")).toBeVisible();
      await bench.getByRole("button", { name: "Set 1 reps more" }).click();
      await bench.getByRole("button", { name: "Set 1 done" }).click();
      await expect(bench.getByText("1 of 2 sets")).toBeVisible();

      // Stretching was planned unmeasured; it is timed instead.
      const stretching = page.locator('[data-live-activity="Stretching"]');
      await stretching
        .getByRole("button", { name: "Change how it is measured" })
        .click();
      await stretching
        .getByLabel("Measured as")
        .selectOption("duration_intensity");
      await stretching.getByLabel("Minutes").fill("10");
      await stretching.getByRole("button", { name: "Mark done" }).click();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      // ---- Leave it: Today offers it to continue, not a second start. ----
      await page.goto("/home/today");
      // Continue is where Track live was; nothing else can be started.
      await expect(card.locator("[data-today-continue-workout]")).toHaveText(
        /Continue/,
      );
      await expect(page.locator("[data-today-start-live]")).toHaveCount(0);
      await expect(page.locator("[data-today-start-workout]")).toHaveCount(0);

      // ---- The clock on another page leads back. ----
      await page.goto("/home/plan");
      const pill = page.locator("[data-live-pill]");
      await expect(pill).toContainText("Upper body");
      await pill.click();
      await expect(page).toHaveURL(/\/home\/log\/live$/);
      await expect(
        bench.getByRole("button", { name: "Set 1 done" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(bench.getByLabel("Set 1 reps (reps)")).toHaveValue("6");

      // ---- Finish: the log steps open filled in, and saving ends it. ----
      await page.getByRole("button", { name: "Finish and log" }).click();
      await expect(page).toHaveURL(/\/home\/log\?workout=/);
      await expect(page.locator("[data-live-pill]")).toHaveCount(0);
      // Tracked live, it happened: "How did it go?" is not asked.
      await expect(page.locator("[data-log-form]")).toHaveAttribute(
        "data-log-step-current",
        "what",
      );
      await logInSteps(page, {
        activities: async (activitiesPage) => {
          await expect(
            activitiesPage.getByText("Did: 1 × 6 · 40 kg"),
          ).toBeVisible();
          await expect(activitiesPage.getByText("Did: 10 min")).toBeVisible();
        },
      });
      // It ends on Today, where the session now reads as logged.
      await expect(page).toHaveURL(/\/home\/today\?date=/);
      await expect(page.locator("[data-live-pill]")).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: /Track live/ }),
      ).toHaveCount(0);

      // ---- From scratch, then discarded: nothing is logged. ----
      await page.locator("[data-today-start-workout]").click();
      await page.getByLabel("What is it?").fill("Evening gym");
      await page.getByLabel("Sport").fill("Strength");
      await page.getByRole("button", { name: "▶ Start" }).click();
      await expect(page).toHaveURL(/\/home\/log\/live$/);
      await page.getByRole("button", { name: "Discard workout" }).click();
      await page
        .locator("form")
        .getByRole("button", { name: "Discard workout" })
        .click();
      await expect(page).toHaveURL(/\/home\/today$/);
      await expect(page.locator("[data-live-pill]")).toHaveCount(0);

      expect(pageErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

type LocalAccount = { email: string; password: string; userId: string };

/** The owner's profile and one session today, written as the owner. */
async function arrange(request: APIRequestContext, account: LocalAccount) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const token = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: account.email, password: account.password },
  });
  expect(token.ok()).toBe(true);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${((await token.json()) as { access_token: string }).access_token}`,
  };
  const profile = await request.post(`${url}/rest/v1/profiles`, {
    headers: { ...headers, Prefer: "return=minimal" },
    data: {
      user_id: account.userId,
      timezone_name: TIMEZONE,
      setup_finished_at: new Date().toISOString(),
    },
  });
  expect(profile.ok()).toBe(true);
  const plan = await request.post(
    `${url}/rest/v1/rpc/apply_rolling_plan_change_set`,
    {
      headers,
      data: {
        p_expected_plan_revision: 0,
        p_idempotency_key: crypto.randomUUID(),
        p_provenance: "owner_manual",
        p_changes: [
          {
            operation: "add",
            sessionId: crypto.randomUUID(),
            session: {
              localDate: ownerToday(),
              position: 0,
              title: "Upper body",
              sport: "Strength",
              expectedDurationMinutes: 45,
              activities: [
                {
                  position: 0,
                  name: "Bench press",
                  sport: "Strength",
                  measurementMode: "sets_reps_load",
                  target: {
                    groups: [{ sets: 2, reps: 5, load: 40 }],
                    load_unit: "kg",
                  },
                },
                {
                  position: 1,
                  name: "Stretching",
                  sport: "Strength",
                  measurementMode: "unmeasured",
                },
              ],
            },
          },
        ],
      },
    },
  );
  expect(plan.ok()).toBe(true);
}

function ownerToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

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
  const email = `fittip-live-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
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
