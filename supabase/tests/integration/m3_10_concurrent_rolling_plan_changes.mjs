import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROUNDS = 12;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("The local Supabase test environment is required.");
}

const users = [];

try {
  const owner = await createOwner("owner");
  const outsider = await createOwner("outsider");

  for (let round = 0; round < ROUNDS; round += 1) {
    const expectedRevision = round;
    const attempts = await Promise.all([
      rawChange(owner.token, addArgs(round, "a")),
      rawChange(owner.token, addArgs(round, "b")),
    ]);
    assert.deepEqual(
      attempts.map(({ status }) => status).toSorted(),
      [200, 409],
      `round ${round}: exactly one same-revision change must commit`,
    );
    const conflict = attempts.find(({ status }) => status === 409);
    assert.equal(conflict?.body?.code, "PT409");

    const plan = await get(
      owner.token,
      "/rest/v1/rolling_plans?select=revision",
    );
    assert.deepEqual(plan, [{ revision: expectedRevision + 1 }]);
  }

  const sessions = await get(
    owner.token,
    "/rest/v1/rolling_plan_sessions?select=id,status&order=created_at.asc",
  );
  const changeSets = await get(
    owner.token,
    "/rest/v1/rolling_plan_change_sets?select=id,plan_revision&order=plan_revision.asc",
  );
  const entries = await get(
    owner.token,
    "/rest/v1/rolling_plan_change_entries?select=id,change_set_id",
  );
  assert.equal(sessions.length, ROUNDS);
  assert.ok(sessions.every(({ status }) => status === "active"));
  assert.equal(changeSets.length, ROUNDS);
  assert.deepEqual(
    changeSets.map(({ plan_revision }) => plan_revision),
    Array.from({ length: ROUNDS }, (_, index) => index + 1),
  );
  assert.equal(entries.length, ROUNDS);

  assert.deepEqual(
    await get(outsider.token, "/rest/v1/rolling_plan_sessions?select=id"),
    [],
    "another owner cannot read current sessions",
  );
  const attacked = await rawChange(outsider.token, {
    p_expected_plan_revision: 0,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: [
      {
        operation: "cancel",
        sessionId: sessions[0].id,
      },
    ],
  });
  assert.equal(attacked.status, 400);
  assert.equal(attacked.body?.code, "22023");
  assert.deepEqual(
    await get(outsider.token, "/rest/v1/rolling_plans?select=revision"),
    [],
    "a denied cross-owner mutation leaves no partial outsider plan",
  );
  assert.equal(
    (await get(owner.token, "/rest/v1/rolling_plan_sessions?select=id")).length,
    ROUNDS,
    "a denied cross-owner mutation leaves the owner state unchanged",
  );

  console.log(
    `M3-10 rolling-plan concurrency PASS: ${ROUNDS} same-revision races each produced one winner, one PT409 stale loser, and one atomic state/history/revision write.`,
  );
} finally {
  await Promise.all(
    users.map((userId) =>
      fetch(`${url}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: authorization(serviceRoleKey),
      }),
    ),
  );
}

function addArgs(round, contender) {
  const hex = (round * 2 + (contender === "a" ? 1 : 2))
    .toString(16)
    .padStart(12, "0");
  const day = String(16 + round).padStart(2, "0");
  return {
    p_expected_plan_revision: round,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: [
      {
        operation: "add",
        sessionId: `78000000-0000-4000-8000-${hex}`,
        session: {
          localDate: `2026-08-${day}`,
          position: contender === "a" ? 0 : 1,
          title: `Round ${round} ${contender}`,
          sport: "Running",
          isLocked: false,
          activities: [],
        },
      },
    ],
  };
}

async function createOwner(label) {
  const email = `m3-10-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9`;
  const created = await request("/auth/v1/admin/users", serviceRoleKey, {
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  users.push(created.id);
  const session = await request(
    "/auth/v1/token?grant_type=password",
    publishableKey,
    { method: "POST", body: { email, password } },
  );
  await request("/rest/v1/profiles", publishableKey, {
    method: "POST",
    token: session.access_token,
    body: { user_id: created.id },
  });
  return { id: created.id, token: session.access_token };
}

async function rawChange(token, body) {
  const response = await fetch(
    `${url}/rest/v1/rpc/apply_rolling_plan_change_set`,
    {
      method: "POST",
      headers: {
        ...authorization(publishableKey),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, body: await response.json() };
}

async function get(token, path) {
  return request(path, publishableKey, { token });
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
