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

test.describe("M3-19 delete a planned session", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("cancels one session, deletes another, and refuses a logged one at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);
    const today = ownerDate(0);
    const tomorrow = ownerDate(1);

    try {
      await signIn(page, account.email, account.password);
      await page.goto("/home/plan");
      await page.getByRole("button", { name: `Use ${TIMEZONE}` }).click();
      await expect(
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();

      await addSession(page, today, "Cancel me", "Running");
      await addSession(page, tomorrow, "Delete me", "Running");
      await addSession(page, tomorrow, "Logged run", "Running");

      // The card carries four controls, and the retired label is gone.
      const doomed = sessionCard(page, tomorrow, "Delete me");
      const controls = doomed.locator("[data-session-actions]");
      await expect(controls.locator(":scope > details > summary")).toHaveText([
        "Edit",
        "Cancel",
        "Delete",
      ]);
      await expect(controls.locator(":scope > form button")).toHaveText("Lock");
      await expect(page.locator("summary", { hasText: "Remove" })).toHaveCount(
        0,
      );

      // Cancel keeps the session, and says so before it is used.
      const kept = sessionCard(page, today, "Cancel me");
      await openDisclosure(kept, "Cancel");
      await expect(
        kept.getByText(/keeps the session on the record as cancelled/i),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-19-card-verbs-390x844.png"),
      });
      await kept.getByRole("button", { name: "Cancel session" }).click();
      await expect(
        day(page, today).getByText("Cancelled", { exact: true }),
      ).toBeVisible();
      await expect(
        day(page, today).getByText("Running · Cancelled, kept on the record"),
      ).toBeVisible();

      // A lock defends a session from a sweep, never from the owner asking for
      // this one session by name.
      const locked = sessionCard(page, tomorrow, "Delete me");
      await locked.getByRole("button", { name: "Lock", exact: true }).click();
      await expect(
        sessionCard(page, tomorrow, "Delete me").getByText("Locked", {
          exact: true,
        }),
      ).toBeVisible();

      // Delete keeps nothing, and says the opposite of what cancel says.
      const gone = sessionCard(page, tomorrow, "Delete me");
      await openDisclosure(gone, "Delete");
      const warning = gone.getByText(/does not keep it on the record/i);
      await expect(warning).toBeVisible();
      await expect(warning).toContainText("no undo");
      await gone.getByRole("button", { name: "Delete session" }).click();
      await expect(sessionCard(page, tomorrow, "Delete me")).toHaveCount(0);
      await expect(
        day(page, tomorrow).getByText("Cancelled, kept on the record"),
      ).toHaveCount(0);

      // A session with training logged against it is refused, in the owner's
      // own words rather than as a foreign-key violation. The completion is
      // written through M3-15A's own owner-derived function, because the
      // logging surface itself is M3-15B.
      const sessionId = await sessionIdOf(page, tomorrow, "Logged run");
      await logCompletion(request, account, sessionId, today);
      await page.reload();

      const logged = sessionCard(page, tomorrow, "Logged run");
      await openDisclosure(logged, "Delete");
      await logged.getByRole("button", { name: "Delete session" }).click();
      const notice = page.locator("[role='status']").first();
      await expect(notice).toHaveAttribute("data-state", "rule");
      await expect(notice).toContainText(/cannot be deleted/i);
      await expect(notice).toContainText(/cancel it instead/i);
      await expect(sessionCard(page, tomorrow, "Logged run")).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-19-logged-refusal-390x844.png"),
      });

      // A cancelled session is exactly what an owner may next want gone.
      const cancelled = sessionCard(page, today, "Cancel me");
      await openDisclosure(cancelled, "Delete");
      await cancelled.getByRole("button", { name: "Delete session" }).click();
      await expect(
        day(page, today).getByText("Cancelled", { exact: true }),
      ).toHaveCount(0);
      await expect(
        day(page, today).getByText("Nothing planned."),
      ).toBeVisible();

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m3-19-final-390x844.png"),
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

/** The identity the surface already carries in every one of the card's forms. */
async function sessionIdOf(page: Page, date: string, title: string) {
  const value = await sessionCard(page, date, title)
    .locator("input[name='sessionId']")
    .first()
    .inputValue();
  expect(value).toMatch(/^[0-9a-f-]{36}$/);
  return value;
}

/** The disclosure whose own summary carries this label. */
function disclosure(scope: Locator, label: string) {
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
    day(page, date).getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

type LocalAccount = { email: string; password: string; userId: string };

/**
 * Logs one completion as the owner themselves. Nothing privileged is used: the
 * account signs in for its own access token, so the refusal below is the one a
 * real owner would meet rather than one arranged around them.
 */
async function logCompletion(
  request: APIRequestContext,
  account: LocalAccount,
  sessionId: string,
  actualLocalDate: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const tokenResponse = await request.post(
    `${url}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      data: { email: account.email, password: account.password },
    },
  );
  if (!tokenResponse.ok()) {
    throw new Error(`Local sign-in failed: ${tokenResponse.status()}`);
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error("Local sign-in returned no access token.");

  const response = await request.post(
    `${url}/rest/v1/rpc/apply_completion_change`,
    {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      data: {
        p_operation: "create",
        p_completion: {
          planSessionId: sessionId,
          status: "completed",
          actualLocalDate,
          activities: [],
        },
      },
    },
  );
  if (!response.ok()) {
    throw new Error(`Logging the completion failed: ${response.status()}`);
  }
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
  const email = `fittip-m3-19-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
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
