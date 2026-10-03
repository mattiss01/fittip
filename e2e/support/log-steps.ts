import { expect, type Page } from "@playwright/test";

/**
 * Logging in steps (owner, 3 Oct 2026): the log asks one question at a time,
 * and which questions it asks depends on the answers. A flow states only the
 * answers it cares about; this walks whatever steps the form shows, the way
 * the owner would, and leaves every other answer at its default or skips it.
 */
export type LogAnswers = {
  title?: string;
  sport?: string;
  /** Not asked of unplanned training, which has one outcome. */
  outcome?: "Completed" | "Partly completed" | "Skipped" | "Replaced";
  /** Answers "What did you do instead?" while it is shown. */
  replaced?: (page: Page) => Promise<void>;
  minutes?: string;
  effort?: number;
  feeling?: "Very good" | "Good" | "Neutral" | "Bad" | "Very bad";
  /** Works the activity list while it is shown. */
  activities?: (page: Page) => Promise<void>;
  /** The labels of the signals to report; none answers "Nothing was off". */
  signals?: string[];
  note?: string;
};

export function logStep(page: Page, step: string) {
  return page.locator(`[data-log-step="${step}"]`);
}

export async function currentLogStep(page: Page) {
  return page.locator("[data-log-form]").getAttribute("data-log-step-current");
}

/**
 * Answers every step from the one shown to the summary, then saves unless
 * told to stop there. Returns on the summary when `save` is false.
 */
export async function logInSteps(
  page: Page,
  answers: LogAnswers = {},
  { save = true }: { save?: boolean } = {},
) {
  const form = page.locator("[data-log-form]");
  await expect(form).toBeVisible();
  for (let guard = 0; guard < 16; guard += 1) {
    const step = await currentLogStep(page);
    if (step === null) throw new Error("The log form names no step.");
    const shown = logStep(page, step);
    const next = () =>
      shown.getByRole("button", { name: "Next", exact: true }).click();

    switch (step) {
      case "what":
        if (answers.title !== undefined) {
          await shown.getByLabel("Title", { exact: true }).fill(answers.title);
        }
        if (answers.sport !== undefined) {
          await shown.getByLabel("Sport", { exact: true }).fill(answers.sport);
        }
        await next();
        break;
      case "outcome":
        await shown
          .getByRole("button", {
            name: new RegExp(`^${answers.outcome ?? "Completed"}`),
          })
          .click();
        break;
      case "replaced":
        await answers.replaced?.(page);
        await next();
        break;
      case "minutes":
        if (answers.minutes !== undefined) {
          await shown.getByLabel("Duration (minutes)").fill(answers.minutes);
        }
        await next();
        break;
      case "effort":
        await (
          answers.effort === undefined
            ? shown.getByRole("button", { name: "Skip this question" })
            : shown.getByRole("button", {
                name: String(answers.effort),
                exact: true,
              })
        ).click();
        break;
      case "feeling":
        await (
          answers.feeling === undefined
            ? shown.getByRole("button", { name: "Skip this question" })
            : shown.getByRole("button", { name: answers.feeling, exact: true })
        ).click();
        break;
      case "activities":
        await answers.activities?.(page);
        await next();
        break;
      case "off":
        for (const signal of answers.signals ?? []) {
          await shown
            .getByRole("button", { name: signal, exact: true })
            .click();
        }
        await (answers.signals?.length
          ? next()
          : shown.getByRole("button", { name: "Nothing was off" }).click());
        break;
      case "note":
        if (answers.note !== undefined) {
          await shown.getByLabel(/^Note/).fill(answers.note);
        }
        await next();
        // A new log ends on its summary, one Change per answer.
        await expect(form).toHaveAttribute("data-log-step-current", "summary");
        if (save) {
          await logStep(page, "summary")
            .getByRole("button", { name: "Save log" })
            .click();
        }
        return;
      default:
        throw new Error(`No answer for the log step "${step}".`);
    }
    await expect(form).not.toHaveAttribute("data-log-step-current", step);
  }
  throw new Error("The log never reached its note.");
}

/** On a correction's summary: opens one answer, by its row's name. */
export async function changeLogAnswer(page: Page, term: string) {
  await page
    .locator('[data-log-step="summary"]')
    .getByRole("button", { name: `Change ${term.toLowerCase()}` })
    .click();
}
