import { expect, test, type Page } from "@playwright/test";

/**
 * M2-09 measurement harness. Not a test: it asserts nothing about the product
 * and never fails on the defect it counts. It drives one surface repeatedly,
 * records how often an App Router transition failed to commit, and prints the
 * rate with its denominator.
 *
 * It is deliberately named `.probe.ts` rather than `.spec.ts` so no other
 * Playwright config collects it and no continuous-integration step runs it.
 * Hundreds of sequential transitions take minutes; the run is a manual
 * investigation, not a gate. Run it with
 * `e2e/m2-09.playwright.config.ts` (port 3019) against `build` + `start`.
 *
 * Two surfaces, chosen because acceptance criterion 2 names them as never
 * measured:
 *
 * - `/home/plan` — a client-side navigation whose segment must replace
 *   `loading.tsx`. This is the M2-06 class that continuous integration has
 *   been counting.
 * - `/home/log` — a `useActionState` form save. Unlike goals, memory, roadmap
 *   and the plan proposal, `saveQuickLog` does not call `revalidatePath`, so
 *   the reply carries a typed result and no re-rendered tree.
 *
 * Every count is per transition, not per flow.
 */

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PLAN_RUNS = Number(process.env.M2_09_PLAN_RUNS ?? 120);
const LOG_RUNS = Number(process.env.M2_09_LOG_RUNS ?? 120);

/**
 * M2-06 measured a healthy plan transition at 11-478 ms, occasionally about
 * 4 s, and otherwise never: the surface it observed stayed empty for a full
 * 60 s with no request outstanding. A stalled transition does not recover, so
 * waiting longer only makes the run longer. Anything past this budget is
 * counted as a lost render and the document is reloaded to continue.
 */
const COMMIT_BUDGET_MS = 15_000;

type Measurement =
  | { outcome: "committed"; elapsed: number }
  | { outcome: "lost" }
  | { outcome: "error" };

type Tally = {
  attempts: number;
  lost: number;
  errors: number;
  /** Commit latency of every transition that did commit, in milliseconds. */
  committed: number[];
};

test.describe("M2-09 lost-render rate", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("counts uncommitted transitions on /home/plan and /home/log", async ({
    page,
    request,
  }) => {
    test.setTimeout(60 * 60_000);
    const email = `fittip-m2-09-${Date.now()}@example.test`;
    const password = `Local-${crypto.randomUUID()}-9`;
    const userId = await createConfirmedLocalUser(request, email, password);

    try {
      await signIn(page, email, password);

      const plan = newTally();
      for (let run = 0; run < PLAN_RUNS; run += 1) {
        record(plan, await measurePlanNavigation(page));
      }
      report("/home/plan client-side navigation", plan);

      const log = newTally();
      for (let run = 0; run < LOG_RUNS; run += 1) {
        record(log, await measureQuickLogSave(page));
      }
      report("/home/log quick-log save", log);
    } finally {
      await deleteLocalUser(request, userId);
    }
  });
});

/**
 * Today -> Plan through the primary navigation, which is a `next/link`
 * client-side transition. A full `page.goto` would be a fresh document and
 * could not reproduce this class at all.
 */
async function measurePlanNavigation(page: Page): Promise<Measurement> {
  await page.goto("/home/today");
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page).toHaveURL(/\/home\/plan$/);
  const startedAt = Date.now();
  try {
    await expect(page.getByRole("heading", { name: /Plan what/ })).toBeVisible({
      timeout: COMMIT_BUDGET_MS,
    });
  } catch {
    const stillLoading = await page
      .getByRole("heading", { name: /Opening your training ledger/ })
      .isVisible();
    console.log(
      `[M2-09] plan navigation lost after ${Date.now() - startedAt} ms ` +
        `(loading boundary still shown: ${stillLoading})`,
    );
    return { outcome: "lost" };
  }
  const elapsed = Date.now() - startedAt;
  console.log(`[M2-09] plan navigation committed in ${elapsed} ms`);
  return { outcome: "committed", elapsed };
}

/**
 * Today -> Log through a `next/link`, then one unplanned actual. The save is
 * the measured transition: `useActionState` resolves and the surface must
 * replace the form with the recorded fact.
 */
async function measureQuickLogSave(page: Page): Promise<Measurement> {
  await page.goto("/home/today");
  await page
    .getByRole("link", { name: /Log unplanned/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/home\/log$/);
  await expect(page.getByRole("radio", { name: "Unplanned" })).toBeChecked({
    timeout: COMMIT_BUDGET_MS,
  });
  await page.getByLabel("Duration in minutes").fill("30");
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Save actual" }).click();
  const saved = page.getByRole("heading", { name: "Fact recorded." });
  // Scoped to the quick-log form's own error paragraph. An unscoped
  // `getByRole("alert")` also matches the log route's not-found card and the
  // onboarding invitation, either of which would settle the race before the
  // save had answered.
  const failed = page.locator("form p[role='alert']");
  try {
    await expect(saved.or(failed).first()).toBeVisible({
      timeout: COMMIT_BUDGET_MS,
    });
  } catch {
    console.log(`[M2-09] log save lost after ${Date.now() - startedAt} ms`);
    return { outcome: "lost" };
  }
  if (await failed.count()) {
    // A rejected save is not a lost render. Counting it as one would inflate
    // the rate this probe exists to state honestly.
    console.log(
      `[M2-09] log save rejected: ${await failed.first().innerText()}`,
    );
    return { outcome: "error" };
  }
  const elapsed = Date.now() - startedAt;
  console.log(`[M2-09] log save committed in ${elapsed} ms`);
  return { outcome: "committed", elapsed };
}

function newTally(): Tally {
  return { attempts: 0, lost: 0, errors: 0, committed: [] };
}

function record(tally: Tally, measurement: Measurement) {
  tally.attempts += 1;
  if (measurement.outcome === "lost") tally.lost += 1;
  if (measurement.outcome === "error") tally.errors += 1;
  if (measurement.outcome === "committed") {
    tally.committed.push(measurement.elapsed);
  }
}

/**
 * The rate is meaningless without its denominator and the healthy latency it
 * is being contrasted with, so both are printed on the result line. M2-06's
 * only comparable figure is a healthy plan transition of 11-478 ms.
 */
function report(surface: string, tally: Tally) {
  const rate = tally.attempts ? (tally.lost / tally.attempts) * 100 : 0;
  const sorted = tally.committed.toSorted((a, b) => a - b);
  const at = (fraction: number) =>
    sorted.length
      ? sorted[
          Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
        ]
      : NaN;
  console.log(
    `[M2-09] RESULT ${surface}: ${tally.lost} lost / ${tally.attempts} ` +
      `transitions (${rate.toFixed(2)}%), ${tally.errors} rejected; ` +
      `committed latency min ${sorted[0]} ms, median ${at(0.5)} ms, ` +
      `p95 ${at(0.95)} ms, max ${sorted[sorted.length - 1]} ms ` +
      `over ${sorted.length} samples`,
  );
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home\/today$/);
}

async function createConfirmedLocalUser(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password: string,
) {
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
  return body.id;
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
