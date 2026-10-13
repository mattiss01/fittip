import type { Locator } from "@playwright/test";

/**
 * Gives a `DateField` its date: one date field under its label (owner,
 * 13 Oct 2026). An empty date clears it.
 */
export async function fillDate(
  scope: Locator,
  label: string,
  isoDate: string,
): Promise<void> {
  await scope.getByLabel(label, { exact: true }).fill(isoDate);
}
