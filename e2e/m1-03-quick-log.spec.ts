import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const localEnvironmentReady = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

test.describe("M1-03 quick factual logging", () => {
  test.skip(!localEnvironmentReady, "requires the local Supabase environment");

  test("covers every approved outcome and correction at 390x844", async ({
    page,
    request,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const account = await createAndConfirmAccount(page, request);
    const localDate = await page.evaluate(() => {
      const date = new Date();
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
    });
    const plannedSessionId = await createPlan(account, localDate);

    const completedHref = await logPlannedOutcome(
      page,
      plannedSessionId,
      "Completed",
      {
        duration: "36",
        measurement: '{"distance":5,"distance_unit":"km"}',
      },
    );
    await logPlannedOutcome(page, plannedSessionId, "Partly done", {
      duration: "20",
      measurement: '{"distance":3,"distance_unit":"km"}',
    });
    await logPlannedOutcome(page, plannedSessionId, "Skipped");
    await logPlannedOutcome(page, plannedSessionId, "Rest");
    await logPlannedOutcome(page, plannedSessionId, "Replaced", {
      replacement: "Indoor bike because the track was closed.",
      duration: "45",
      measurement: '{"duration_seconds":2700}',
    });

    await page.goto(completedHref);
    await expect(
      page.getByRole("heading", { name: "Correct the record." }),
    ).toBeVisible();
    const revisionOne = page
      .getByText("Revision 1", { exact: true })
      .locator("..")
      .locator("..");
    await expect(revisionOne.getByText("36 min")).toBeVisible();
    await expect(
      revisionOne.getByText('{"distance":5,"distance_unit":"km"}'),
    ).toBeVisible();
    await page.getByLabel("Duration in minutes").fill("42");
    await page.getByText("Activity results (optional)").click();
    await page
      .getByLabel("Actual measurement JSON")
      .fill('{"distance":6,"distance_unit":"km"}');
    await page
      .getByRole("textbox", { name: /Reason for correction/ })
      .fill("Corrected from watch.");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText("Revision 2 is preserved.")).toBeVisible();
    await page
      .getByRole("link", { name: "View or correct this actual" })
      .click();
    const history = page.getByRole("region", { name: "Nothing erased." });
    await expect(history.getByText("42 min")).toBeVisible();
    await expect(
      history.getByText('{"distance":6,"distance_unit":"km"}'),
    ).toBeVisible();
    await expect(history.getByText("36 min")).toBeVisible();
    await expect(
      history.getByText('{"distance":5,"distance_unit":"km"}'),
    ).toBeVisible();

    await page.goto("/home/log");
    await expect(page.getByRole("radio", { name: "Unplanned" })).toBeChecked();
    await expect(page.getByLabel("Local date *")).toHaveValue(localDate);
    await page.getByLabel("Duration in minutes").fill("30");
    await page.getByRole("button", { name: "Save actual" }).click();
    await expect(
      page.getByRole("heading", { name: "Fact recorded." }),
    ).toBeVisible();
  });
});

async function logPlannedOutcome(
  page: Page,
  plannedSessionId: string,
  outcome: "Completed" | "Partly done" | "Skipped" | "Rest" | "Replaced",
  options: {
    duration?: string;
    measurement?: string;
    replacement?: string;
  } = {},
): Promise<string> {
  await page.goto(
    `/home/log?plannedSession=${encodeURIComponent(plannedSessionId)}`,
  );
  await expect(
    page.getByText("Mobile review run", { exact: true }),
  ).toBeVisible();
  await page.getByText(outcome, { exact: true }).click();

  if (outcome === "Skipped" || outcome === "Rest") {
    await expect(
      page.getByText("Skipped and rest facts do not contain activity results."),
    ).toBeVisible();
    await expect(
      page.getByText("Activity results (optional)"),
    ).not.toBeVisible();
  } else if (options.measurement) {
    await page.getByText("Activity results (optional)").click();
    await page.getByLabel("Actual measurement JSON").fill(options.measurement);
  }
  if (options.duration) {
    await page.getByLabel("Duration in minutes").fill(options.duration);
  }
  if (options.replacement) {
    await page
      .getByRole("textbox", { name: /What replaced it/ })
      .fill(options.replacement);
  }

  await page.getByRole("button", { name: "Save actual" }).click();
  await expect(
    page.getByRole("heading", { name: "Fact recorded." }),
  ).toBeVisible();
  const href = await page
    .getByRole("link", { name: "View or correct this actual" })
    .getAttribute("href");
  expect(href).toMatch(/^\/home\/log\?completion=/);
  return href!;
}

async function createAndConfirmAccount(
  page: Page,
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
  const verification = await request.get(confirmationUrl, { maxRedirects: 0 });
  expect([302, 303]).toContain(verification.status());

  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home$/);
  return { email, password };
}

async function createPlan(
  account: { email: string; password: string },
  localDate: string,
): Promise<string> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error: signInError } = await client.auth.signInWithPassword(account);
  expect(signInError).toBeNull();

  const { error: saveError } = await client.rpc("save_manual_plan_version", {
    p_expected_revision: 0,
    p_day_count: 1,
    p_start_date: localDate,
    p_timezone_name: "Pacific/Kiritimati",
    p_sessions: [
      {
        local_date: localDate,
        position: 0,
        title: "Mobile review run",
        sport: "Running",
        expected_duration_minutes: 40,
        activities: [
          {
            position: 0,
            name: "Easy distance",
            sport: "Running",
            measurement_mode: "time_distance_pace",
            target: { distance: 5, distance_unit: "km" },
          },
        ],
      },
    ],
  });
  expect(saveError).toBeNull();

  const { data, error } = await client
    .from("planned_sessions")
    .select("id")
    .eq("local_date", localDate)
    .single();
  expect(error).toBeNull();
  expect(data?.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  return data!.id;
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
