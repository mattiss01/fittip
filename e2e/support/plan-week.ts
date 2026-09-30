import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The Plan shows one week at a time (R3a), so a day is on the page only while
 * its week is. These helpers turn to the week first and then act the way the
 * owner does: a day's "+" opens a sheet for that date.
 */

/** The Monday on or before an ISO date. */
export function mondayOf(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Turns the Plan to the week holding `date` and returns that day. */
export async function planDay(page: Page, date: string): Promise<Locator> {
  const day = page.locator(`[data-plan-date="${date}"]`);
  if ((await day.count()) === 0) {
    await page.locator(`[data-week-start="${mondayOf(date)}"]`).click();
  }
  await expect(day).toBeVisible();
  return day;
}

/** Opens a day's sheet from its "+". */
export async function openDaySheet(page: Page, date: string): Promise<Locator> {
  await (await planDay(page, date))
    .getByRole("button", { name: /^Add to / })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Opens the session editor for a date, from the day's sheet. */
export async function openNewSession(
  page: Page,
  date: string,
): Promise<Locator> {
  const sheet = await openDaySheet(page, date);
  await sheet.getByRole("button", { name: "New session" }).click();
  return page.locator("[data-create-session]");
}

/** Sets or clears a date's recovery label from its sheet. */
export async function toggleRecoveryDay(page: Page, date: string) {
  const sheet = await openDaySheet(page, date);
  await sheet
    .getByRole("button", {
      name: /^(Mark as recovery day|Remove recovery day)$/,
    })
    .click();
}
