import { expect, test } from "@playwright/test";
import path from "node:path";

const evidenceDirectory = path.join(
  process.cwd(),
  "docs",
  "validation",
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
      await page.getByRole("link", { name: "Manage goals" }).click();
      await expect(page).toHaveURL(/\/home\/you\/goals$/);
      await expect(
        page.getByRole("heading", { name: "Direct your attention." }),
      ).toBeVisible();
      await expect(page.getByText(/No core goal yet/)).toBeVisible();

      await createGoal(page, "Trail event", "core", "Trail running");
      await createGoal(page, "Swim endurance", "core", "Swimming");
      await createGoal(page, "Climbing skill", "core", "Climbing");
      await createGoal(page, "Mobility habit", "supporting", "Mobility");

      await expect(page.getByText("Primary attention / 3 of 3")).toBeVisible();
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
      await addForm.getByLabel("Attention").selectOption("core");
      await addForm.getByLabel("Start date").fill("2026-07-29");
      await addForm.getByRole("button", { name: "Create active goal" }).click();
      await expect(
        page.getByText(/Three core goals are already active/),
      ).toBeVisible();
      await expect(page.getByText("Primary attention / 3 of 3")).toBeVisible();
      await expect(addForm.getByLabel("Goal title")).toHaveValue("Fourth core");
      await expect(addForm.getByLabel("Desired outcome")).toHaveValue(
        "This must not become active core.",
      );
      await expect(addForm.getByLabel("Attention")).toHaveValue("core");
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-01-fourth-core-390x844.png"),
      });

      const trailCard = goalCard(page, "Trail event");
      await openGoalDetails(trailCard);
      await trailCard.getByLabel("Attention").selectOption("supporting");
      await trailCard.getByRole("button", { name: "Save goal" }).click();
      await expect(
        goalCard(page, "Trail event").getByLabel("Rank 2"),
      ).toBeVisible();
      await openGoalDetails(goalCard(page, "Trail event"));
      await goalCard(page, "Trail event")
        .getByLabel("Attention")
        .selectOption("core");
      await goalCard(page, "Trail event")
        .getByRole("button", { name: "Save goal" })
        .click();
      await expect(
        goalCard(page, "Trail event").getByLabel("Rank 3"),
      ).toBeVisible();

      const mobilityTierCard = goalCard(page, "Mobility habit");
      await openGoalDetails(mobilityTierCard);
      await mobilityTierCard.getByLabel("Attention").selectOption("core");
      await mobilityTierCard.getByRole("button", { name: "Save goal" }).click();
      await expect(
        page.getByText(/Three core goals are already active/),
      ).toBeVisible();
      await expect(mobilityTierCard.getByLabel("Attention")).toHaveValue(
        "core",
      );
      await expect(mobilityTierCard.getByLabel("Rank 1")).toBeVisible();

      const stalePage = await page.context().newPage();
      await stalePage.goto("/home/you/goals");
      await expect(
        stalePage.getByText("Primary attention / 3 of 3"),
      ).toBeVisible();

      await trailCard.getByRole("button", { name: "Move up" }).click();
      await expect(
        goalCard(page, "Swim endurance").getByLabel("Rank 1"),
      ).toBeVisible();
      await expect(
        goalCard(page, "Trail event").getByLabel("Rank 2"),
      ).toBeVisible();
      await goalCard(stalePage, "Trail event")
        .getByRole("button", { name: "Move up" })
        .click();
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
      await expect(page.getByText("Primary attention / 2 of 3")).toBeVisible();
      const pausedSection = page.locator("details").filter({
        has: page.locator("summary").filter({ hasText: /^Paused/ }),
      });
      await pausedSection.locator("summary").click();
      await expect(
        pausedSection.getByText("Climbing skill", { exact: true }),
      ).toBeVisible();
      await pausedSection.getByRole("button", { name: "Resume" }).click();
      await expect(page.getByText("Primary attention / 3 of 3")).toBeVisible();

      const mobilityCard = goalCard(page, "Mobility habit");
      await openGoalDetails(mobilityCard);
      const archiveConfirmation = confirmation(
        mobilityCard,
        "Archive",
        "Confirm archive",
      );
      await archiveConfirmation.summary.focus();
      await page.keyboard.press("Enter");
      await expect(
        mobilityCard.getByText(/remain in your archive/i),
      ).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(archiveConfirmation.confirm).toBeFocused();
      await archiveConfirmation.confirm.click();
      await expect(page.getByRole("status")).toHaveText("Goal archived.");

      await createGoal(page, "Achievement candidate", "supporting", "Cycling");
      const achievementCard = goalCard(page, "Achievement candidate");
      await openGoalDetails(achievementCard);
      const achieveConfirmation = confirmation(
        achievementCard,
        "Mark achieved",
        "Confirm achieved",
      );
      await achieveConfirmation.summary.click();
      await expect(
        achievementCard.getByText(/records the goal as achieved/i),
      ).toBeVisible();
      await achieveConfirmation.confirm.click();
      await expect(page.getByRole("status")).toHaveText(
        "Goal marked achieved.",
      );

      await createGoal(page, "Abandon candidate", "supporting", "Rowing");
      const abandonCard = goalCard(page, "Abandon candidate");
      await openGoalDetails(abandonCard);
      const abandonConfirmation = confirmation(
        abandonCard,
        "Mark abandoned",
        "Confirm abandoned",
      );
      await abandonConfirmation.summary.click();
      await expect(
        abandonCard.getByText(/records the goal as abandoned/i),
      ).toBeVisible();
      await abandonConfirmation.confirm.click();
      await expect(page.getByRole("status")).toHaveText(
        "Goal marked abandoned.",
      );

      await createGoal(page, "Temporary idea", "supporting", "Walking");
      const temporaryCard = goalCard(page, "Temporary idea");
      await openGoalDetails(temporaryCard);
      const deleteConfirmation = confirmation(
        temporaryCard,
        "Delete if unused",
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
  await form.getByLabel("Attention").selectOption(tier);
  await form.getByLabel("Sports or activity areas").fill(area);
  await form.getByLabel("Start date").fill("2026-07-29");
  await form.getByRole("button", { name: "Create active goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function openAddPanel(page: import("@playwright/test").Page) {
  const panel = page.locator("details").filter({ hasText: "Add goal" });
  if ((await panel.getAttribute("open")) === null) {
    await panel.getByText("Add goal", { exact: true }).click();
  }
}

function addGoalForm(page: import("@playwright/test").Page) {
  return page
    .locator("details")
    .filter({ hasText: "Add goal" })
    .locator("form");
}

function goalCard(page: import("@playwright/test").Page, title: string) {
  return page
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title }) });
}

async function openGoalDetails(card: import("@playwright/test").Locator) {
  const details = card.locator("details[data-goal-editor]");
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
}

function confirmation(
  card: import("@playwright/test").Locator,
  label: string,
  confirmLabel: string,
) {
  const operation = {
    "Mark achieved": "achieve",
    "Mark abandoned": "abandon",
    Archive: "archive",
    "Delete if unused": "delete",
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
