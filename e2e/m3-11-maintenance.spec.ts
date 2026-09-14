import { expect, test } from "@playwright/test";
import path from "node:path";

// M3-12 reopened `/home/plan` against the rolling-plan model, M3-15B
// reopened `/home/today` and `/home/log` against it and the completion seam,
// and M3-15C reopened `/home/progress` and added `/home/progress/[id]`.
// Those routes are no longer maintenance stubs; `e2e/m3-12-plan.spec.ts`,
// `e2e/m3-15b-today-and-logging.spec.ts` and `e2e/m3-15c-progress.spec.ts`
// own them. The remaining two routes are still stubs and are still asserted
// here.
const routes = ["/home/plan/roadmap", "/home/plan/proposal"] as const;

const legacyObjects = [
  "detailed_plan",
  "planned_sessions",
  "completed_sessions",
  "completion_heads",
  "plan_generation",
  "plan_proposals",
  "save_manual_plan_version",
  "save_training_completion",
] as const;

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

test.describe("M3-11 training maintenance", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("keeps every reset route truthful and query-free at 390x844", async ({
    page,
    request,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    const legacyRequests: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("request", (outbound) => {
      if (legacyObjects.some((name) => outbound.url().includes(name))) {
        legacyRequests.push(outbound.url());
      }
    });
    const account = await createConfirmedLocalUser(request);

    try {
      await signIn(page, account.email, account.password);

      for (const route of routes) {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        expect(response?.headers()["cache-control"]).toContain("private");
        expect(response?.headers()["cache-control"]).toContain("no-store");
        await expect(
          page.getByRole("heading", { name: "One plan is taking shape." }),
        ).toBeVisible();
        await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }

      const primaryAction = page.getByRole("link", { name: "Open You" });
      const resting = await primaryAction.evaluate(readFocusTreatment);
      expect({
        outlineStyle: resting.outlineStyle,
        outlineWidth: resting.outlineWidth,
      }).toEqual({ outlineStyle: "none", outlineWidth: "0px" });

      await primaryAction.focus();
      await expect(primaryAction).toBeFocused();
      const focused = await primaryAction.evaluate(readFocusTreatment);
      expect({
        background: focused.background,
        color: focused.color,
        outlineColor: focused.outlineColor,
        outlineStyle: focused.outlineStyle,
        outlineWidth: focused.outlineWidth,
        outlineOffset: focused.outlineOffset,
      }).toEqual({
        background: "rgb(20, 47, 42)",
        color: "rgb(255, 253, 244)",
        outlineColor: "rgb(20, 47, 42)",
        outlineStyle: "solid",
        outlineWidth: "3px",
        outlineOffset: "2px",
      });
      // WCAG 1.4.3 for the label, 1.4.11 for the indicator against the paper
      // the 2px offset exposes on both sides of the outline.
      expect(focused.labelContrast).toBeGreaterThanOrEqual(4.5);
      expect(focused.outlineContrast).toBeGreaterThanOrEqual(3);

      await page.screenshot({
        fullPage: true,
        path: path.join(
          process.cwd(),
          "docs",
          "validation",
          "M3",
          "evidence",
          "M3-11-maintenance-390x844.png",
        ),
      });

      expect(legacyRequests).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await deleteLocalUser(request, account.userId);
    }
  });
});

/**
 * Runs in the page. Reports the resolved focus treatment of one control plus
 * the two WCAG ratios the reviewer rejected: the label against the control's
 * own fill, and the focus outline against the surface the 2px offset exposes
 * on either side of it.
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
  const email = `fittip-m3-11-${Date.now()}@example.test`;
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
