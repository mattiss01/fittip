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

const PAST_REVIEW_DATE = "2020-01-01";
const FUTURE_REVIEW_DATE = "2030-01-01";

test.describe("M2-02 memory management", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("inspects, edits, reviews and deletes memory at 390x844", async ({
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
      await page.getByRole("link", { name: "Manage memory" }).click();
      await expect(page).toHaveURL(/\/home\/you\/memory$/);
      await expect(
        page.getByRole("heading", { name: "What FitTip knows." }),
      ).toBeVisible();
      // The empty state states a fact, and claims no learning.
      await expect(page.getByText(/Nothing is stored yet/)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-02-empty-390x844.png"),
      });

      await addMemory(
        page,
        "profile_fact",
        "Trains four mornings before work.",
      );
      await addMemory(page, "preference", "Prefers Sundays completely off.");
      await addMemory(
        page,
        "constraint",
        "No pool access until the local pool reopens.",
        PAST_REVIEW_DATE,
      );
      await addMemory(
        page,
        "observed_pattern",
        "Often misses Thursday training.",
      );

      // Every class is filed separately and each card is stamped. An observed
      // pattern the owner wrote is active like the rest; nothing a user can
      // create lands in the review queue.
      for (const heading of [
        "Facts",
        "Preferences",
        "Observed patterns",
        "Review due",
      ]) {
        await expect(
          page.getByRole("heading", { name: heading }),
        ).toBeVisible();
      }
      await expect(card(page, "Often misses Thursday training.")).toContainText(
        "Active",
      );
      await expect(
        page.getByRole("heading", { name: "Needs your review" }),
      ).toBeHidden();
      await expect(
        card(page, "No pool access until the local pool reopens."),
      ).toContainText("Review due");
      await expect(
        card(page, "No pool access until the local pool reopens."),
      ).toContainText(`Review was due ${PAST_REVIEW_DATE}.`);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-02-filed-390x844.png"),
      });

      // Editing appends a version; the earlier text stays inspectable.
      await settled(page);
      const factCard = card(page, "Trains four mornings before work.");
      await openDetails(factCard.locator("details[data-memory-editor]"));
      await factCard
        .getByLabel("What FitTip should remember")
        .fill("Trains five mornings before work.");
      await factCard.getByRole("button", { name: "Save memory" }).click();
      const editedCard = card(page, "Trains five mornings before work.");
      await expect(editedCard).toBeVisible();
      await expect(editedCard).toContainText("Version 2");
      await openDetails(
        editedCard.locator("details").filter({ hasText: "Version history" }),
      );
      await expect(editedCard).toContainText(
        "Trains four mornings before work.",
      );

      // Disable removes it from context and keeps it inspectable; enable
      // restores it.
      await settled(page);
      await editedCard.getByRole("button", { name: "Disable" }).click();
      await expect(
        card(page, "Trains five mornings before work."),
      ).toContainText("Disabled");
      await page
        .getByRole("button", { name: "Disabled 1" })
        .click({ trial: true });
      await settled(page);
      await card(page, "Trains five mornings before work.")
        .getByRole("button", { name: "Enable" })
        .click();
      await expect(
        card(page, "Trains five mornings before work."),
      ).toContainText("Active");

      // Renewing a passed review date clears the review-due state without
      // touching the text.
      await settled(page);
      const constraintCard = card(
        page,
        "No pool access until the local pool reopens.",
      );
      await openDetails(constraintCard.locator("details[data-memory-editor]"));
      await constraintCard
        .getByLabel("New review date")
        .fill(FUTURE_REVIEW_DATE);
      await constraintCard
        .getByRole("button", { name: "Update review date" })
        .click();
      await expect(
        card(page, "No pool access until the local pool reopens."),
      ).toContainText(`Review date ${FUTURE_REVIEW_DATE}.`);
      await expect(
        page.getByRole("heading", { name: "Review due" }),
      ).toBeHidden();

      // Accept, edit-and-accept and decline are unreachable from any user
      // path: only genuinely system-derived content is ever proposed, and
      // nothing in M2-02 produces that. Those actions are proven at the
      // database level in m2_02_memory.test.sql instead of being faked here.

      // A stale save is reported honestly and offers a real recovery.
      const stalePage = await page.context().newPage();
      await stalePage.goto("/home/you/memory");
      await expect(
        stalePage.getByRole("heading", { name: "What FitTip knows." }),
      ).toBeVisible();
      await addMemory(page, "preference", "Prefers early starts.");
      await settled(page);
      await settled(stalePage);
      const staleTarget = card(stalePage, "Prefers Sundays completely off.");
      await staleTarget.getByRole("button", { name: "Disable" }).click();
      await expect(stalePage.getByRole("status")).toContainText(
        /changed in another tab/,
      );
      const reload = stalePage.getByRole("link", {
        name: "Reload current memory",
      });
      await expect(reload).toBeVisible();
      await stalePage.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-02-stale-conflict-390x844.png"),
      });
      await reload.click();
      await expect(
        card(stalePage, "Prefers Sundays completely off."),
      ).toContainText("Active");
      await stalePage.close();

      // Permanent deletion states its effect, then removes the text and every
      // earlier version of it. Driven entirely by keyboard: this is the most
      // destructive action on the surface, so it is the one that has to be
      // reachable without a pointer. It exercises the same details/summary
      // confirmation every other destructive action uses.
      await settled(page);
      const deleteTarget = card(page, "Prefers early starts.");
      const remove = confirmation(
        deleteTarget,
        "delete",
        "Confirm permanent delete",
      );
      await remove.summary.focus();
      await expect(remove.summary).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(deleteTarget).toContainText(
        /erases the current text and every earlier version/,
      );
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-02-delete-390x844.png"),
      });
      await page.keyboard.press("Tab");
      await expect(remove.confirm).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByText("Prefers early starts.")).toHaveCount(0);
      await page.reload();
      await expect(page.getByText("Prefers early starts.")).toHaveCount(0);

      // The filter narrows the view without hiding what a status means.
      await settled(page);
      await page.getByRole("button", { name: /^Proposed 0$/ }).click();
      // The review queue is empty and says so, rather than hiding what the
      // status means.
      await expect(
        page.getByText("No memory matches this filter."),
      ).toBeVisible();
      await expect(
        page.getByText("Trains five mornings before work."),
      ).toHaveCount(0);
      await page.getByRole("button", { name: /^Everything/ }).click();
      await expect(
        card(page, "Trains five mornings before work."),
      ).toBeVisible();

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        fullPage: true,
        path: path.join(evidenceDirectory, "M2-02-final-390x844.png"),
      });
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m2-02-final-390x844.png"),
      });
      expect(pageErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

/**
 * The surface reloads itself to recover a mutation whose result never reached
 * the screen — see `useMutationStall` in `memory-manager.tsx`. That is correct
 * product behaviour, but typing into a document that is about to be replaced
 * loses the input, so every step that drives a mutation waits for the surface
 * to leave its in-flight states first. This waits for a real state; it does
 * not relax any assertion.
 */
async function settled(page: import("@playwright/test").Page) {
  await expect(page.getByRole("status")).not.toHaveAttribute(
    "data-state",
    /^(saving|lost-render)$/,
  );
}

async function addMemory(
  page: import("@playwright/test").Page,
  memoryType: string,
  content: string,
  reviewDate?: string,
) {
  await settled(page);
  const panel = page.locator("details").filter({ hasText: "Add memory" });
  if ((await panel.getAttribute("open")) === null) {
    await panel.getByText("Add memory", { exact: true }).click();
  }
  const form = panel.locator("form").first();
  await form.getByLabel("Memory type").selectOption(memoryType);
  await form.getByLabel("What FitTip should remember").fill(content);
  await form.getByLabel("Review date (optional)").fill(reviewDate ?? "");
  await expect(
    form.getByText(/speak to a qualified health professional/),
  ).toBeVisible();
  await form.getByRole("button", { name: "Save memory" }).click();
  await expect(card(page, content)).toBeVisible();
}

function card(page: import("@playwright/test").Page, content: string) {
  return page
    .locator("li")
    .filter({
      has: page.locator(`[data-memory-content]:text-is("${content}")`),
    })
    .first();
}

async function openDetails(details: import("@playwright/test").Locator) {
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
}

function confirmation(
  scope: import("@playwright/test").Locator,
  operation: string,
  confirmLabel: string,
) {
  const details = scope.locator(`details[data-confirmation="${operation}"]`);
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
  const email = `fittip-m2-02-${Date.now()}@example.test`;
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
