import { expect, test } from "@playwright/test";
import path from "node:path";

const m2EvidenceDirectory = path.join(
  process.cwd(),
  "docs",
  "validation",
  "M2",
  "evidence",
);

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

test.describe("public account authentication", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("creates an account, confirms it through Mailpit, signs out, and signs in", async ({
    page,
    request,
  }, testInfo) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const email = `fittip-e2e-${Date.now()}@example.test`;
    const password = `Local-${crypto.randomUUID()}-9`;

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "New here? Create an account" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Start with your next move." }),
    ).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    expect(pageErrors).toEqual([]);
    await expect(page.getByRole("status")).toContainText("Check your email");

    const confirmationUrl = await pollForConfirmationUrl(request, email);
    const callbackResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/auth/callback",
    );
    await page.goto(confirmationUrl);
    await expectPrivateSessionHeaders(await callbackResponse);
    await expect(page).toHaveURL(/\/home\/today$/);
    await expect(
      page.getByRole("heading", { name: "Training, as it stands." }),
    ).toBeVisible();

    await page.getByRole("link", { name: "You", exact: true }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/home\/today$/);

    // M2-03 reuses this CI-invoked authenticated production-browser journey
    // so its 390px flow does not require a .github workflow change or an
    // uninvoked ticket config.
    await completeGuidedSetup(page, testInfo);
  });
});

async function completeGuidedSetup(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
) {
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });

  // The Home invitation can be dismissed once, while You keeps the permanent
  // entry. This screenshot precedes all intake entry and contains no answers.
  await expect(
    page.getByRole("heading", { name: "Set up your coaching context" }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: path.join(m2EvidenceDirectory, "M2-03-start-390x844.png"),
  });
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your coaching context" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "You", exact: true }).click();
  await page.getByRole("link", { name: "Open guided setup" }).click();
  await expect(page).toHaveURL(/\/home\/you\/onboarding$/);
  await expect(page.getByText(/not sent to an AI provider/)).toBeVisible();
  await page.getByRole("button", { name: "Start setup" }).click();

  const goalTitle = "Finish a calm 10K";
  const goalOutcome = "Run the autumn event with even pacing.";
  await expect(
    page.getByRole("heading", { name: "Name the outcomes." }),
  ).toBeFocused();
  await page.getByLabel("Goal title").fill(goalTitle);
  await page.getByLabel("Desired outcome").fill(goalOutcome);
  await page.getByLabel("Activity areas").fill("Running");
  await page.getByRole("button", { name: "Save and finish later" }).click();
  await expect(page).toHaveURL(/\/home\/you$/);

  // Resume restores the saved candidate; cancel deletes it. The permanent You
  // entry then starts a genuinely fresh draft.
  await page.getByRole("link", { name: "Open guided setup" }).click();
  await expect(page.getByLabel("Goal title")).toHaveValue(goalTitle);
  await page.getByRole("button", { name: "Cancel and delete draft" }).click();
  await expect(page).toHaveURL(/\/home\/you$/);
  await page.getByRole("link", { name: "Open guided setup" }).click();
  await page.getByRole("button", { name: "Start setup" }).click();

  await page.getByLabel("Goal title").fill(goalTitle);
  await page.getByLabel("Desired outcome").fill(goalOutcome);
  await page.getByLabel("Activity areas").fill("Running");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 2 of 6 · Current training")).toBeVisible();

  await page.getByLabel("I am not training currently").check();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 3 of 6 · Time and access")).toBeVisible();

  await page.getByLabel("Monday").check();
  await page.getByLabel("Saturday").check();
  await page.getByLabel("Access and equipment").fill("Road, Home weights");
  await page.getByLabel("Timezone").fill("Europe/Berlin");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 4 of 6 · Preferences")).toBeVisible();

  // Preferences and constraints are optional. The exact conservative safety
  // copy remains visible without a severity question or acknowledgement gate.
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 5 of 6 · Constraints")).toBeVisible();
  await expect(
    page.getByText(/FitTip cannot assess or diagnose symptoms/),
  ).toBeVisible();
  await expect(page.getByLabel(/severity/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Step 6 of 6 · Review and save")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Choose where each statement lands.",
    }),
  ).toBeVisible();

  const decisions = page.getByLabel("Decision");
  const decisionCount = await decisions.count();
  expect(decisionCount).toBeGreaterThan(1);
  for (let index = 0; index < decisionCount; index += 1) {
    await decisions.nth(index).selectOption("accepted");
  }
  await page.getByRole("button", { name: "Save accepted items" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your accepted context is filed.",
    }),
  ).toBeFocused();

  // Publication has deleted the draft, so this result screenshot contains no
  // intake answers or candidate text.
  await page.screenshot({
    fullPage: true,
    path: path.join(m2EvidenceDirectory, "M2-03-published-390x844.png"),
  });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("m2-03-published-390x844.png"),
  });

  await page.getByRole("link", { name: "Goals", exact: true }).click();
  await expect(page.getByText(goalTitle)).toBeVisible();
  await page.goto("/home/you/memory");
  await expect(page.getByText("I am not training currently.")).toBeVisible();

  await page.goto("/home/you/onboarding");
  await page.getByRole("button", { name: "Run guided review again" }).click();
  await expect(page.getByText("Step 1 of 6 · Goals")).toBeVisible();
  await page.getByRole("button", { name: "Cancel and delete draft" }).click();
  await expect(page).toHaveURL(/\/home\/you$/);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectPrivateSessionHeaders(
  response: import("@playwright/test").Response,
) {
  const headers = (await response.headersArray()).map(({ name, value }) => ({
    name: name.toLowerCase(),
    value,
  }));
  expect(headers.filter(({ name }) => name === "cache-control")).toEqual([
    {
      name: "cache-control",
      value: "private, no-cache, no-store, must-revalidate, max-age=0",
    },
  ]);
  expect(headers.filter(({ name }) => name === "expires")).toEqual([
    { name: "expires", value: "0" },
  ]);
  expect(headers.filter(({ name }) => name === "pragma")).toEqual([
    { name: "pragma", value: "no-cache" },
  ]);
}

async function pollForConfirmationUrl(
  request: Parameters<typeof test>[0] extends never
    ? never
    : import("@playwright/test").APIRequestContext,
  email: string,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(
      "http://127.0.0.1:54324/api/v1/messages",
    );
    const body = (await response.json()) as {
      messages?: Array<{ ID?: string; To?: Array<{ Address?: string }> }>;
    };
    const message = body.messages?.find((candidate) =>
      candidate.To?.some((recipient) => recipient.Address === email),
    );
    if (!message?.ID) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    const detail = await request.get(
      `http://127.0.0.1:54324/api/v1/message/${message.ID}`,
    );
    const html = ((await detail.json()) as { HTML?: string }).HTML;
    const url = html?.match(
      /https?:\/\/[^"'\s<]+\/auth\/callback[^"'\s<]*/,
    )?.[0];
    if (url) return url.replace(/&amp;/g, "&");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("No local confirmation email arrived in Mailpit.");
}
