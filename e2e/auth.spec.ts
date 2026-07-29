import { expect, test } from "@playwright/test";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

test.describe("public account authentication", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("creates an account, confirms it through Mailpit, signs out, and signs in", async ({
    page,
    request,
  }) => {
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
  });
});

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
