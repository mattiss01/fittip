import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * Deleting an account (ADR-039), at 390x844: an owner whose planned session
 * has a log (one of the links that once blocked a delete) opens Settings,
 * types DELETE, and lands on sign-in told that everything was deleted. The
 * same details then no longer sign in, and the account is gone from Auth.
 */

const TIMEZONE = "Europe/Berlin";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

type LocalAccount = { email: string; password: string; userId: string };

test.describe("deleting an account", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("removes the account and everything in it from Settings", async ({
    page,
    request,
  }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);
    try {
      await arrange(request, account);
      await signIn(page, account.email, account.password);

      await page.goto("/home/you/settings");
      const section = page.locator("#delete-account");
      await section.scrollIntoViewIfNeeded();
      await expect(
        section.getByRole("heading", { name: "Delete account" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const button = section.getByRole("button", { name: "Delete my account" });
      const input = section.getByLabel("Type DELETE to confirm");
      await expect(button).toBeDisabled();
      await input.fill("delete");
      await expect(button).toBeDisabled();
      await input.fill("DELETE");
      await button.click();

      await expect(page).toHaveURL(/\/\?auth=deleted$/);
      await expect(page.getByRole("status")).toHaveText(
        "Your account and everything in it was deleted.",
      );

      // Signed out, and the same details no longer sign in.
      await page.goto("/home/today");
      await expect(page).not.toHaveURL(/\/home\/today$/);
      await page.goto("/");
      await page.getByLabel("Email").fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill(account.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      // By its text: Next.js keeps its own empty role="alert" route announcer.
      await expect(
        page.getByText("We could not sign you in with those details."),
      ).toBeVisible();

      expect(await authUserExists(request, account.userId)).toBe(false);
      expect(pageErrors).toEqual([]);
    } finally {
      await deleteLocalUserIfPresent(request, account);
    }
  });
});

/** A profile, a session today and a log of it, written as the owner. */
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
  const sessionId = crypto.randomUUID();
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
            sessionId,
            session: {
              localDate: ownerToday(),
              position: 0,
              title: "Easy run",
              sport: "Running",
              activities: [],
            },
          },
        ],
      },
    },
  );
  expect(plan.ok()).toBe(true);
  const log = await request.post(`${url}/rest/v1/rpc/apply_completion_change`, {
    headers,
    data: {
      p_operation: "create",
      p_completion_id: null,
      p_expected_revision: null,
      p_completion: {
        planSessionId: sessionId,
        status: "completed",
        actualLocalDate: ownerToday(),
        title: "Easy run",
        sport: "Running",
        activities: [],
      },
    },
  });
  expect(log.ok()).toBe(true);
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

function serviceHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function createConfirmedLocalUser(
  request: APIRequestContext,
): Promise<LocalAccount> {
  const email = `fittip-delete-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9`;
  const response = await request.post(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      headers: serviceHeaders(),
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

async function authUserExists(request: APIRequestContext, userId: string) {
  const response = await request.get(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    { headers: serviceHeaders() },
  );
  return response.ok();
}

/**
 * The flow deletes the account itself; this only cleans up after a failure.
 * It deletes as the owner, through the function under test's own path: the
 * admin API would stop at the very links a log of a session creates.
 */
async function deleteLocalUserIfPresent(
  request: APIRequestContext,
  account: LocalAccount,
) {
  if (!(await authUserExists(request, account.userId))) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const token = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: account.email, password: account.password },
  });
  const response = await request.post(`${url}/rest/v1/rpc/delete_my_account`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${((await token.json()) as { access_token: string }).access_token}`,
    },
    data: { p_confirmation: "DELETE" },
  });
  if (!response.ok()) {
    throw new Error(`Local Auth cleanup failed: ${response.status()}`);
  }
}
