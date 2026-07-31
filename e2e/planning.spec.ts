import { expect, test } from "@playwright/test";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// M2-06. Opening the plan is a client-side App Router transition, and
// src/app/home/plan/loading.tsx lets the router commit the URL before the
// segment renders. Playwright's default 5 s expectation budget could not say
// whether the three continuous-integration failures were a slow render or a
// lost one, so this budget is deliberately far larger than any measurement.
// Measured on a local production build the transition lands in 11-478 ms
// normally, occasionally at about 4 s, and otherwise never: two separate
// occurrences held the shell empty for the full 30 s, and one for the full
// 60 s, with no request outstanding and no change to the document in between.
// A failure at this budget therefore means the render did not arrive, not that
// the runner was busy. Raising it further would buy nothing.
const PLAN_RENDER_BUDGET_MS = 60_000;

test.describe("manual selectable-horizon planning", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");
  test.use({ viewport: { width: 390, height: 844 } });

  test("creates and revises a three-day sport-neutral plan at 390x844", async ({
    page,
    request,
  }, testInfo) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const email = `fittip-plan-${Date.now()}@example.test`;
    const password = `Local-${crypto.randomUUID()}-9`;
    const userId = await createConfirmedLocalUser(request, email, password);

    try {
      await signIn(page, email, password);
      await page.getByRole("link", { name: "Plan", exact: true }).click();
      await expect(page).toHaveURL(/\/home\/plan$/);
      await expectPlanSurfaceReplacedLoading(page);

      await page.getByRole("button", { name: "3" }).click();
      await expect(page.locator(".plan-day")).toHaveCount(3);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      const firstAddButton = page
        .getByRole("button", { name: "+ Add" })
        .first();
      await firstAddButton.click();
      const composer = page.getByRole("dialog", { name: "Add session" });
      await expect(composer.getByLabel("Session title")).toBeFocused();
      const keepDraftButton = composer.getByRole("button", {
        name: "Keep in draft",
      });
      await keepDraftButton.focus();
      await page.keyboard.press("Tab");
      await expect(
        composer.getByRole("button", { name: "Close session editor" }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(keepDraftButton).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(composer).toBeHidden();
      await expect(firstAddButton).toBeFocused();
      await firstAddButton.click();
      await expect(composer.getByLabel("Session title")).toBeFocused();
      await composer.getByLabel("Session title").fill("Easy trail run");
      await composer
        .getByLabel("Sport or domain", { exact: true })
        .first()
        .fill("Running");
      await composer.getByLabel("Intent").fill("Keep it conversational");
      await composer
        .getByRole("checkbox", {
          name: /Lock for future automated replans/,
        })
        .check();
      await composer.getByRole("button", { name: "+ New activity" }).click();
      await composer.getByLabel("Name").fill("Aerobic running");
      await composer
        .getByLabel("Sport or domain", { exact: true })
        .nth(1)
        .fill("Running");
      await composer
        .getByLabel("Instructions / alternatives")
        .fill("Use the flat loop if the trail is muddy.");
      await composer
        .getByRole("checkbox", {
          name: /Lock activity for automated replans/,
        })
        .check();
      await composer.getByRole("button", { name: "Keep in draft" }).click();
      await expect(
        page.getByRole("heading", { name: "Easy trail run" }),
      ).toBeVisible();

      await page.getByText("My activities").click();
      await page
        .getByRole("button", { name: "+ Create personal activity" })
        .click();
      await page.getByLabel("Activity name").fill("Hip flow");
      await page
        .getByLabel("Sport or domain", { exact: true })
        .fill("Mobility");
      await page
        .getByLabel("Default instructions")
        .fill("Move slowly through a comfortable range.");
      await page.getByRole("button", { name: "Save activity" }).click();
      await expect(page.getByText("Personal activity created.")).toBeVisible();

      await page.getByRole("button", { name: "+ Add" }).nth(1).click();
      const mobilityComposer = page.getByRole("dialog", {
        name: "Add session",
      });
      await mobilityComposer.getByLabel("Session title").fill("Mobility reset");
      await mobilityComposer
        .getByLabel("Sport or domain", { exact: true })
        .first()
        .fill("Mobility");
      await mobilityComposer
        .getByLabel("Reuse one of your activities")
        .selectOption({ label: "Hip flow · Mobility" });
      await expect(mobilityComposer.getByLabel("Name")).toHaveValue("Hip flow");
      await mobilityComposer
        .getByRole("button", { name: "Keep in draft" })
        .click();

      await page.getByRole("button", { name: "Save plan" }).click();
      await expect(page.getByText(/Plan version 1 accepted/)).toBeVisible();
      await expect(page.getByText("v1")).toBeVisible();

      await page
        .getByLabel("Actions for Easy trail run")
        .getByRole("button", { name: "Edit" })
        .click();
      const editComposer = page.getByRole("dialog", {
        name: "Edit session",
      });
      await editComposer
        .getByLabel("Session title")
        .fill("Easy trail run - revised");
      await editComposer.getByRole("button", { name: "Keep in draft" }).click();
      await page.getByRole("button", { name: "2" }).click();
      await expect(page.locator(".plan-day")).toHaveCount(2);
      await page.getByRole("button", { name: "Save plan" }).click();
      await expect(page.getByText(/Plan version 2 accepted/)).toBeVisible();
      await expect(page.getByText("v2")).toBeVisible();

      const accessToken = await readAccessToken(page);
      const versionsResponse = await request.get(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/detailed_plan_versions?select=id,version_number,day_count&order=version_number.asc`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      expect(versionsResponse.ok()).toBe(true);
      const versions = (await versionsResponse.json()) as Array<{
        id: string;
        version_number: number;
        day_count: number;
      }>;
      expect(
        versions.map(({ version_number, day_count }) => ({
          version_number,
          day_count,
        })),
      ).toEqual([
        { version_number: 1, day_count: 3 },
        { version_number: 2, day_count: 2 },
      ]);
      const sessionsResponse = await request.get(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/planned_sessions?select=title,sport,is_locked&plan_version_id=eq.${versions[1].id}&order=local_date.asc,position.asc`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      expect(sessionsResponse.ok()).toBe(true);
      expect(await sessionsResponse.json()).toEqual([
        {
          title: "Easy trail run - revised",
          sport: "Running",
          is_locked: true,
        },
        {
          title: "Mobility reset",
          sport: "Mobility",
          is_locked: false,
        },
      ]);
      expect(pageErrors).toEqual([]);

      await expect(
        page.getByRole("button", { name: "Save plan" }),
      ).toBeDisabled();
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("m1-02-390x844.png"),
      });

      await page.getByRole("button", { name: "3" }).click();
      await expect(page.getByText("Draft changes")).toBeVisible();
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe(
          "Leave this plan? Your unsaved changes will be lost.",
        );
        await dialog.dismiss();
      });
      await page.goBack();
      await expect(page).toHaveURL(/\/home\/plan$/);
      await expect(page.getByText("Draft changes")).toBeVisible();

      page.once("dialog", async (dialog) => {
        await dialog.accept();
      });
      await page.goBack();
      await expect(page).toHaveURL(/\/home\/today$/);
    } finally {
      await deleteLocalUser(request, userId);
    }
  });
});

// The URL assertion above proves only that the router committed the address.
// It passed in every observed M2-06 failure while the segment held no plan
// surface at all, so it cannot detect this class on its own. Prove instead
// that the loading boundary was replaced by the planning surface, and record
// how long that took so the budget above stays answerable to measurement
// rather than to habit.
async function expectPlanSurfaceReplacedLoading(
  page: import("@playwright/test").Page,
) {
  const startedAt = Date.now();
  await expect(page.getByRole("heading", { name: /Plan what/ })).toBeVisible({
    timeout: PLAN_RENDER_BUDGET_MS,
  });
  await expect(
    page.getByRole("heading", { name: /Opening your training ledger/ }),
  ).toBeHidden();
  console.log(`[M2-06] plan surface rendered in ${Date.now() - startedAt} ms`);
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

async function readAccessToken(page: import("@playwright/test").Page) {
  const cookies = await page.context().cookies();
  const authCookies = cookies
    .filter(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name))
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const encoded = authCookies.map(({ value }) => value).join("");
  if (!encoded.startsWith("base64-")) {
    throw new Error("The authenticated Supabase cookie was not available.");
  }
  const session = JSON.parse(
    Buffer.from(encoded.slice("base64-".length), "base64url").toString("utf8"),
  ) as { access_token?: string };
  if (!session.access_token) {
    throw new Error("The authenticated Supabase access token was unavailable.");
  }
  return session.access_token;
}
