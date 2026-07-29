import { expect, test } from "@playwright/test";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("M1-04 Today, Progress, and navigation", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("runs Plan to Today to actual to Progress at 390x844", async ({
    context,
    page,
    request,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);
      await expect(page).toHaveURL(/\/home\/today$/);
      await expect(
        page.getByRole("heading", { name: "Start with the plan." }),
      ).toBeVisible();
      await expectApprovedNavigation(page);

      await page.getByRole("link", { name: "Plan", exact: true }).click();
      await page.getByRole("button", { name: "1", exact: true }).click();
      await page.getByRole("button", { name: "+ Add" }).first().click();
      const composer = page.getByRole("dialog", { name: "Add session" });
      await composer.getByLabel("Session title").fill("Morning base run");
      await composer
        .getByLabel("Sport or domain", { exact: true })
        .first()
        .fill("Running");
      await composer.getByLabel("Intent").fill("Comfortable aerobic work");
      await composer.getByLabel("Expected minutes").fill("35");
      await composer.getByRole("button", { name: "Keep in draft" }).click();
      await page.getByRole("button", { name: "Save plan" }).click();
      await expect(page.getByText(/Plan version 1 accepted/)).toBeVisible();

      await page.getByRole("link", { name: "Today", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Morning base run" }),
      ).toBeVisible();
      await expect(page.getByText("Planned", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      await page.getByRole("link", { name: "Log training" }).click();
      await page.getByLabel("Duration in minutes").fill("32");
      await page.getByRole("button", { name: "Save actual" }).click();
      await expect(
        page.getByRole("heading", { name: "Fact recorded." }),
      ).toBeVisible();
      await page.getByRole("link", { name: "View in Progress" }).click();
      await expect(page).toHaveURL(/\/home\/progress\/completion-/);
      const detailUrl = page.url();
      await expect(
        page.getByRole("region", { name: "Planned and actual comparison" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Morning base run" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Completed", exact: true }),
      ).toBeVisible();
      await expectApprovedNavigation(page);

      await page.getByRole("link", { name: "Progress", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Plan version 1" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Completed training" }),
      ).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(detailUrl);
      await page.goForward();
      await expect(page).toHaveURL(/\/home\/progress$/);

      await context.setOffline(true);
      await expect(page.getByText(/^Offline\./)).toBeVisible();
      await context.setOffline(false);
      await expect(page.getByText(/^Offline\./)).toBeHidden();

      const detailResponse = await page.goto(detailUrl);
      expect(detailResponse?.headers()["cache-control"]).toContain("private");
      expect(detailResponse?.headers()["cache-control"]).toContain("no-store");
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Morning base run" }),
      ).toBeVisible();

      await page.screenshot({
        fullPage: true,
        path: "docs/validation/M1/evidence/M1-04-390x844.png",
      });

      await context.clearCookies();
      await page.goto(detailUrl);
      await expect(page).toHaveURL(/\/$/);
      expect(new URL(page.url()).search).toBe("");

      await page.goto("/?next=/home/progress");
      await page.getByLabel("Email").fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill(account.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/home\/progress$/);
      expect(pageErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

async function expectApprovedNavigation(page: import("@playwright/test").Page) {
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByRole("link")).toHaveCount(4);
  await expect(
    navigation.getByRole("link", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Plan", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Progress", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "You", exact: true }),
  ).toBeVisible();
  await expect(navigation).not.toContainText("History");
  await expect(navigation).not.toContainText("Coach");
}

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function createConfirmedLocalUser(
  request: import("@playwright/test").APIRequestContext,
) {
  const email = `fittip-m1-04-${Date.now()}@example.test`;
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
