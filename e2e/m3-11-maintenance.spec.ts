import { expect, test } from "@playwright/test";
import path from "node:path";

const routes = [
  "/home/plan",
  "/home/today",
  "/home/log",
  "/home/progress",
  "/home/plan/roadmap",
  "/home/plan/proposal",
] as const;

const legacyObjects = [
  "detailed_plan",
  "planned_sessions",
  "completed_sessions",
  "completion_heads",
  "plan_generation",
  "plan_proposals",
  "save_manual_plan_version",
  "save_training_completion",
] as const;

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("M3-11 training maintenance", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("keeps every reset route truthful and query-free at 390x844", async ({
    page,
    request,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    const legacyRequests: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("request", (outbound) => {
      if (legacyObjects.some((name) => outbound.url().includes(name))) {
        legacyRequests.push(outbound.url());
      }
    });
    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);

      for (const route of routes) {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        expect(response?.headers()["cache-control"]).toContain("private");
        expect(response?.headers()["cache-control"]).toContain("no-store");
        await expect(
          page.getByRole("heading", { name: "One plan is taking shape." }),
        ).toBeVisible();
        await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }

      await page.getByRole("link", { name: "Open You" }).focus();
      await expect(page.getByRole("link", { name: "Open You" })).toBeFocused();
      await page.screenshot({
        fullPage: true,
        path: path.join(
          process.cwd(),
          "docs",
          "validation",
          "M3",
          "evidence",
          "M3-11-maintenance-390x844.png",
        ),
      });

      expect(legacyRequests).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home\/today$/);
}

async function createConfirmedLocalUser(
  request: import("@playwright/test").APIRequestContext,
) {
  const email = `fittip-m3-11-${Date.now()}@example.test`;
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
