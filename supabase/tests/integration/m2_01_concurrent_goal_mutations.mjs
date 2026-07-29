import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("The local Supabase test environment is required.");
}

const email = `m2-goal-concurrency-${Date.now()}@example.test`;
const password = `Local-${crypto.randomUUID()}-9`;
let userId;

try {
  const created = await request("/auth/v1/admin/users", serviceRoleKey, {
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  userId = created.id;
  assert.equal(typeof userId, "string");

  const session = await request(
    "/auth/v1/token?grant_type=password",
    publishableKey,
    { method: "POST", body: { email, password } },
  );
  const accessToken = session.access_token;
  assert.equal(typeof accessToken, "string");

  await request("/rest/v1/profiles", publishableKey, {
    method: "POST",
    token: accessToken,
    body: { user_id: userId },
  });

  await goalChange(accessToken, createArgs(0, "Core one", "Running"));
  await goalChange(accessToken, createArgs(1, "Core two", "Swimming"));

  const attempts = await Promise.all([
    rawGoalChange(accessToken, createArgs(2, "Concurrent three A", "Climbing")),
    rawGoalChange(accessToken, createArgs(2, "Concurrent three B", "Cycling")),
  ]);
  assert.deepEqual(
    attempts.map(({ status }) => status).toSorted(),
    [200, 409],
    "exactly one simultaneous third-core mutation must commit",
  );

  const goals = await request(
    "/rest/v1/goals?select=title,priority_tier,status,active_rank&priority_tier=eq.core&status=eq.active&order=active_rank.asc",
    publishableKey,
    { token: accessToken },
  );
  assert.equal(goals.length, 3);
  assert.deepEqual(
    goals.map(({ active_rank }) => active_rank),
    [1, 2, 3],
  );

  const collection = await request(
    "/rest/v1/goal_collections?select=revision",
    publishableKey,
    { token: accessToken },
  );
  assert.deepEqual(collection, [{ revision: 3 }]);

  console.log(
    "M2-01 concurrency PASS: one success, one PT409, revision 3, contiguous core ranks 1-3.",
  );
} finally {
  if (userId) {
    await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: authorization(serviceRoleKey),
    });
  }
}

function createArgs(expectedRevision, title, area) {
  return {
    p_expected_collection_revision: expectedRevision,
    p_operation: "create",
    p_title: title,
    p_desired_outcome: `Make measurable progress in ${area}.`,
    p_category: "other",
    p_activity_areas: [area],
    p_start_date: "2026-07-29",
    p_priority_tier: "core",
  };
}

async function goalChange(token, args) {
  const response = await rawGoalChange(token, args);
  assert.equal(
    response.status,
    200,
    `goal mutation failed: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

async function rawGoalChange(token, args) {
  const response = await fetch(`${url}/rest/v1/rpc/apply_goal_change`, {
    method: "POST",
    headers: {
      ...authorization(publishableKey),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await response.json() };
}

async function request(path, key, options = {}) {
  const response = await fetch(`${url}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...authorization(key),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    throw new Error(`Local Supabase request failed with ${response.status}.`);
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

function authorization(key) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}
