import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROUNDS = 12;
const TIMEZONE = "UTC";
const today = new Date().toISOString().slice(0, 10);

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("The local Supabase test environment is required.");
}

const users = [];

try {
  const owner = await createOwner("owner");
  const outsider = await createOwner("outsider");

  const created = await rawChange(owner.token, {
    p_operation: "create",
    p_completion: {
      status: "unplanned",
      actualLocalDate: today,
      durationMinutes: 40,
      activities: [],
    },
  });
  assert.equal(created.status, 200, JSON.stringify(created));
  const completionId = created.body.completion_id;
  assert.equal(created.body.revision, 0);

  // Each round races two corrections at the same revision. Exactly one must
  // commit, and the loser must be told the record changed rather than silently
  // win, silently vanish, or hang.
  for (let round = 0; round < ROUNDS; round += 1) {
    const attempts = await Promise.all([
      editAt(owner.token, completionId, round, `Left ${round}`),
      editAt(owner.token, completionId, round, `Right ${round}`),
    ]);
    const statuses = attempts.map(({ status }) => status).toSorted();
    assert.deepEqual(
      statuses,
      [200, 409],
      `round ${round}: exactly one same-revision edit must commit; ${JSON.stringify(attempts)}`,
    );
    const loser = attempts.find(({ status }) => status === 409);
    assert.equal(loser.body?.code, "PT409");
    assert.match(loser.body?.message ?? "", /changed\. Reload and try again\./);

    const winner = attempts.find(({ status }) => status === 200);
    assert.equal(winner.body.revision, round + 1);

    const rows = await get(
      owner.token,
      `/rest/v1/completions?select=note,revision,status&id=eq.${completionId}`,
    );
    assert.equal(rows.length, 1, "one mutable current record, never two");
    assert.equal(
      rows[0].revision,
      round + 1,
      `round ${round}: the token advances exactly once per committed edit`,
    );
    assert.ok(
      [`Left ${round}`, `Right ${round}`].includes(rows[0].note),
      `round ${round}: the stored note is the winner's, not a blend`,
    );
  }

  // No trail was retained anywhere: the log keeps one current row per record.
  assert.equal(
    (await get(owner.token, "/rest/v1/completions?select=id")).length,
    1,
    "twelve corrections produced one record, not thirteen",
  );

  // Two tabs logging the same planned session at once. One must win; the loser
  // must be refused rather than produce a second completion of one session.
  const planSessionId = await planOneSession(owner.token);
  const races = await Promise.all([
    logSession(owner.token, planSessionId, "completed"),
    logSession(owner.token, planSessionId, "skipped"),
  ]);
  assert.deepEqual(
    races.map(({ status }) => status).toSorted(),
    [200, 400],
    `one planned session takes one completion; ${JSON.stringify(races)}`,
  );
  assert.equal(races.find(({ status }) => status === 400).body?.code, "22023");
  assert.equal(
    (
      await get(
        owner.token,
        `/rest/v1/completions?select=id&plan_session_id=eq.${planSessionId}`,
      )
    ).length,
    1,
    "the surviving state holds exactly one completion for that session",
  );

  // The planned session cannot then be removed out from under the record.
  const forcedDelete = await fetch(
    `${url}/rest/v1/rolling_plan_sessions?id=eq.${planSessionId}`,
    {
      method: "DELETE",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${owner.token}`,
      },
    },
  );
  assert.equal(
    forcedDelete.status,
    403,
    "no client role may delete a plan session directly either",
  );

  // Another owner reaches nothing, and learns nothing about what exists.
  assert.deepEqual(
    await get(outsider.token, "/rest/v1/completions?select=id"),
    [],
    "another owner reads no completion",
  );
  assert.deepEqual(
    await get(outsider.token, "/rest/v1/completed_activities?select=id"),
    [],
    "and no completed activity",
  );
  const stolen = await editAt(outsider.token, completionId, ROUNDS, "Taken");
  assert.equal(stolen.status, 409);
  assert.equal(stolen.body?.code, "PT409");

  const directWrite = await fetch(`${url}/rest/v1/completions`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${outsider.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: outsider.id,
      status: "unplanned",
      actual_local_date: today,
      timezone_name: TIMEZONE,
    }),
  });
  assert.equal(
    directWrite.status,
    403,
    "no client role may write the completion table directly",
  );

  console.log(
    `M3-15A completion concurrency PASS: ${ROUNDS} same-revision correction races each produced one winner and one PT409 stale loser with no blended row and no second record; two simultaneous completions of one planned session produced one winner and one refusal; a direct delete of the completed plan session, a cross-owner correction, and a direct table write were all refused.`,
  );
} finally {
  await Promise.all(users.map(deleteOwner));
}

function editAt(token, completionId, expectedRevision, note) {
  return rawChange(token, {
    p_operation: "edit",
    p_completion_id: completionId,
    p_expected_revision: expectedRevision,
    p_completion: { status: "unplanned", actualLocalDate: today, note },
  });
}

function logSession(token, planSessionId, status) {
  return rawChange(token, {
    p_operation: "create",
    p_completion: {
      planSessionId,
      status,
      actualLocalDate: today,
      activities: [],
    },
  });
}

/** One planned session, written through the accepted M3-12 change function. */
async function planOneSession(token) {
  const sessionId = crypto.randomUUID();
  const response = await fetch(
    `${url}/rest/v1/rpc/apply_rolling_plan_change_set`,
    {
      method: "POST",
      headers: {
        ...authorization(publishableKey),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_expected_plan_revision: 0,
        p_idempotency_key: crypto.randomUUID(),
        p_provenance: "owner_manual",
        p_changes: [
          {
            operation: "add",
            sessionId,
            session: {
              localDate: today,
              position: 0,
              title: "Aerobic run",
              sport: "Running",
              isLocked: false,
              activities: [],
            },
          },
        ],
      }),
    },
  );
  assert.equal(
    response.status,
    200,
    `the harness could not plan a session: ${await response.text()}`,
  );
  return sessionId;
}

async function createOwner(label) {
  const email = `m3-15a-${label}-${crypto.randomUUID()}@example.test`;
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
  // A completion anchors its local date in the stored zone, so the owner
  // confirms one exactly as the Plan surface does.
  await request("/rest/v1/profiles", publishableKey, {
    method: "POST",
    token: session.access_token,
    body: { user_id: created.id, timezone_name: TIMEZONE },
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
  const response = await fetch(`${url}/rest/v1/rpc/apply_completion_change`, {
    method: "POST",
    headers: {
      ...authorization(publishableKey),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
