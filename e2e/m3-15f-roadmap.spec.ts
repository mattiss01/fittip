import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import path from "node:path";
import { fillDate } from "./support/date-field";
import { openAddGoalForm } from "./support/goal-form";

const evidenceDirectory = path.join(
  process.cwd(),
  "test-results",
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

      // ---- An owner with no roadmap is offered the coach's form, and
      // ---- nothing else is on the page (owner, 14 Oct 2026). ----
      const first = await page.goto("/home/plan/roadmap");
      expect(first?.status()).toBe(200);
      expect(first?.headers()["cache-control"]).toContain("private");
      expect(first?.headers()["cache-control"]).toContain("no-store");
      await expect(
        page.getByRole("heading", { level: 1, name: "Roadmap", exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-roadmap-current]")).toHaveCount(0);

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
      await expect(page.locator("[data-roadmap-current]")).toHaveCount(0);
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
      // The form and nothing of the proposal beside it (owner, 14 Oct 2026).
      const editor = page.locator('[data-roadmap-write="edit"]');
      await expect(editor).toBeVisible();
      await expect(page.getByText("Awaiting your decision")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      // The roadmap's title comes before each phase's.
      await editor
        .getByLabel("Title", { exact: true })
        .first()
        .fill("My own wording");
      await editor
        .getByRole("button", { name: "Save as a new proposal" })
        .click();

      await expect(
        page
          .locator("[data-roadmap-open-proposal]")
          .getByRole("heading", { name: "My own wording" }),
      ).toBeVisible();
      await expectOutcome(page, "Saved as a new proposal. Review it below.");
      // The proposal the edit came from is stored and no longer shown (owner,
      // 13 Oct 2026): one proposal awaits a decision, and it is the edit.
      expect(originalTitle).not.toBe("My own wording");
      await expect(
        page.getByRole("heading", { name: originalTitle }),
      ).toHaveCount(0);
      await expect(page.getByText("Awaiting your decision")).toHaveCount(1);
      await expect(page.locator("[data-roadmap-proposals]")).toHaveCount(0);

      // ---- Ask for another, on the proposal (owner, 14 Oct 2026): the button
      // ---- first, then what should change; it is declined and asked again
      // ---- in one step. ----
      await page
        .locator("[data-roadmap-open-proposal]")
        .getByRole("button", { name: "Ask for another" })
        .click();
      const askAgain = page.locator("[data-roadmap-ask-again]");
      // Three, not two: what is declined is the owner's edit, and an edit
      // shares the generation request of the proposal it came from, so no
      // regeneration has been spent on these dates yet.
      await expect(
        askAgain.getByText("3 regenerations left on these dates."),
      ).toBeVisible();
      // The proposal is still there to read while the note is written.
      await expect(
        page
          .locator("[data-roadmap-open-proposal]")
          .getByRole("heading", { name: "My own wording" }),
      ).toBeVisible();
      await askAgain
        .getByLabel("What should change?")
        .fill("Start easier and build later.");
      await askAgain
        .getByRole("button", { name: "Decline and ask again" })
        .click();

      const regenerated = page.locator("[data-roadmap-open-proposal]");
      await expect(regenerated.getByText("Regenerated")).toBeVisible();
      await expectOutcome(page, "A proposal is ready below.");

      // ---- Accept: it becomes the roadmap. ----
      await regenerated.getByRole("button", { name: "Accept roadmap" }).click();
      await expect(page.locator("[data-roadmap-open-proposal]")).toHaveCount(0);
      await expectOutcome(page, "Accepted. This is your roadmap now.");
      await expect(page.locator('[data-roadmap-version="1"]')).toBeVisible();
      // A review after every phase, the app's own (ADR-027). The example
      // roadmap starts today, so none has ended and nothing asks yet. A due
      // review needs a phase in the past, which no flow can make: that half
      // is proved in the unit and database tests.
      const reviews = page.locator(
        "[data-roadmap-current] [data-roadmap-review]",
      );
      await expect(reviews.first()).toContainText(/^Review on \d{1,2} \w{3,4}/);
      await expect(reviews.last()).toContainText("End of the roadmap");
      await expect(
        page.locator(
          '[data-roadmap-review]:not([data-roadmap-review="ahead"])',
        ),
      ).toHaveCount(0);
      await expect(page.locator("[data-roadmap-review-due]")).toHaveCount(0);
      // An accepted example is still an example.
      await expect(
        page.locator("[data-roadmap-current] [data-roadmap-example]"),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M3-15F-accepted-390x844.png"),
      });

      // ---- Whether a milestone was reached (ADR-026): one tick, taken back
      // ---- as easily, and the day is the one the database set. ----
      const tick = page
        .locator("[data-roadmap-current] [data-milestone-reached]")
        .first();
      await expect(tick).toHaveAttribute("data-milestone-reached", "false");
      await tick.getByRole("button", { name: /^Mark reached: / }).click();
      await expect(tick).toHaveAttribute("data-milestone-reached", "true");
      await expect(
        tick.getByText(/^Reached \d{1,2} \w{3,4} \d{4}$/),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      // It is stored, not remembered by the page.
      await page.reload();
      await expect(tick).toHaveAttribute("data-milestone-reached", "true");
      await tick.getByRole("button", { name: /^Undo reached: / }).click();
      await expect(tick).toHaveAttribute("data-milestone-reached", "false");
      await expect(tick.getByText(/^Reached /)).toHaveCount(0);
      await tick.getByRole("button", { name: /^Mark reached: / }).click();
      await expect(tick).toHaveAttribute("data-milestone-reached", "true");

      // ---- A second roadmap. With one in force the page starts with it, and
      // ---- changing it is behind "Change roadmap": a sheet that asks which
      // ---- way (ADR-028). ----
      await expect(page.locator("[data-roadmap-compose]")).toHaveCount(0);
      await page.getByRole("button", { name: "Change roadmap" }).click();
      const menu = page.getByRole("dialog", { name: "Change roadmap" });
      await expect(menu.locator("[data-roadmap-choice]")).toHaveCount(3);
      await expectNoHorizontalOverflow(page);
      await menu.locator('[data-roadmap-choice="change"]').click();

      // Change with Coach: what should be different, and the dates it opens
      // on are today and the day the roadmap ends.
      const change = page
        .getByRole("dialog", { name: "Change with Coach" })
        .locator('[data-roadmap-compose="change"]');
      await expect(change).toBeVisible();
      await expect(change.getByLabel("Ends")).not.toHaveValue("");
      await expectNoHorizontalOverflow(page);
      // It says what should change, or it is not sent.
      await change.getByRole("button", { name: "Ask the coach" }).click();
      await expect(page.locator("[data-roadmap-open-proposal]")).toHaveCount(0);
      await change
        .getByLabel("What should change?")
        .fill("Make the second phase easier.");
      await change.getByRole("button", { name: "Ask the coach" }).click();
      await expectOutcome(page, "A proposal is ready below.");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // Decide, then ask again: no way to change it while one is waiting.
      await expect(
        page.getByRole("button", { name: "Change roadmap" }),
      ).toHaveCount(0);
      // Declined: the proposal is gone, so the sheet's second choice is a
      // new roadmap, asked afresh (owner, 14 Oct 2026).
      await page
        .locator("[data-roadmap-open-proposal]")
        .getByRole("button", { name: "Decline proposal" })
        .click();
      await expect(page.locator("[data-roadmap-open-proposal]")).toHaveCount(0);
      await page.getByRole("button", { name: "Change roadmap" }).click();
      const again = page
        .getByRole("dialog", { name: "Change roadmap" })
        .locator('[data-roadmap-choice="fresh"]');
      await expect(again).toContainText("New roadmap with Coach");
      await again.click();
      const afresh = page
        .getByRole("dialog", { name: "Shape your roadmap" })
        .locator('[data-roadmap-compose="initial"]');
      await afresh
        .getByRole("button", { name: "Generate roadmap proposal" })
        .click();
      await expectOutcome(page, "A proposal is ready below.");
      await page
        .locator("[data-roadmap-open-proposal]")
        .getByRole("button", { name: "Accept roadmap" })
        .click();
      await expect(page.locator('[data-roadmap-version="2"]')).toBeVisible();

      // And a new one, the other choice.
      await page.getByRole("button", { name: "Change roadmap" }).click();
      await page
        .getByRole("dialog", { name: "Change roadmap" })
        .locator('[data-roadmap-choice="fresh"]')
        .click();
      const second = page
        .getByRole("dialog", { name: "Shape your roadmap" })
        .locator('[data-roadmap-compose="initial"]');
      await expect(second).toBeVisible();
      await second
        .getByRole("button", { name: "Generate roadmap proposal" })
        .click();
      await page
        .locator("[data-roadmap-open-proposal]")
        .getByRole("button", { name: "Accept roadmap" })
        .click();

      // Version 3 is the roadmap now. The earlier two are stored, not listed.
      await expect(page.locator('[data-roadmap-version="3"]')).toBeVisible();
      await expect(page.locator('[data-roadmap-version="2"]')).toHaveCount(0);
      // A mark belongs to the roadmap it was made on: the new one starts with
      // none, though version 1's first milestone was left marked.
      await expect(page.locator('[data-milestone-reached="true"]')).toHaveCount(
        0,
      );
      // The tick is its circle; the form around an open one has no size.
      await expect(
        page
          .locator('[data-milestone-reached="false"]')
          .first()
          .getByRole("button"),
      ).toBeVisible();
      await expect(page.locator('[data-roadmap-version="1"]')).toHaveCount(0);
      await expect(page.locator("[data-roadmap-superseded]")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);

      // ---- Written by hand (ADR-029): the third choice, in force on save,
      // ---- with nothing to review and no example label. ----
      await page.getByRole("button", { name: "Change roadmap" }).click();
      await page
        .getByRole("dialog", { name: "Change roadmap" })
        .locator('[data-roadmap-choice="write"]')
        .click();
      const writer = page
        .getByRole("dialog", { name: "Write your roadmap" })
        .locator("[data-roadmap-write]");
      await expect(writer).toBeVisible();
      await expectNoHorizontalOverflow(page);
      // The roadmap's title comes before the phase's.
      await writer
        .getByLabel("Title", { exact: true })
        .first()
        .fill("My own way to the half");
      // The roadmap's own "Ends" comes first; its one phase ends with it.
      const roadmapEnd = shiftDays(ownerToday(), 56);
      await writer.getByLabel("Ends", { exact: true }).first().fill(roadmapEnd);
      const phase = writer.locator('[data-roadmap-write-phase="1"]');
      await fillDate(phase, "Ends", roadmapEnd);
      await phase.getByLabel("Title", { exact: true }).fill("Steady base");
      await phase
        .getByLabel("What it's for")
        .fill("Easy running, three times a week.");
      // Goals are chips, with no level to choose (owner, 14 Oct 2026).
      await phase.getByRole("button", { name: "Hilly half marathon" }).click();
      await writer.getByRole("button", { name: "Save roadmap" }).click();
      await expectOutcome(page, "Saved. This is your roadmap now.");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator('[data-roadmap-version="4"]')).toBeVisible();
      await expect(page.locator("[data-roadmap-current]")).toContainText(
        "My own way to the half",
      );
      await expect(
        page.locator("[data-roadmap-current] [data-roadmap-example]"),
      ).toHaveCount(0);
      await expect(page.locator("[data-roadmap-open-proposal]")).toHaveCount(0);
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

/** The owner's today, in the zone this flow confirms. */
function ownerToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(
    new Date(),
  );
}

function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
  const form = await openAddGoalForm(page);
  await form.getByLabel("Goal title").fill(title);
  await form
    .getByLabel("Desired outcome")
    .fill("Finish the hilly half without walking the climbs.");
  await form.getByLabel("Sports").fill("Running");
  await form.getByRole("radio", { name: "Core" }).check();
  await form.getByRole("button", { name: "Create active goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
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
