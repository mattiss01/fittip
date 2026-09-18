import {
  expect,
  test,
  type APIRequestContext,
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

/**
 * The roadmap write path, end to end, at 390x844.
 *
 * It runs the loop the ticket describes and then runs the front half of it
 * again, because "the previous version is preserved" is only observable after a
 * second acceptance. Everything it asserts is something an owner can see: the
 * example label on what the built-in coach wrote, the new proposal an edit
 * creates beside the one it came from, the regeneration that a decline unlocks,
 * and the version history that acceptance builds rather than overwrites.
 *
 * With no provider credential configured the built-in example coach answers, so
 * this flow spends nothing. That is the same path the Preview runs on, which is
 * why the example label is asserted rather than tolerated.
 */
test.describe("M3-15F roadmap generation", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("generates, edits, declines, regenerates and accepts a roadmap at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    // Declining asks first, and Playwright dismisses a dialog unless something
    // answers it. Accepting every dialog here is safe because declining is the
    // only control on this surface that opens one.
    page.on("dialog", (dialog) => void dialog.accept());

    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);

      // ---- A zone and a goal: the coach reads the window from one and has
      // ---- nothing to plan toward without the other. ----
      await page.goto("/home/plan");
      await page.getByRole("button", { name: `Use ${TIMEZONE}` }).click();
      await expect(page.locator("[data-plan-date]").first()).toBeVisible();

      await page.goto("/home/you/goals");
      await createGoal(page, "Hilly half marathon");

      // ---- An owner with no roadmap is told so, and is offered the one
      // ---- control that can change it. ----
      const first = await page.goto("/home/plan/roadmap");
      expect(first?.status()).toBe(200);
      expect(first?.headers()["cache-control"]).toContain("private");
      expect(first?.headers()["cache-control"]).toContain("no-store");
      await expect(
        page.getByRole("heading", { name: "Where this is going." }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "No roadmap yet." }),
      ).toBeVisible();

      const compose = page.locator('[data-roadmap-compose="initial"]');
      await expect(compose).toBeVisible();
      await expect(
        compose.getByRole("button", { name: "Generate roadmap proposal" }),
      ).toBeEnabled();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15F-compose-390x844.png"),
      });

      // ---- Generate. ----
      await compose
        .getByLabel("Anything the coach should account for? (optional)")
        .fill("Tuesdays are impossible until December.");
      await compose
        .getByRole("button", { name: "Generate roadmap proposal" })
        .click();

      const review = page.locator("[data-roadmap-open-proposal]");
      await expect(review).toBeVisible();
      await expectOutcome(page, "A proposal is ready below.");
      await expect(review.getByText("Awaiting your decision")).toBeVisible();
      // Everything the built-in coach wrote says so, wherever it appears.
      await expect(
        review.locator("[data-roadmap-example]").first(),
      ).toBeVisible();
      await expect(page.locator("[data-roadmap-example-notice]")).toBeVisible();
      // Nothing has been written to the roadmap itself yet.
      await expect(
        page
          .locator("[data-roadmap-current]")
          .getByRole("heading", { name: "No roadmap yet." }),
      ).toBeVisible();
      // While a proposal is open there is nothing to compose.
      await expect(page.locator("[data-roadmap-compose]")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15F-proposal-390x844.png"),
      });

      // ---- Edit: a new proposal, never a rewrite of the one it came from. ----
      const originalTitle = await review
        .locator("[data-roadmap-example] ~ h2")
        .first()
        .innerText();
      await review.getByRole("button", { name: "Edit proposal" }).click();
      await page.getByLabel("Roadmap title").fill("My own wording");
      await page
        .getByRole("button", { name: "Save as a new proposal" })
        .click();

      await expect(
        page
          .locator("[data-roadmap-open-proposal]")
          .getByRole("heading", { name: "My own wording" }),
      ).toBeVisible();
      await expectOutcome(page, "Saved as a new proposal. Review it below.");
      // The proposal the edit came from is still in the history, unchanged and
      // no longer awaiting anything.
      const proposals = page.locator("[data-roadmap-proposals]");
      await expect(
        proposals.getByRole("heading", { name: originalTitle }),
      ).toBeVisible();
      await expect(proposals.getByText("Superseded")).toBeVisible();
      await expect(proposals.getByText("Your edit")).toBeVisible();

      // ---- Decline, then regenerate against it. ----
      await page
        .locator("[data-roadmap-open-proposal]")
        .getByRole("button", { name: "Decline proposal" })
        .click();
      await expect(page.locator("[data-roadmap-open-proposal]")).toHaveCount(0);
      await expectOutcome(page, "Declined. It stays in your history.");
      await expect(proposals.getByText("Declined")).toBeVisible();

      const regenerate = page.locator('[data-roadmap-compose="regeneration"]');
      await expect(regenerate).toBeVisible();
      // Three, not two: what was declined is the owner's edit, and an edit
      // shares the generation request of the proposal it came from, so no
      // regeneration has been spent on these dates yet.
      await expect(
        regenerate.getByText("3 regenerations left on these dates."),
      ).toBeVisible();
      await regenerate
        .getByLabel("What should the coach change?")
        .fill("Start easier and build later.");
      await regenerate
        .getByRole("button", { name: "Generate another proposal" })
        .click();

      const regenerated = page.locator("[data-roadmap-open-proposal]");
      await expect(regenerated).toBeVisible();
      await expectOutcome(page, "A proposal is ready below.");
      await expect(regenerated.getByText("Regenerated")).toBeVisible();

      // ---- Accept: it becomes the roadmap. ----
      await regenerated.getByRole("button", { name: "Accept roadmap" }).click();
      await expect(page.locator("[data-roadmap-open-proposal]")).toHaveCount(0);
      await expectOutcome(page, "Accepted. This is your roadmap now.");
      await expect(page.locator('[data-roadmap-version="1"]')).toBeVisible();
      await expect(
        page
          .getByRole("heading", { name: "No roadmap yet." })
          .or(page.getByText("No roadmap yet", { exact: true })),
      ).toHaveCount(0);
      const acceptedTitle = await page
        .locator('[data-roadmap-version="1"] h2')
        .first()
        .innerText();
      // An accepted example is still an example.
      await expect(
        page.locator("[data-roadmap-current] [data-roadmap-example]"),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15F-accepted-390x844.png"),
      });

      // ---- A second roadmap: the first one is preserved, not replaced. ----
      const second = page.locator('[data-roadmap-compose="initial"]');
      await expect(second).toBeVisible();
      await second
        .getByRole("button", { name: "Generate roadmap proposal" })
        .click();
      await page
        .locator("[data-roadmap-open-proposal]")
        .getByRole("button", { name: "Accept roadmap" })
        .click();

      await expect(page.locator('[data-roadmap-version="2"]')).toBeVisible();
      const superseded = page.locator("[data-roadmap-superseded]");
      await expect(
        superseded.locator('[data-roadmap-superseded-version="1"]'),
      ).toBeVisible();
      await expect(
        superseded.getByRole("heading", { name: acceptedTitle }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15F-history-390x844.png"),
      });

      expect(pageErrors, pageErrors.map(String).join("\n")).toHaveLength(0);
      await testInfo.attach("roadmap-final", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

/**
 * What the surface says after a write that landed: the approved sentence, and
 * nothing else.
 *
 * This used to accept the recovery notice as an alternative, on the reasoning
 * that a watchdog reload is also a true thing to say. That made the four
 * approved sentences unassertable on any path the watchdog touched, which
 * turned out to be every write after the first — the control that mounts after
 * a write inherited that write's reply and declared the next one lost. With
 * that fixed, a recovery here is a genuine lost render, and a genuine lost
 * render on this flow is something a run must fail loudly on rather than pass
 * over: it is either the upstream defect actually occurring or a new way of
 * mistaking a healthy write for a stuck one, and only a failure tells them
 * apart.
 */
async function expectOutcome(page: Page, sentence: string) {
  await expect(
    page.locator("[data-roadmap-outcome]").getByText(sentence, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-roadmap-notice="recovered"]')).toHaveCount(
    0,
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow, "the surface must not scroll sideways at 390px").toBe(false);
}

async function createGoal(page: Page, title: string) {
  const panel = page.locator("details").filter({ hasText: "Add goal" });
  if ((await panel.getAttribute("open")) === null) {
    await panel.getByText("Add goal", { exact: true }).click();
  }
  const form = panel.locator("form");
  await form.getByLabel("Goal title").fill(title);
  await form
    .getByLabel("Desired outcome")
    .fill("Finish the hilly half without walking the climbs.");
  await form.getByLabel("Attention").selectOption("core");
  await form.getByLabel("Sports or activity areas").fill("Running");
  await form.getByLabel("Start date").fill(isoDate(0));
  await form.getByRole("button", { name: "Create active goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home\/today$/);
}

type LocalAccount = { email: string; password: string; userId: string };

async function createConfirmedLocalUser(
  request: APIRequestContext,
): Promise<LocalAccount> {
  const email = `fittip-m3-15f-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
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
