import { expect, test } from "@playwright/test";
import path from "node:path";

const evidenceDirectory = path.join(
  process.cwd(),
  "test-results",
  "M2",
  "evidence",
);

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("M2-01 goal management", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("manages ranked goals and lifecycle safely at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);
      await page.getByRole("link", { name: "You", exact: true }).click();
      await page.getByRole("link", { name: /^Goals/ }).click();
      await expect(page).toHaveURL(/\/home\/you\/goals$/);
      await expect(
        page.getByRole("heading", { name: "Goals", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/No core goal yet/)).toBeVisible();

      await createGoal(page, "Trail event", "core", "Trail running");
      await createGoal(page, "Swim endurance", "core", "Swimming");
      await createGoal(page, "Climbing skill", "core", "Climbing");
      await createGoal(page, "Mobility habit", "supporting", "Mobility");

      await expect(
        page.getByRole("heading", { name: "Mobility habit" }),
      ).toBeVisible();
      await expect(page.getByLabel("0 core slots open")).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-01-core-supporting-390x844.png"),
      });

      await openAddPanel(page);
      const addForm = addGoalForm(page);
      await addForm.getByLabel("Goal title").fill("Fourth core");
      await addForm
        .getByLabel("Desired outcome")
        .fill("This must not become active core.");
      await addForm.getByLabel("Sports").fill("Running");
      // With three core goals the form starts on Supporting; Core is chosen
      // on purpose so the server has a fourth to refuse.
      await expect(addForm.getByLabel("Supporting")).toBeChecked();
      await addForm.getByLabel("Core").check();
      await addForm.getByRole("button", { name: "Create active goal" }).click();
      await expect(
        page.getByText(/Three core goals are already active/),
      ).toBeVisible();
      await expect(page.getByLabel("0 core slots open")).toBeVisible();
      await expect(addForm.getByLabel("Goal title")).toHaveValue("Fourth core");
      await expect(addForm.getByLabel("Desired outcome")).toHaveValue(
        "This must not become active core.",
      );
      await expect(addForm.getByLabel("Core")).toBeChecked();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-01-fourth-core-390x844.png"),
      });
      await addForm.getByRole("button", { name: "Cancel" }).click();

      const trailCard = goalCard(page, "Trail event");
      await openGoalDetails(trailCard);
      await trailCard.getByLabel("Supporting").check();
      await trailCard.getByRole("button", { name: "Save goal" }).click();
      // Saving closes the editor.
      await expect(trailCard.locator("[data-goal-editor]")).toHaveCount(0);
      await expect(
        goalCard(page, "Trail event").getByLabel("Rank 2"),
      ).toBeVisible();
      await openGoalDetails(goalCard(page, "Trail event"));
      await goalCard(page, "Trail event").getByLabel("Core").check();
      await goalCard(page, "Trail event")
        .getByRole("button", { name: "Save goal" })
        .click();
      await expect(
        goalCard(page, "Trail event").getByLabel("Rank 3"),
      ).toBeVisible();

      const mobilityTierCard = goalCard(page, "Mobility habit");
      await openGoalDetails(mobilityTierCard);
      await mobilityTierCard.getByLabel("Core").check();
      await mobilityTierCard.getByRole("button", { name: "Save goal" }).click();
      await expect(
        page.getByText(/Three core goals are already active/),
      ).toBeVisible();
      // A refusal keeps the editor open with what was chosen.
      await expect(mobilityTierCard.getByLabel("Core")).toBeChecked();
      await expect(mobilityTierCard.getByLabel("Rank 1")).toBeVisible();
      await mobilityTierCard.getByRole("button", { name: "Cancel" }).click();

      const stalePage = await page.context().newPage();
      await stalePage.goto("/home/you/goals");
      await expect(stalePage.getByLabel("0 core slots open")).toBeVisible();

      // Trail event holds rank 3 and Climbing skill rank 2 before this move.
      // Asserting Swim endurance still holds rank 1 proves nothing, because
      // that was already true; both moved ranks are asserted instead.
      await expect(
        goalCard(page, "Climbing skill").getByLabel("Rank 2"),
      ).toBeVisible();
      await moveUp(page, "Trail event");
      await expect(
        goalCard(page, "Trail event").getByLabel("Rank 2"),
      ).toBeVisible();
      await expect(
        goalCard(page, "Climbing skill").getByLabel("Rank 3"),
      ).toBeVisible();
      await expect(
        goalCard(page, "Swim endurance").getByLabel("Rank 1"),
      ).toBeVisible();
      await moveUp(stalePage, "Trail event");
      await expect(
        stalePage.getByText(/Goals changed in another tab/),
      ).toBeVisible();
      const reloadGoals = stalePage.getByRole("link", {
        name: "Reload current goals",
      });
      await expect(reloadGoals).toBeVisible();
      await stalePage.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-01-stale-conflict-390x844.png"),
      });
      await reloadGoals.focus();
      await stalePage.keyboard.press("Enter");
      await expect(
        stalePage.getByText(/Goals changed in another tab/),
      ).toBeHidden();
      await expect(
        goalCard(stalePage, "Trail event").getByLabel("Rank 2"),
      ).toBeVisible();
      await stalePage.close();

      await openGoalDetails(trailCard);
      await trailCard.getByLabel("Goal title").fill("Trail event revised");
      await trailCard.getByRole("button", { name: "Save goal" }).click();
      await expect(
        page.getByRole("heading", { name: "Trail event revised" }),
      ).toBeVisible();

      const climbingCard = goalCard(page, "Climbing skill");
      await openGoalDetails(climbingCard);
      await climbingCard.getByRole("button", { name: "Pause" }).click();
      await expect(page.getByLabel("1 core slots open")).toBeVisible();
      const pausedSection = page.locator("details").filter({
        has: page.locator("summary").filter({ hasText: /^Paused/ }),
      });
      await pausedSection.locator("summary").click();
      await expect(
        pausedSection.getByText("Climbing skill", { exact: true }),
      ).toBeVisible();
      await pausedSection.getByRole("button", { name: "Resume" }).click();
      await expect(page.getByLabel("0 core slots open")).toBeVisible();

      const mobilityCard = goalCard(page, "Mobility habit");
      await openGoalDetails(mobilityCard);
      // Archive is no longer offered (owner, 2 Oct 2026). This goal is set
      // aside by keyboard through Abandoned, which keeps the same checks: the
      // confirmation opens on Enter and its button is next in the tab order.
      const setAsideConfirmation = confirmation(
        mobilityCard,
        "Abandoned",
        "Confirm abandoned",
      );
      await expect(
        mobilityCard.locator('details[data-confirmation="archive"]'),
      ).toHaveCount(0);
      await setAsideConfirmation.summary.focus();
      await page.keyboard.press("Enter");
      await expect(
        mobilityCard.getByText(/records the goal as abandoned/i),
      ).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(setAsideConfirmation.confirm).toBeFocused();
      await setAsideConfirmation.confirm.click();
      // The status message is transient and is lost if the surface has to
      // reload itself, so every lifecycle step asserts the committed record
      // instead. The message copy is covered by the action unit tests.
      await expect(
        page.getByRole("heading", { name: "Mobility habit" }),
      ).toBeHidden();
      await expect(historyEntry(page, "Mobility habit")).toContainText(
        "Abandoned on",
      );

      await createGoal(page, "Achievement candidate", "supporting", "Cycling");
      const achievementCard = goalCard(page, "Achievement candidate");
      await openGoalDetails(achievementCard);
      const achieveConfirmation = confirmation(
        achievementCard,
        "Achieved",
        "Confirm achieved",
      );
      await achieveConfirmation.summary.click();
      await expect(
        achievementCard.getByText(/records the goal as achieved/i),
      ).toBeVisible();
      await achieveConfirmation.confirm.click();
      await expect(
        page.getByRole("heading", { name: "Achievement candidate" }),
      ).toBeHidden();
      await expect(historyEntry(page, "Achievement candidate")).toContainText(
        "Achieved on",
      );

      await createGoal(page, "Abandon candidate", "supporting", "Rowing");
      const abandonCard = goalCard(page, "Abandon candidate");
      await openGoalDetails(abandonCard);
      const abandonConfirmation = confirmation(
        abandonCard,
        "Abandoned",
        "Confirm abandoned",
      );
      await abandonConfirmation.summary.click();
      await expect(
        abandonCard.getByText(/records the goal as abandoned/i),
      ).toBeVisible();
      await abandonConfirmation.confirm.click();
      await expect(
        page.getByRole("heading", { name: "Abandon candidate" }),
      ).toBeHidden();
      await expect(historyEntry(page, "Abandon candidate")).toContainText(
        "Abandoned on",
      );

      await createGoal(page, "Temporary idea", "supporting", "Walking");
      const temporaryCard = goalCard(page, "Temporary idea");
      await openGoalDetails(temporaryCard);
      const deleteConfirmation = confirmation(
        temporaryCard,
        "Delete",
        "Confirm permanent delete",
      );
      await deleteConfirmation.summary.click();
      await expect(temporaryCard.getByText(/cannot be undone/i)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(
          evidenceDirectory,
          "M2-01-destructive-action-390x844.png",
        ),
      });
      await deleteConfirmation.confirm.click();
      await expect(
        page.getByRole("heading", { name: "Temporary idea" }),
      ).toBeHidden();

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m2-01-final-390x844.png"),
      });
      expect(pageErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

// M2-05. A goal mutation whose result never reaches the surface used to leave
// the page on "Saving goal change…" for ever, with no error and stale content.
// Holding the response open reproduces that shape deterministically, so the
// honest message and its recovery action are covered rather than left to the
// intermittent race that produced the original reports.
test.describe("M2-05 unconfirmed goal mutation", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("reports a goal mutation it cannot confirm at 390x844", async ({
    page,
    request,
  }) => {
    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);
      await page.goto("/home/you/goals");
      await expect(
        page.getByRole("heading", { name: "Goals", exact: true }),
      ).toBeVisible();

      await page.route(
        (url) => url.pathname === "/home/you/goals",
        async (route) => {
          if (route.request().method() !== "POST") {
            await route.continue();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 45_000));
          await route.abort();
        },
      );

      await openAddPanel(page);
      const form = addGoalForm(page);
      await form.getByLabel("Goal title").fill("Unconfirmed goal");
      await form.getByLabel("Desired outcome").fill("This is never confirmed.");
      await form.getByLabel("Sports").fill("Running");
      await form.getByLabel("Supporting").check();
      await form.getByRole("button", { name: "Create active goal" }).click();

      const notice = page.getByRole("status");
      await expect(notice).toHaveText("Saving goal change…");
      // The surface must stop claiming to be saving and say what it knows.
      // The wait exceeds the confirmation budget on purpose; the shared expect
      // budget stays as it is so a genuine regression still fails fast.
      await expect(notice).toHaveText(
        "This goal change has not been confirmed. Reload to see whether it was saved.",
        { timeout: 20_000 },
      );
      // `.srOnly` is a 1x1 clipped element that Playwright still reports as
      // visible, so the rendered state is asserted instead of `toBeVisible`.
      await expect(notice).toHaveAttribute("data-state", "unconfirmed");
      await expect(notice).not.toHaveClass(/srOnly/);
      await expect(
        page.getByRole("link", { name: "Reload current goals" }),
      ).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-05-unconfirmed-390x844.png"),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

async function createGoal(
  page: import("@playwright/test").Page,
  title: string,
  tier: "core" | "supporting",
  area: string,
) {
  await openAddPanel(page);
  const form = addGoalForm(page);
  await form.getByLabel("Goal title").fill(title);
  await form
    .getByLabel("Desired outcome")
    .fill(`Make measurable progress toward ${title.toLowerCase()}.`);
  await form.getByLabel("Sports").fill(area);
  await form.getByLabel(tier === "core" ? "Core" : "Supporting").check();
  await form.getByRole("button", { name: "Create active goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** "Add goal" is a button that opens the form; creating a goal closes it. */
async function openAddPanel(page: import("@playwright/test").Page) {
  const open = page.getByRole("button", { name: "Add goal" });
  // One of the two is on the page once it has loaded.
  await expect(open.or(addGoalForm(page))).toBeVisible();
  if (await open.isVisible()) await open.click();
  await expect(addGoalForm(page)).toBeVisible();
}

function addGoalForm(page: import("@playwright/test").Page) {
  return page.locator('section[aria-label="Add goal"] form');
}

/**
 * A card is reordered by dragging its number or, as here, with the arrow keys
 * while the number has focus. Move up and Move down are gone (5 Oct 2026).
 */
async function moveUp(page: import("@playwright/test").Page, title: string) {
  const handle = goalCard(page, title).getByRole("button", {
    name: /: rank \d+ of \d+/,
  });
  await expect(handle).toBeEnabled();
  await handle.focus();
  await page.keyboard.press("ArrowUp");
}

function historyEntry(page: import("@playwright/test").Page, title: string) {
  return page
    .locator("details")
    .filter({
      has: page.locator("summary").filter({ hasText: /^History/ }),
    })
    .locator("li")
    .filter({ hasText: title });
}

function goalCard(page: import("@playwright/test").Page, title: string) {
  return page
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title }) });
}

/** Edit opens a card's editor; it stays open after a refused save. */
async function openGoalDetails(card: import("@playwright/test").Locator) {
  const editor = card.locator("[data-goal-editor]");
  if ((await editor.count()) === 0) {
    await card.getByRole("button", { name: "Edit", exact: true }).click();
  }
  await expect(editor).toBeVisible();
}

function confirmation(
  card: import("@playwright/test").Locator,
  label: string,
  confirmLabel: string,
) {
  const operation = {
    Achieved: "achieve",
    Abandoned: "abandon",
    Delete: "delete",
  }[label];
  const details = card.locator(`details[data-confirmation="${operation}"]`);
  return {
    summary: details.locator(":scope > summary"),
    confirm: details.getByRole("button", { name: confirmLabel }),
  };
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
  const email = `fittip-m2-01-${Date.now()}@example.test`;
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
