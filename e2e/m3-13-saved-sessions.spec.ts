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

test.describe("M3-13 private saved-session library", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("saves, lists, inspects, edits, reuses and deletes at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);
    const today = ownerDate(0);
    const reuseDate = ownerDate(2);

    try {
      await signIn(page, account.email, account.password);
      await page.goto("/home/plan");
      await page.getByRole("button", { name: `Use ${TIMEZONE}` }).click();
      // The masthead renders before the zone is confirmed, so the stamp is
      // what proves the profile now holds one.
      await expect(page.getByText(`${TIMEZONE} · Revision 0`)).toBeVisible();

      // Nothing in the product can create an activity yet, so the one planned
      // session that has any is seeded through the owner's own change
      // function, using their own token and their own grants.
      const token = await signInForApi(
        request,
        account.email,
        account.password,
      );
      await seedPlannedSessionWithActivities(request, token, today);
      await page.reload();
      const seeded = sessionCard(page, today, "Threshold intervals");
      await expect(
        seeded.getByText("Running · 45 min · 2 activities"),
      ).toBeVisible();

      // Save it into the library. The plan is not changed by saving.
      await openDisclosure(seeded, "Edit");
      await openDisclosure(seeded, "Save to library");
      await expect(
        seeded.getByText(/This session stays on your plan/i),
      ).toBeVisible();
      await seeded.getByLabel("Name it").fill("Tuesday tempo");
      await seeded.getByRole("button", { name: "Save to library" }).click();
      await expect(seeded.getByText("Saved to your library.")).toBeVisible();
      await expect(
        sessionCard(page, today, "Threshold intervals"),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-13-save-to-library-390x844.png"),
      });

      // List and inspect.
      await page.getByRole("link", { name: "Saved sessions" }).click();
      await expect(page).toHaveURL(/\/home\/plan\/saved$/);
      await expect(
        page.getByRole("heading", { name: "Saved sessions." }),
      ).toBeVisible();
      const card = savedCard(page, "Threshold intervals");
      await expect(card.getByText("Tuesday tempo")).toBeVisible();
      await expect(
        card.getByText("Running · 45 min · 2 activities"),
      ).toBeVisible();
      await expect(card.getByText("Threshold blocks · Running")).toBeVisible();
      await expect(card.getByText("Cool down · Running")).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-13-library-390x844.png"),
      });

      // Edit the entry. The planned session it came from must not change.
      await openDisclosure(card, "Edit");
      await card.getByLabel("Name").fill("Tuesday tempo (v2)");
      await card.getByLabel("Title").fill("Longer threshold intervals");
      await card.getByRole("button", { name: "Save entry" }).click();
      const edited = savedCard(page, "Longer threshold intervals");
      await expect(edited.getByText("Tuesday tempo (v2)")).toBeVisible();
      await expect(edited.getByText("2 activities")).toBeVisible();

      await page.goto("/home/plan");
      await expect(
        sessionCard(page, today, "Threshold intervals"),
      ).toBeVisible();

      // Reuse onto a date the owner picks. The plan gets a copy; the entry is
      // untouched and is not referenced by it.
      await page.getByRole("link", { name: "Saved sessions" }).click();
      const reusable = savedCard(page, "Longer threshold intervals");
      await openDisclosure(reusable, "Use in plan");
      await reusable
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Add to plan" }) })
        .getByLabel("Add to")
        .selectOption(reuseDate);
      await reusable.getByRole("button", { name: "Add to plan" }).click();
      await expect(page.locator("[role='status']").first()).toContainText(
        "Added to your plan.",
      );

      await page.goto("/home/plan");
      const copy = sessionCard(page, reuseDate, "Longer threshold intervals");
      await expect(copy.getByText("2 activities")).toBeVisible();
      await expect(copy.getByText("Locked", { exact: true })).toBeHidden();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-13-reused-390x844.png"),
      });

      // Delete permanently. The two planned sessions survive it.
      await page.getByRole("link", { name: "Saved sessions" }).click();
      const doomed = savedCard(page, "Longer threshold intervals");
      await openDisclosure(doomed, "Delete");
      await expect(
        doomed.getByText(/removes this entry permanently/i),
      ).toBeVisible();
      await doomed.getByRole("button", { name: "Delete permanently" }).click();
      await expect(
        page.getByRole("heading", { name: "Nothing saved yet." }),
      ).toBeVisible();

      await page.goto("/home/plan");
      await expect(
        sessionCard(page, today, "Threshold intervals"),
      ).toBeVisible();
      await expect(
        sessionCard(page, reuseDate, "Longer threshold intervals"),
      ).toBeVisible();

      // Keyboard reach on the library, and the authenticated response headers.
      const savedResponse = await page.goto("/home/plan/saved");
      expect(savedResponse?.status()).toBe(200);
      const headers = lowerCaseHeaders(savedResponse?.headers() ?? {});
      expect(headers["cache-control"]).toContain("no-store");
      expect(headers["cache-control"]).toContain("private");
      await expect(
        page.getByRole("heading", { name: "Nothing saved yet." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Back to the plan" }).focus();
      await expect(
        page.getByRole("link", { name: "Back to the plan" }),
      ).toBeFocused();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-13-empty-library-390x844.png"),
      });

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m3-13-final-390x844.png"),
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

function day(page: Page, date: string) {
  return page.locator(`[data-plan-date="${date}"]`);
}

function sessionCard(page: Page, date: string, title: string) {
  return day(page, date)
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function savedCard(page: Page, title: string) {
  return page
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
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

async function openDisclosure(scope: Locator, label: string) {
  const details = disclosure(scope, label);
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
}

async function seedPlannedSessionWithActivities(
  request: APIRequestContext,
  token: string,
  localDate: string,
) {
  const response = await request.post(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/apply_rolling_plan_change_set`,
    {
      headers: apiHeaders(token),
      data: {
        p_expected_plan_revision: 0,
        p_idempotency_key: crypto.randomUUID(),
        p_provenance: "owner_manual",
        p_changes: [
          {
            operation: "add",
            sessionId: crypto.randomUUID(),
            session: {
              localDate,
              position: 0,
              title: "Threshold intervals",
              sport: "Running",
              intent: "Threshold work",
              expectedDurationMinutes: 45,
              isLocked: false,
              activities: [
                {
                  position: 0,
                  name: "Threshold blocks",
                  sport: "Running",
                  instructions: "3 x 8 minutes",
                  measurementMode: "duration_intensity",
                  target: { duration_minutes: 24, intensity: "hard" },
                  isLocked: false,
                },
                {
                  position: 1,
                  name: "Cool down",
                  sport: "Running",
                  measurementMode: "duration_intensity",
                  target: { duration_minutes: 10, intensity: "easy" },
                  isLocked: false,
                },
              ],
            },
          },
        ],
      },
    },
  );
  if (!response.ok()) {
    throw new Error(`Seeding the planned session failed: ${response.status()}`);
  }
}

function apiHeaders(token: string) {
  return {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
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

/** The owner's own access token, used only to seed what no surface can create. */
async function signInForApi(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const response = await request.post(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
      },
      data: { email, password },
    },
  );
  if (!response.ok()) {
    throw new Error(`Local sign-in for seeding failed: ${response.status()}`);
  }
  return ((await response.json()) as { access_token: string }).access_token;
}

async function createConfirmedLocalUser(request: APIRequestContext) {
  const email = `fittip-m3-13-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
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
