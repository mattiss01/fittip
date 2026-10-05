import { expect, type Page } from "@playwright/test";

/**
 * "Add goal" on Goals (owner, 5 Oct 2026): a button that opens the form in a
 * card, which closes again once the goal is created. Every flow that needs a
 * goal opens it the same way, so the steps live here.
 */
export function addGoalForm(page: Page) {
  return page.locator('section[aria-label="Add goal"] form');
}

/**
 * The button is React's, not a native disclosure: a click that lands before
 * the page is interactive does nothing and is not replayed, so it is pressed
 * until the form is there. A form left open by a refused save is used as is.
 */
export async function openAddGoalForm(page: Page) {
  const form = addGoalForm(page);
  await expect(async () => {
    if (!(await form.isVisible())) {
      await page
        .getByRole("button", { name: "Add goal" })
        .click({ timeout: 2_000 });
    }
    await expect(form).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return form;
}
