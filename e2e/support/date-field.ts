import type { Locator } from "@playwright/test";

/**
 * Types a date into a `DateField`: three fields named Day, Month and Year
 * under one label, in whichever order the browser's language writes them.
 * An empty date clears all three.
 */
export async function fillDate(
  scope: Locator,
  label: string,
  isoDate: string,
): Promise<void> {
  const [year = "", month = "", day = ""] = isoDate.split("-");
  const field = scope.getByRole("group", { name: label, exact: true });
  await field.getByLabel("Day").fill(day);
  await field.getByLabel("Month").fill(month);
  await field.getByLabel("Year").fill(year);
}
