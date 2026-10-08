import { expect, test } from "@playwright/test";
import path from "node:path";

const m2EvidenceDirectory = path.join(
  process.cwd(),
  "test-results",
  "M2",
  "evidence",
);

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// The units and the time zone are taken from the browser, so the browser is
// pinned: German in Berlin gives metric and Europe/Berlin.
test.use({ locale: "de-DE", timezoneId: "Europe/Berlin" });

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
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "New here? Create an account" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Join FitTip" }),
    ).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    expect(pageErrors).toEqual([]);
    await expect(page.getByRole("status")).toContainText("Check your email");

    const confirmationUrl = await pollForConfirmationUrl(request, email);
    const callbackResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/auth/callback",
    );
    await page.goto(confirmationUrl);
    await expectPrivateSessionHeaders(await callbackResponse);
    // The link confirms the account and leaves it signed out on sign-in,
    // which says so (owner, 5 Oct 2026).
    await expect(page).toHaveURL(/\/\?auth=confirmed$/);
    await expect(page.getByRole("status")).toContainText(
      "Your account is confirmed",
    );

    // Signing in then opens guided setup, already started: the first step
    // is there without a "Start setup" press.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/home\/you\/onboarding$/);
    await expect(
      page.getByRole("heading", { name: "What's your name?" }),
    ).toBeVisible();
    // Leaving at the first question, with nothing answered, still lands on
    // a Today that has a day to show: setup stored the browser's time zone
    // as it opened, so nothing asks for it.
    await page.getByRole("button", { name: "Continue later" }).click();
    await page.getByRole("button", { name: "Continue later" }).click();
    await expect(page).toHaveURL(/\/home\/today$/);
    await expect(page.getByText(/Confirm your time zone/)).toHaveCount(0);
    await page.goto("/home/you/onboarding");
    await expect(
      page.getByRole("heading", { name: "What's your name?" }),
    ).toBeVisible();
    // Setup is walked without the app's navigation under it.
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );

    // M2-03 reuses this CI-invoked authenticated production-browser journey
    // so its 390px flow does not require a .github workflow change or an
    // uninvoked ticket config.
    await completeGuidedSetup(page, testInfo, { email, password });
  });
});

async function completeGuidedSetup(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  account: { email: string; password: string },
) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });

  // You keeps onboarding's permanent entry, and the screenshot contains no
  // answers. Reached by address: on a page under You two links are named You.
  await page.goto("/home/you");
  await expect(page.getByRole("link", { name: /^Guided setup/ })).toBeVisible();
  // Still to be done, so "You" carries a dot in the navigation.
  await expect(page.locator("[data-setup-open]")).toHaveCount(1);
  await page.screenshot({
    fullPage: true,
    path: path.join(m2EvidenceDirectory, "M2-03-start-390x844.png"),
  });
  await page.getByRole("link", { name: /^Guided setup/ }).click();
  // The setup that sign-up began is waiting on its first screen.
  await expect(page).toHaveURL(/\/home\/you\/onboarding$/);

  // "About you" comes first, one question at a time, then "Your sports";
  // both are saved straight to the profile (owner, 5 Oct 2026). Only the
  // name must be answered. Neither the units nor the time zone is asked:
  // this browser is German, in Berlin, so the measures are metric.
  const heading = (name: string) =>
    page.getByRole("heading", { name, exact: true });
  const next = () => page.getByRole("button", { name: "Next" }).click();
  await expect(heading("What's your name?")).toBeVisible();
  await expect(page.getByLabel("Units")).toHaveCount(0);
  await expect(page.getByLabel("Time zone")).toHaveCount(0);
  // Without a name the first question stays: the browser will not send it.
  await next();
  await expect(heading("What's your name?")).toBeVisible();
  await page.getByLabel("Name").fill("Alex");
  await next();
  await expect(heading("When is your birthday?")).toBeVisible();
  await next();
  await expect(heading("What's your gender?")).toBeVisible();
  await next();
  await expect(heading("How tall are you?")).toBeVisible();
  await next();
  await expect(heading("How much do you weigh?")).toBeVisible();
  await page
    .getByLabel("Weight in kg (optional)", { exact: true })
    .fill("80,5");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(heading("Your sports")).toBeVisible();
  await page.getByText("Running", { exact: true }).click();
  await page.getByLabel("Add your own").fill("Latzug");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Latzug" })).toBeChecked();
  await page.getByRole("button", { name: "Next" }).click();

  const goalTitle = "Finish a calm 10K";
  const goalOutcome = "Run the autumn event with even pacing.";
  await expect(heading("Goals")).toBeVisible();
  await page.getByLabel("Goal title").fill(goalTitle);
  await page.getByLabel("Desired outcome").fill(goalOutcome);
  // The goal's sport, offered from the ones picked two steps before as
  // soon as a letter is typed.
  await page.getByLabel("Sports", { exact: true }).fill("r");
  await page
    .getByRole("group", { name: "Suggestions" })
    .getByRole("button", { name: "Running", exact: true })
    .click();
  // "Continue later" is setup's one way out besides finishing: it saves the
  // screen, here the goal as a goal, and goes to the app. Nothing is there
  // to cancel or delete.
  await expect(
    page.getByRole("button", { name: /cancel|delete/i }),
  ).toHaveCount(0);
  // It asks again first, and says what setup is for.
  await page.getByRole("button", { name: "Continue later" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Setup makes FitTip useful" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(page.locator("[data-leave-setup]")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue later" }).click();
  await page.getByRole("button", { name: "Continue later" }).click();
  await expect
    .poll(
      async () => {
        const notice = page.locator(
          "[data-setup-notice][data-state='validation'], " +
            "[data-setup-notice][data-state='conflict'], " +
            "[data-setup-notice][data-state='session'], " +
            "[data-setup-notice][data-state='error']",
        );
        if (await notice.isVisible().catch(() => false)) {
          return `action notice: ${await notice.innerText()}`;
        }
        return new URL(page.url()).pathname;
      },
      {
        message:
          "Continue later must go to Today; any actionable validation state is reported",
      },
    )
    .toBe("/home/today");

  // Having chosen "Continue later", the next sign-in does not open setup by
  // itself: one page says it is not finished and offers to go on or skip.
  await page.goto("/home/you");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home\/you\/onboarding\?remind=1$/);
  await expect(heading("Your setup is not finished")).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip for now" })).toBeVisible();
  // Going on resumes where it was left, with what was saved.
  await page.getByRole("button", { name: "Continue setup" }).click();
  await expect(heading("Goals")).toBeVisible();
  await expect(page.getByLabel("Goal title")).toHaveValue(goalTitle);
  await next();

  // After goals, four taps that are saved as settings of the profile (owner,
  // 6 Oct 2026): how often, which days are out, where, and what is at home.
  await expect(heading("How often do you want to train?")).toBeVisible();
  await page.getByRole("button", { name: "More: Sessions a week" }).click();
  await expect(page.getByLabel("Sessions a week", { exact: true })).toHaveValue(
    "3",
  );
  await next();
  await expect(heading("Any days you can't train?")).toBeVisible();
  await page.getByText("Sunday", { exact: true }).click();
  await next();
  await expect(heading("Where can you train?")).toBeVisible();
  await page.getByText("Home", { exact: true }).click();
  await next();
  // Asked because Home is a place.
  await expect(heading("What do you have at home?")).toBeVisible();
  await page.getByText("Dumbbells", { exact: true }).click();
  await next();

  // The last screen offers what to write about; each field is filed in
  // Memory as written. The conservative safety copy is there, with no
  // severity question and nothing to acknowledge.
  await expect(heading("Anything your coach should know?")).toBeVisible();
  await expect(
    page.getByText(/FitTip cannot assess or diagnose symptoms/),
  ).toBeVisible();
  await expect(page.getByLabel(/severity/i)).toHaveCount(0);
  await page.getByRole("button", { name: "An old injury" }).click();
  await page
    .getByLabel("An old injury", { exact: true })
    .fill("Left knee, 2019");
  await page.getByRole("button", { name: "What I enjoy" }).click();
  await page
    .getByLabel("What I enjoy", { exact: true })
    .fill("Long runs outdoors");
  await page.getByRole("button", { name: "Finish setup" }).click();
  // Finishing goes straight back to You, which says it is saved. There is
  // no review in between.
  await expect(page).toHaveURL(/\/home\/you\?setup=done$/);
  await expect(
    page.getByText(
      "Your setup is saved. Change anything in Goals, Memory and Settings.",
    ),
  ).toBeVisible();

  // Finished, setup is no longer listed on You, and the dot is gone.
  await expect(page.getByRole("link", { name: /^Guided setup/ })).toHaveCount(
    0,
  );
  await expect(page.locator("[data-setup-open]")).toHaveCount(0);

  // You shows none of the answers, so neither does this screenshot.
  await page.screenshot({
    fullPage: true,
    path: path.join(m2EvidenceDirectory, "M2-03-published-390x844.png"),
  });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("m2-03-published-390x844.png"),
  });

  // The goal was saved once, by "Continue later", and not a second time by
  // the Next that followed.
  await page.goto("/home/you/goals");
  await expect(page.getByText(goalTitle)).toHaveCount(1);
  await page.goto("/home/you/memory");
  const memory = page.locator('[data-memory-content="true"]');
  await expect(
    memory.filter({ hasText: /^An old injury: Left knee, 2019$/ }),
  ).toBeVisible();
  await expect(
    memory.filter({ hasText: /^What I enjoy: Long runs outdoors$/ }),
  ).toBeVisible();
  // The tapped answers are settings, never memory items.
  await expect(memory).toHaveCount(2);

  // What setup saved to the profile is on Settings, where it is changed,
  // with the units and the time zone setup took from the browser.
  await page.goto("/home/you/settings");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Alex");
  await expect(page.getByLabel("Units")).toHaveValue("metric");
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/Berlin");
  await expect(page.getByText("80.5 kg")).toBeVisible();
  // Changing the units changes how a measure is shown, not what is stored.
  await page.getByLabel("Units").selectOption("imperial");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("177.5 lb")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Running", exact: true }),
  ).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Latzug" })).toBeChecked();
  await expect(page.getByLabel("Sessions a week", { exact: true })).toHaveValue(
    "3",
  );
  await expect(page.getByRole("checkbox", { name: "Sunday" })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Monday" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Home", exact: true }),
  ).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Dumbbells" })).toBeChecked();

  // Done once, setup is not offered again.
  await page.goto("/home/you/onboarding");
  await expect(
    page.getByRole("heading", { name: "Your setup is finished" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /setup|review/i })).toHaveCount(
    0,
  );

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
