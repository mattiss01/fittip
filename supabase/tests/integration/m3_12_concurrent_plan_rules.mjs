import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROUNDS = 12;
const DAILY_LIMIT = 10;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("The local Supabase test environment is required.");
}

const users = [];

try {
  const owner = await createOwner("owner", "UTC");
  const zoneless = await createOwner("zoneless", null);

  // Each round races a session change against a recovery-day change at the
  // same expected revision. One must commit whole; the other must lose
  // honestly and leave nothing behind.
  for (let round = 0; round < ROUNDS; round += 1) {
    const attempts = await Promise.all([
      rawChange(owner.token, sessionArgs(round)),
      rawChange(owner.token, recoveryArgs(round)),
    ]);
    assert.deepEqual(
      attempts.map(({ status }) => status).toSorted(),
      [200, 409],
      `round ${round}: exactly one same-revision change must commit; ${JSON.stringify(attempts)}`,
    );
    assert.equal(
      attempts.find(({ status }) => status === 409)?.body?.code,
      "PT409",
    );

    const plan = await get(
      owner.token,
      "/rest/v1/rolling_plans?select=revision",
    );
    assert.deepEqual(plan, [{ revision: round + 1 }]);

    const sessions = await get(
      owner.token,
      `/rest/v1/rolling_plan_sessions?select=id&local_date=eq.${futureDate(round + 1)}`,
    );
    const labels = await get(
      owner.token,
      `/rest/v1/rolling_plan_recovery_days?select=id&local_date=eq.${futureDate(round + 1)}`,
    );
    assert.equal(
      sessions.length + labels.length,
      1,
      `round ${round}: the losing change must leave no state`,
    );
  }

  const changeSets = await get(
    owner.token,
    "/rest/v1/rolling_plan_change_sets?select=plan_revision&order=plan_revision.asc",
  );
  assert.deepEqual(
    changeSets.map(({ plan_revision }) => plan_revision),
    Array.from({ length: ROUNDS }, (_, index) => index + 1),
    "every committed round appended exactly one change set",
  );
  const entries = await get(
    owner.token,
    "/rest/v1/rolling_plan_change_entries?select=change_kind,session_id,local_date",
  );
  assert.equal(entries.length, ROUNDS);
  assert.ok(
    entries.every(({ change_kind, session_id, local_date }) =>
      change_kind === "set_recovery_day"
        ? session_id === null && local_date !== null
        : session_id !== null && local_date === null,
    ),
    "each entry targets exactly one of a session or a date",
  );

  // The per-date cap is a property of the committed state, not a read the
  // caller could race past.
  let revision = ROUNDS;
  const packedDate = futureDate(ROUNDS + 5);
  const filling = await rawChange(owner.token, {
    p_expected_plan_revision: revision,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: Array.from({ length: DAILY_LIMIT }, (_, index) =>
      addSession(
        `7d000000-0000-4000-8000-${hex(900 + index)}`,
        packedDate,
        index,
      ),
    ),
  });
  assert.equal(filling.status, 200, JSON.stringify(filling));
  revision += 1;

  const eleventh = await Promise.all([
    rawChange(owner.token, {
      p_expected_plan_revision: revision,
      p_idempotency_key: crypto.randomUUID(),
      p_provenance: "owner_manual",
      p_changes: [
        addSession("7d000000-0000-4000-8000-" + hex(981), packedDate, 10),
      ],
    }),
    rawChange(owner.token, {
      p_expected_plan_revision: revision,
      p_idempotency_key: crypto.randomUUID(),
      p_provenance: "owner_manual",
      p_changes: [
        addSession("7d000000-0000-4000-8000-" + hex(982), packedDate, 11),
      ],
    }),
  ]);
  assert.ok(
    eleventh.every(({ status }) => status !== 200),
    `neither concurrent eleventh session may commit; ${JSON.stringify(eleventh)}`,
  );
  assert.ok(
    eleventh.some(({ body }) => body?.code === "PT423"),
    `the cap must be the stated reason; ${JSON.stringify(eleventh)}`,
  );
  assert.equal(
    (
      await get(
        owner.token,
        `/rest/v1/rolling_plan_sessions?select=id&status=eq.active&local_date=eq.${packedDate}`,
      )
    ).length,
    DAILY_LIMIT,
    "a refused eleventh leaves the date exactly full",
  );

  // A label is not a session, so a full date still accepts one.
  const label = await rawChange(owner.token, {
    p_expected_plan_revision: revision,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: [
      {
        operation: "set_recovery_day",
        localDate: packedDate,
        isRecoveryDay: true,
      },
    ],
  });
  assert.equal(label.status, 200, JSON.stringify(label));

  const past = await rawChange(owner.token, {
    p_expected_plan_revision: revision + 1,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: [
      addSession("7d000000-0000-4000-8000-" + hex(983), futureDate(-1), 0),
    ],
  });
  assert.equal(past.status, 422);
  assert.equal(past.body?.code, "PT422");

  const withoutZone = await rawChange(zoneless.token, {
    p_expected_plan_revision: 0,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: [
      addSession("7d000000-0000-4000-8000-" + hex(984), futureDate(1), 0),
    ],
  });
  assert.equal(withoutZone.status, 428);
  assert.equal(withoutZone.body?.code, "PT428");
  assert.deepEqual(
    await get(zoneless.token, "/rest/v1/rolling_plans?select=revision"),
    [],
    "an owner without a stored zone materializes no plan",
  );

  assert.deepEqual(
    await get(zoneless.token, "/rest/v1/rolling_plan_recovery_days?select=id"),
    [],
    "another owner cannot read recovery day labels",
  );

  console.log(
    `M3-12 planning-rule concurrency PASS: ${ROUNDS} same-revision session-versus-label races each produced one winner and one PT409 stale loser; the per-date cap, the past boundary, and the stored-zone requirement each held under a concurrent attempt.`,
  );
} finally {
  await Promise.all(users.map(deleteOwner));
}

function hex(value) {
  return value.toString(16).padStart(12, "0");
}

function futureDate(offset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function addSession(sessionId, localDate, position) {
  return {
    operation: "add",
    sessionId,
    session: {
      localDate,
      position,
      title: `Session ${position}`,
      sport: "Running",
      isLocked: false,
      activities: [],
    },
  };
}

function sessionArgs(round) {
  return {
    p_expected_plan_revision: round,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: [
      addSession(
        `7d000000-0000-4000-8000-${hex(round + 1)}`,
        futureDate(round + 1),
        0,
      ),
    ],
  };
}

function recoveryArgs(round) {
  return {
    p_expected_plan_revision: round,
    p_idempotency_key: crypto.randomUUID(),
    p_provenance: "owner_manual",
    p_changes: [
      {
        operation: "set_recovery_day",
        localDate: futureDate(round + 1),
        isRecoveryDay: true,
      },
    ],
  };
}

async function createOwner(label, timezoneName) {
  const email = `m3-12-${label}-${crypto.randomUUID()}@example.test`;
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
    body: {
      user_id: created.id,
      ...(timezoneName ? { timezone_name: timezoneName } : {}),
    },
  });
  return { id: created.id, token: session.access_token };
}

async function deleteOwner(userId) {
  const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: authorization(serviceRoleKey),
  });
  if (!response.ok) {
    throw new Error(`Local Supabase cleanup failed with ${response.status}.`);
  }
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
