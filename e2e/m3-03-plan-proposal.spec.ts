import { expect, test } from "@playwright/test";
import path from "node:path";

const evidenceDirectory = path.join(
  process.cwd(),
  "docs",
  "validation",
  "M3",
  "evidence",
);

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("M3-03 selected-horizon plan proposal", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("composes without a roadmap, reviews every day and rejects at 390x844", async ({
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

    try {
      await signIn(page, account.email, account.password);
      await createCoreGoal(page, "Build an easy running base");

      const response = await page.goto("/home/plan/proposal");
      expect(response?.headers()["cache-control"]).toContain("private");
      expect(response?.headers()["cache-control"]).toContain("no-store");
      await expect(
        page.getByRole("heading", { name: "Make the days legible." }),
      ).toBeVisible();
      await expect(page.getByText("No roadmap is required.")).not.toBeVisible();

      const disclosure = page.getByText("What the coach will use");
      await disclosure.click();
      await expect(page.getByText("No roadmap is required.")).toBeVisible();

      await page.getByRole("radio", { name: "3" }).check();
      await expect(page.getByLabel("Start date")).toHaveValue(ownerToday());
      await expect(
        page.getByLabel("Anything the coach should account for? (optional)"),
      ).toHaveValue("");
      await page
        .getByLabel("Anything the coach should account for? (optional)")
        .fill("I only have 45 minutes on weekdays.");
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-03-compose-390x844.png"),
      });

      await page
        .getByRole("button", { name: "Generate plan proposal" })
        .click();
      await expect(
        page.getByRole("heading", { name: "A shape for these days." }),
      ).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Proposal ready")).toBeVisible();
      await expect(page.getByText("Planned rest")).toBeVisible();
      await expect(page.getByText(/No session planned/)).toBeVisible();
      await expect(
        page.locator("section[aria-labelledby^='day-']"),
      ).toHaveCount(3);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-03-proposal-390x844.png"),
      });

      await page.getByRole("button", { name: "Continue" }).click();
      await expect(
        page.getByText(/Editing, locking and accepting.*M3-04/),
      ).toBeVisible();
      await page.getByRole("button", { name: "Keep reviewing" }).click();

      await page.getByRole("button", { name: "Reject proposal" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Reject proposal" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Shape the next few days" }),
      ).toBeVisible({ timeout: 30_000 });

      // Remembered day count, but no remembered start date or note.
      await expect(page.getByRole("radio", { name: "3" })).toBeChecked();
      await expect(page.getByLabel("Start date")).toHaveValue(ownerToday());
      await expect(
        page.getByLabel("Anything the coach should account for? (optional)"),
      ).toHaveValue("");
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

async function createCoreGoal(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.goto("/home/you/goals");
  const panel = page.locator("details").filter({ hasText: "Add goal" });
  if ((await panel.getAttribute("open")) === null) {
    await panel.getByText("Add goal", { exact: true }).click();
  }
  const form = panel.locator("form");
  await form.getByLabel("Goal title").fill(title);
  await form
    .getByLabel("Desired outcome")
    .fill("Train consistently and finish fresh.");
  await form.getByLabel("Attention").selectOption("core");
  await form.getByLabel("Sports or activity areas").fill("Running");
  await form.getByLabel("Start date").fill(today());
  await form.getByRole("button", { name: "Create active goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 20_000,
  });
}

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ownerToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
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
  await expect(page).toHaveURL(/\/home\/today$/);
}

async function createConfirmedLocalUser(
  request: import("@playwright/test").APIRequestContext,
) {
  const email = `fittip-m3-03-${Date.now()}@example.test`;
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
  if (!response.ok())
    throw new Error(`Local Auth provisioning failed: ${response.status()}`);
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
  if (!response.ok())
    throw new Error(`Local Auth cleanup failed: ${response.status()}`);
}
