import { expect, test } from "@playwright/test";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

test.describe("M1-03 quick factual logging", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("logs and corrects unplanned training at 390x844", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    await createAndConfirmAccount(page, request);

    await page.goto("/home/log");
    await expect(
      page.getByRole("heading", { name: "Log what happened." }),
    ).toBeVisible();
    await expect(
      page.getByText("No source plan", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: "Unplanned" })).toBeChecked();

    await page.getByLabel("Duration in minutes").fill("36");
    await page.getByLabel("Perceived effort (1–10)").fill("6");
    await page
      .getByLabel("Compared with expectation")
      .selectOption("as_expected");
    await page.getByLabel("Private note").fill("Local-only E2E factual note");
    await page.getByRole("button", { name: "Save actual" }).click();

    await expect(
      page.getByRole("heading", { name: "Fact recorded." }),
    ).toBeVisible();
    await expect(page.getByText("Revision 1 is preserved.")).toBeVisible();

    await page
      .getByRole("link", { name: "View or correct this actual" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Correct the record." }),
    ).toBeVisible();
    await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();
    await page.getByLabel("Duration in minutes").fill("42");
    await page
      .getByLabel("Reason for correction *")
      .fill("Corrected from watch.");
    await page.getByRole("button", { name: "Save correction" }).click();

    await expect(page.getByText("Revision 2 is preserved.")).toBeVisible();
  });
});

async function createAndConfirmAccount(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
) {
  const email = `fittip-m1-03-${Date.now()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  const confirmationUrl = await pollForConfirmationUrl(request, email);
  await request.get(confirmationUrl);
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function pollForConfirmationUrl(
  request: import("@playwright/test").APIRequestContext,
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
      /href="(https?:\/\/[^"]+\/auth\/v1\/verify\?[^"]+)"/,
    )?.[1];
    if (url) return url.replace(/&amp;/g, "&");
  }
  throw new Error("No local confirmation email arrived in Mailpit.");
}
