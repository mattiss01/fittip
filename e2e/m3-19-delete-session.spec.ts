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

      // Since 29 Sep 2026 the card carries no controls: it opens the
      // session's own page, where Cancel and Delete sit behind ⋯ and each
      // opens a panel that says what it does. The retired label stays gone.
      const doomed = sessionCard(page, tomorrow, "Delete me");
      await expect(doomed.locator("button, summary, form")).toHaveCount(0);
      await expect(page.locator("summary", { hasText: "Remove" })).toHaveCount(
        0,
      );

      // Cancel keeps the session, and says so before it is used.
      await openSession(page, today, "Cancel me");
      await chooseMore(page, "Cancel session");
      const cancel = sessionPanel(page, "Cancel session");
      await expect(
        cancel.getByText(/keeps the session on the record as cancelled/i),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-19-card-verbs-390x844.png"),
      });
      // Since 29 Sep 2026 it may say why, in the owner's own words, shown on
      // the session's page and nowhere else.
      await cancel.getByLabel("Why? (optional)").fill("work ran late");
      await cancel.getByRole("button", { name: "Cancel session" }).click();
      await expect(
        page.locator("article").getByText("Cancelled", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-cancellation-reason]")).toHaveText(
        "Why “work ran late”",
      );

      // The reason is edited apart from the plan.
      await chooseMore(page, "Edit reason");
      const reason = sessionPanel(page, "Why it was cancelled");
      await reason.getByLabel("Why? (optional)").fill("storm warning");
      await reason.getByRole("button", { name: "Save reason" }).click();
      await expect(page.locator("[data-cancellation-reason]")).toHaveText(
        "Why “storm warning”",
      );

      // M3-20: a cancelled session can come back in one tap, and be cancelled
      // again with the verbs it had all along. Reactivating clears the reason,
      // so a second cancel that gives none shows none.
      await expect(page.getByText(/clears the reason/)).toBeVisible();
      await page
        .getByRole("button", { name: "Reactivate", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Edit", exact: true }),
      ).toBeVisible();
      await chooseMore(page, "Cancel session");
      await sessionPanel(page, "Cancel session")
        .getByRole("button", { name: "Cancel session" })
        .click();
      await expect(
        page.getByRole("button", { name: "Reactivate", exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-cancellation-reason]")).toHaveCount(0);
      await backToPlan(page);
      await expect(
        day(page, today).getByText("Running · Cancelled, kept on the record"),
      ).toBeVisible();
      await expect(
        day(page, today).getByText(/work ran late|storm warning/),
      ).toHaveCount(0);

      // A lock defends a session from a sweep, never from the owner asking for
      // this one session by name.
      await openSession(page, tomorrow, "Delete me");
      await chooseMore(page, "Lock");
      await expect(
        page.locator("article").getByText("Locked", { exact: true }),
      ).toBeVisible();

      // Delete keeps nothing, says the opposite of what cancel says, and
      // returns to the Plan because the page's session is gone.
      await chooseMore(page, "Delete");
      const remove = sessionPanel(page, "Delete session");
      const warning = remove.getByText(/does not keep it on the record/i);
      await expect(warning).toBeVisible();
      await expect(warning).toContainText("no undo");
      await remove.getByRole("button", { name: "Delete session" }).click();
      await expect(
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();
      await expect(sessionCard(page, tomorrow, "Delete me")).toHaveCount(0);
      await expect(
        day(page, tomorrow).getByText("Cancelled, kept on the record"),
      ).toHaveCount(0);

      // A session with training logged against it is refused, in the owner's
      // own words rather than as a foreign-key violation. The completion is
      // written through M3-15A's own owner-derived function, because the
      // logging surface itself is M3-15B. It is a skip written ahead: since
      // 26 Sep 2026 a completed log dated before its session reads as done on
      // the Plan and offers no Delete, while a skip keeps its card.
      const sessionId = await sessionIdOf(page, tomorrow, "Logged run");
      await logCompletion(request, account, sessionId, today, "skipped");

      await openSession(page, tomorrow, "Logged run");
      await chooseMore(page, "Delete");
      await sessionPanel(page, "Delete session")
        .getByRole("button", { name: "Delete session" })
        .click();
      const notice = page.locator("[role='status']").first();
      await expect(notice).toHaveAttribute("data-state", "rule");
      await expect(notice).toContainText(/cannot be deleted/i);
      await expect(notice).toContainText(/cancel it instead/i);
      await expect(
        page.getByRole("heading", { level: 1, name: "Logged run" }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-19-logged-refusal-390x844.png"),
      });
      await backToPlan(page);

      // A cancelled session is exactly what an owner may next want gone.
      await openSession(page, today, "Cancel me");
      await chooseMore(page, "Delete");
      await sessionPanel(page, "Delete session")
        .getByRole("button", { name: "Delete session" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();
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

/** The identity the card's link to the session's own page carries. */
async function sessionIdOf(page: Page, date: string, title: string) {
  const href = await sessionCard(page, date, title)
    .getByRole("link", { name: title, exact: true })
    .getAttribute("href");
  const value = href?.split("/").at(-1) ?? "";
  expect(value).toMatch(/^[0-9a-f-]{36}$/);
  return value;
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
  return scope.locator("details").filter({
    has: scope.page().locator(":scope > summary", { hasText: label }),
  });
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
  status: "completed" | "skipped" = "completed",
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
          status,
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
