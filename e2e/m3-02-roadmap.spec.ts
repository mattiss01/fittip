import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * M3-02 at 390x844.
 *
 * The whole owner journey on one disposable account: compose, review on the
 * spine, decline, regenerate with feedback, edit, and accept. It runs against
 * the network-free coaching path — no provider is reached and nothing is spent
 * — which is what makes it safe to run on every push.
 */

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

const PLANNING_NOTE =
  "I only have 45 minutes on weekdays. I am away the first weekend of every month.";

test.describe("M3-02 roadmap proposals", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("composes, reviews, declines, regenerates, edits and accepts at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);

      // A roadmap needs at least one active goal to attend to.
      await createCoreGoal(
        page,
        "Run a hilly half marathon",
        daysFromToday(120),
      );

      await page.goto("/home/plan/roadmap");
      await expect(
        page.getByRole("heading", { name: "Where this is going." }),
      ).toBeVisible();

      // The empty state states a fact and invites an action; it claims no
      // roadmap and no coaching judgment.
      await expect(page.getByText(/You have no roadmap\./)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-02-empty-390x844.png"),
      });

      // ---- Compose -------------------------------------------------------
      await page.getByRole("button", { name: "Create roadmap" }).click();
      await expect(
        page.getByRole("heading", { name: "Shape your roadmap" }),
      ).toBeVisible();
      await expect(
        page.getByText("Nothing changes until you accept a proposal."),
      ).toBeVisible();

      // Decision 4a: collapsed by default, and it names the exact material.
      const disclosure = page.getByText(/What the coach will use/);
      await expect(disclosure).toBeVisible();
      await disclosure.click();
      await expect(
        page.getByText(
          "Only active, accepted information and the bounded training window are included.",
        ),
      ).toBeVisible();

      await page
        .getByLabel("Anything the coach should account for? (optional)")
        .fill(PLANNING_NOTE);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-02-compose-390x844.png"),
      });

      await page
        .getByRole("button", { name: "Generate roadmap proposal" })
        .click();

      // ---- Review --------------------------------------------------------
      await expect(page.getByText("Direction, not a promise.")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText(/Phase 1 of/)).toBeVisible();
      await expect(page.getByText(/Aim for by/).first()).toBeVisible();
      await expect(page.getByText("When to reassess")).toBeVisible();

      // The spine is the widest thing on the surface. Nothing may scroll the
      // page sideways at 390px.
      await expectNoHorizontalOverflow(page);

      // Decision 3 forbids a confidence score, a percentage, and a
      // red/amber/green badge. Asserted rather than assumed.
      await expect(page.getByText(/\d+\s*%/)).toHaveCount(0);
      await expect(page.getByText(/confidence/i)).toHaveCount(0);

      // No action is preselected.
      for (const name of [
        "Accept roadmap",
        "Edit proposal",
        "Decline proposal",
      ]) {
        await expect(page.getByRole("button", { name })).toBeVisible();
      }
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-02-proposal-390x844.png"),
      });

      // The planning note produced a memory candidate, which is proposed and
      // separate from the roadmap decision.
      await expect(
        page.getByRole("heading", { name: "Possible memory updates" }),
      ).toBeVisible();

      // ---- Decline -------------------------------------------------------
      await page.getByRole("button", { name: "Decline proposal" }).click();
      await expect(
        page.getByText(
          "Decline this proposal? It will stay in your roadmap history and will not become current.",
        ),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-02-decline-390x844.png"),
      });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Decline proposal" })
        .click();

      // Declining never makes the content current.
      await expect(page.getByText(/You have no roadmap\./)).toBeVisible();

      // ---- Regenerate ----------------------------------------------------
      await page.getByRole("button", { name: "Regenerate proposal" }).click();
      await expect(
        page.getByRole("heading", { name: "Shape your roadmap" }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "The previous proposal will be shared with the coach. Nothing changes until you accept.",
        ),
      ).toBeVisible();

      // ADR-014 decision 6: feedback is required and starts empty every round.
      const feedback = page.getByLabel("What should the coach change?");
      await expect(feedback).toHaveValue("");
      await feedback.fill("The first phase is too long for these dates.");
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-02-regenerate-390x844.png"),
      });
      await page
        .getByRole("button", { name: "Generate another proposal" })
        .click();
      await expect(page.getByText("Direction, not a promise.")).toBeVisible({
        timeout: 60_000,
      });

      // ---- Edit ----------------------------------------------------------
      await page.getByRole("button", { name: "Edit proposal" }).click();
      await expect(
        page.getByRole("heading", { name: "Edit proposal" }),
      ).toBeVisible();
      const title = page.getByLabel("Roadmap title");
      await title.fill("My own shape for these months");
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-02-edit-390x844.png"),
      });
      await page
        .getByRole("button", { name: "Save as a new proposal" })
        .click();
      await expect(
        page.getByRole("heading", { name: "My own shape for these months" }),
      ).toBeVisible({ timeout: 30_000 });

      // ---- Accept --------------------------------------------------------
      await page.getByRole("button", { name: "Accept roadmap" }).click();
      await expect(page.getByText("Version 1")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("heading", { name: "My own shape for these months" }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-02-accepted-390x844.png"),
      });

      // An accepted roadmap offers a new proposal rather than a create action.
      await expect(
        page.getByRole("button", { name: "Propose a new roadmap" }),
      ).toBeVisible();

      expect(pageErrors).toEqual([]);
      await testInfo.attach("page-errors", {
        body: JSON.stringify(pageErrors.map(String)),
        contentType: "application/json",
      });
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

/** Reuses M2-01's accepted goal-creation interaction rather than a second one. */
async function createCoreGoal(
  page: import("@playwright/test").Page,
  title: string,
  targetDate: string,
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
    .fill("Finish the race feeling strong on the climbs.");
  await form.getByLabel("Attention").selectOption("core");
  await form.getByLabel("Sports or activity areas").fill("Running");
  await form.getByLabel("Start date").fill(today());
  await form.getByLabel("Target date").fill(targetDate);
  await form.getByRole("button", { name: "Create active goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 20_000,
  });
}

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
  const email = `fittip-m3-02-${Date.now()}@example.test`;
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
