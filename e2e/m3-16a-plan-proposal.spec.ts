import { expect, test, type Locator, type Page } from "@playwright/test";

import { watchConsoleErrors } from "./support/console-errors";

/**
 * M3-16A: asking for a coach proposal and applying part of it.
 *
 * This file was `m3-11-maintenance.spec.ts`. It guarded the last route still on
 * the maintenance stub, `/home/plan/proposal`, and this ticket reopened it — so
 * the stub assertions are gone and what replaced them is the loop the stub was
 * standing in for. What it keeps from the old spec, because neither was about
 * the stub, is the private/no-store header check and the focus-treatment
 * assertions with their two WCAG ratios.
 *
 * The flow is the whole point: a session already on the plan has to appear
 * beside the proposal, the finish has to be refused while anything is
 * undecided, and exactly what was staged — and nothing else — has to reach the
 * plan. No provider is configured, so the built-in example coach answers and
 * every surface that shows its work says so.
 */

const TIMEZONE = "Europe/Berlin";

const legacyObjects = [
  "detailed_plan",
  "planned_sessions",
  "completed_sessions",
  "completion_heads",
  "save_manual_plan_version",
  "save_training_completion",
] as const;

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("M3-16A plan proposal review", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("proposes, decides and applies at 390x844", async ({
    page,
    request,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    const legacyRequests: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const consoleErrors = watchConsoleErrors(page);
    page.on("request", (outbound) => {
      if (legacyObjects.some((name) => outbound.url().includes(name))) {
        legacyRequests.push(outbound.url());
      }
    });
    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);

      // The zone is confirmed on the plan, because owner-local today is what
      // every date in the proposal is measured against.
      await page.goto("/home/plan");
      await page
        .getByRole("button", { name: `Use ${TIMEZONE}` })
        .click()
        .catch(() => {
          // Already confirmed; nothing to do.
        });
      await expect(
        page.getByRole("heading", { name: "Plan ahead." }),
      ).toBeVisible();

      // A goal, because the plan operation refuses below its context minimum
      // and says so rather than reporting a coach failure.
      await addGoal(page, "Run a half marathon");

      // One session already on the plan, so the review has something to show
      // as Already planned.
      await page.goto("/home/plan");
      await addSession(page, ownerToday(), "Club track night");

      const response = await page.goto("/home/plan/proposal");
      expect(response?.status()).toBe(200);
      const headers = lowerCaseHeaders(response?.headers() ?? {});
      expect(headers["cache-control"]).toContain("private");
      expect(headers["cache-control"]).toContain("no-store");
      await expect(
        page.getByRole("heading", { name: "Review a coach proposal." }),
      ).toBeVisible();
      await expect(page.getByText("No proposal open")).toBeVisible();

      // Ask for three days: the example coach puts a session on the first and
      // third and leaves the middle one empty, which is what makes a
      // recovery-day choice exist.
      await page.getByLabel("Days to plan").fill("3");
      await page.getByRole("button", { name: "Ask the coach" }).click();

      // The review is a labelled region rather than a heading: the day list is
      // the content, and a heading above it would just repeat the page title.
      await expect(
        page.getByRole("region", { name: "What the coach proposed" }),
      ).toBeVisible({ timeout: 30_000 });

      // Fixture-authored work is labelled an example wherever it appears.
      await expect(page.getByText("Example", { exact: true })).toBeVisible();

      // The merged timeline: the owner's own session is context, not a choice.
      await expect(
        page.getByText("Already planned", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Club track night")).toBeVisible();
      await expect(
        page.getByText("Recovery day", { exact: true }),
      ).toBeVisible();

      // Nothing is decided yet, so the finish is refused before it is offered.
      const finish = page.getByRole("button", { name: "Finish review" });
      await expect(finish).toBeDisabled();
      await expect(page.getByText(/still need a choice/)).toBeVisible();

      const choices = page.getByRole("button", { name: /^Add .* to plan$/ });
      const proposedCount = await choices.count();
      expect(proposedCount).toBe(3);

      // Stage the first, reject the rest.
      await choices.first().click();
      await expect(
        page.getByText("Will be added", { exact: true }),
      ).toBeVisible();

      const rejects = page.getByRole("button", { name: /^Reject / });
      await rejects.nth(1).click();
      await expect(
        page.getByText(
          /1 item still needs a choice|One item still needs a choice/,
        ),
      ).toBeVisible();
      await rejects.nth(2).click();

      await expect(finish).toBeEnabled();
      await expect(
        page.getByText("One item will be added to your plan, in one change."),
      ).toBeVisible();

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      await finish.click();
      await expect(
        page.getByText("Review finished. One item was added to your plan."),
      ).toBeVisible({ timeout: 30_000 });

      // Exactly one session reached the plan, and it is the one that was
      // staged. The rejected ones left no trace.
      await page.goto("/home/plan");
      await expect(page.getByText("Easy aerobic session")).toHaveCount(1);
      await expect(page.getByText("Steadier session")).toHaveCount(0);
      await expect(page.getByText("Club track night")).toHaveCount(1);

      const primaryAction = page.getByRole("link", { name: "Coach proposal" });
      const resting = await primaryAction.evaluate(readFocusTreatment);
      expect({
        outlineStyle: resting.outlineStyle,
        outlineWidth: resting.outlineWidth,
      }).toEqual({ outlineStyle: "none", outlineWidth: "0px" });

      await primaryAction.focus();
      await expect(primaryAction).toBeFocused();
      const focused = await primaryAction.evaluate(readFocusTreatment);
      // WCAG 1.4.3 for the label, 1.4.11 for the indicator against the paper
      // the focus offset exposes on both sides of the outline.
      expect(focused.labelContrast).toBeGreaterThanOrEqual(4.5);
      expect(focused.outlineContrast).toBeGreaterThanOrEqual(3);

      expect(legacyRequests).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors.errors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

/** The same steps `m2-01-goals.spec.ts` uses, because the surface is theirs. */
async function addGoal(page: Page, title: string) {
  await page.goto("/home/you/goals");
  const panel = page.locator("details").filter({ hasText: "Add goal" });
  if ((await panel.getAttribute("open")) === null) {
    await panel.getByText("Add goal", { exact: true }).click();
  }
  const form = panel.locator("form");
  await form.getByLabel("Goal title").fill(title);
  await form
    .getByLabel("Desired outcome")
    .fill("Finish a half marathon feeling strong rather than surviving it.");
  await form.getByLabel("Attention").selectOption("core");
  await form.getByLabel("Sports or activity areas").fill("Running");
  await form.getByLabel("Start date").fill(ownerToday());
  await form.getByRole("button", { name: "Create active goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** The same steps `m3-12-plan.spec.ts` uses. */
async function addSession(page: Page, date: string, title: string) {
  const details = disclosure(page.locator("body"), "Create session");
  if ((await details.getAttribute("open")) === null) {
    await details.locator(":scope > summary").click();
  }
  await details.getByLabel("Date").fill(date);
  await details.getByLabel("Title").fill(title);
  await details.getByLabel("Sport").fill("Running");
  await details.getByLabel("Minutes").fill("75");
  await details.getByRole("button", { name: "Create session" }).click();
  await expect(
    page
      .locator(`[data-plan-date="${date}"]`)
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

/** The disclosure whose own summary carries this label. */
function disclosure(scope: Locator, label: string) {
  return scope.locator("details").filter({
    has: scope.page().locator(":scope > summary", { hasText: label }),
  });
}

/** Owner-local today, in the zone the run pins. */
function ownerToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(
    new Date(),
  );
}

/**
 * Runs in the page. Reports the resolved focus treatment of one control plus
 * the two WCAG ratios: the label against the control's own fill, and the focus
 * outline against the surface the offset exposes on either side of it.
 */
function readFocusTreatment(element: Element) {
  const parseColor = (value: string): [number, number, number] => {
    const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
    return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
  };
  const isOpaque = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
    return channels.length > 0 && (channels[3] ?? 1) === 1;
  };
  const luminance = (color: string) =>
    parseColor(color)
      .map((channel) => {
        const ratio = channel / 255;
        return ratio <= 0.03928
          ? ratio / 12.92
          : Math.pow((ratio + 0.055) / 1.055, 2.4);
      })
      .reduce(
        (total, linear, index) =>
          total + linear * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const contrast = (first: string, second: string) => {
    const [light, dark] = [luminance(first), luminance(second)].sort(
      (a, b) => b - a,
    );
    return (light + 0.05) / (dark + 0.05);
  };
  /** The colour a viewer actually sees behind `node`, ignoring transparency. */
  const paintedBackground = (node: Element | null): string => {
    for (let current = node; current; current = current.parentElement) {
      const background = window.getComputedStyle(current).backgroundColor;
      if (isOpaque(background)) return background;
    }
    return window.getComputedStyle(document.documentElement).backgroundColor;
  };

  const style = window.getComputedStyle(element);
  const fill = paintedBackground(element);
  const surface = paintedBackground(element.parentElement);

  return {
    background: style.backgroundColor,
    color: style.color,
    outlineColor: style.outlineColor,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineOffset: style.outlineOffset,
    labelContrast: contrast(style.color, fill),
    outlineContrast: contrast(style.outlineColor, surface),
  };
}

function lowerCaseHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
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
  const email = `fittip-m3-16a-${Date.now()}@example.test`;
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
