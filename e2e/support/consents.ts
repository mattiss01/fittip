import { expect, type Page } from "@playwright/test";

/** How a flow answers the coach question after sign-in. */
export type CoachAnswer = "agree" | "decline" | "later";

/**
 * The steps a new account meets after its first sign-in (ADR-043 decision 5):
 * "Before you start", with the Terms and the health consent ticked, then the
 * coach question over the app. Every flow that signs a fresh account in
 * passes them the same way, so they live here. The coach is agreed unless a
 * flow says otherwise, since most flows reach a coach surface.
 */
export async function passConsents(page: Page, coach: CoachAnswer = "agree") {
  await acceptTerms(page);
  await answerCoachQuestion(page, coach);
}

export async function acceptTerms(page: Page) {
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Before you start" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /^I agree to the Terms/ }).check();
  await page
    .getByRole("checkbox", { name: /^I consent to FitTip storing/ })
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/home\//);
}

export function coachQuestion(page: Page) {
  return page.getByRole("dialog", { name: "Coach and your data" });
}

/**
 * ✕ is a client handler, so a press that lands before the page is
 * interactive is pressed again until the dialog is gone. Agree and Decline
 * are plain form posts and work either way.
 */
export async function answerCoachQuestion(page: Page, answer: CoachAnswer) {
  const dialog = coachQuestion(page);
  await expect(dialog).toBeVisible();
  if (answer === "later") {
    await expect(async () => {
      if (await dialog.isVisible()) {
        await dialog
          .getByRole("button", {
            name: "Close, and ask me after my next sign-in",
          })
          .click({ timeout: 2_000 });
      }
      await expect(dialog).toHaveCount(0, { timeout: 1_000 });
    }).toPass();
    return;
  }
  await dialog
    .getByRole("button", {
      name: answer === "agree" ? "Agree" : "Decline",
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
}
