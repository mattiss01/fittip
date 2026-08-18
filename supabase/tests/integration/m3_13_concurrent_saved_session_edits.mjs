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

  const created = await rawChange(owner.token, {
    p_operation: "create",
    p_name: "Tuesday tempo",
    p_title: "Tempo run",
    p_sport: "Running",
    p_expected_duration_minutes: 60,
    p_activities: [
      {
        position: 0,
        name: "Tempo blocks",
        sport: "Running",
        measurementMode: "duration_intensity",
        target: { duration_minutes: 30, intensity: "hard" },
      },
    ],
  });
  assert.equal(created.status, 200, JSON.stringify(created));
  const savedSessionId = created.body.saved_session_id;
  assert.equal(created.body.revision, 0);

  // Each round races two edits at the same revision. Exactly one must commit,
  // and the loser must be told the record changed rather than silently win,
  // silently vanish, or hang.
  for (let round = 0; round < ROUNDS; round += 1) {
    const attempts = await Promise.all([
      editAt(owner.token, savedSessionId, round, `Left ${round}`),
      editAt(owner.token, savedSessionId, round, `Right ${round}`),
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
      `/rest/v1/saved_sessions?select=name,revision&id=eq.${savedSessionId}`,
    );
    assert.equal(rows.length, 1, "one mutable current record, never two");
    assert.equal(
      rows[0].revision,
      round + 1,
      `round ${round}: the token advances exactly once per committed edit`,
    );
    assert.ok(
      [`Left ${round}`, `Right ${round}`].includes(rows[0].name),
      `round ${round}: the stored name is the winner's, not a blend`,
    );
  }

  // No history was retained anywhere: the library keeps one current row.
  const activities = await get(
    owner.token,
    `/rest/v1/saved_session_activities?select=id,position&saved_session_id=eq.${savedSessionId}`,
  );
  assert.equal(
    activities.length,
    1,
    "editing the record never touched the copied activities",
  );

  // A racing delete and edit at the same revision resolve the same way.
  const revision = ROUNDS;
  const raced = await Promise.all([
    rawChange(owner.token, {
      p_operation: "delete",
      p_saved_session_id: savedSessionId,
      p_expected_revision: revision,
    }),
    editAt(owner.token, savedSessionId, revision, "Too late"),
  ]);
  assert.deepEqual(
    raced.map(({ status }) => status).toSorted(),
    [200, 409],
    `a delete and an edit at one revision produce one winner; ${JSON.stringify(raced)}`,
  );

  const remaining = await get(
    owner.token,
    `/rest/v1/saved_sessions?select=id&id=eq.${savedSessionId}`,
  );
  const deleteWon = raced[0].status === 200;
  assert.equal(
    remaining.length,
    deleteWon ? 0 : 1,
    "the surviving state matches the winner, whichever it was",
  );
  if (deleteWon) {
    assert.deepEqual(
      await get(
        owner.token,
        `/rest/v1/saved_session_activities?select=id&saved_session_id=eq.${savedSessionId}`,
      ),
      [],
      "a delete removes the record and its activities permanently",
    );
  }

  // Another owner reaches nothing, and learns nothing about what exists.
  assert.deepEqual(
    await get(outsider.token, "/rest/v1/saved_sessions?select=id"),
    [],
    "another owner reads no saved session",
  );
  const stolen = await rawChange(outsider.token, {
    p_operation: "edit",
    p_saved_session_id: savedSessionId,
    p_expected_revision: revision,
    p_name: "Taken",
    p_title: "Taken",
    p_sport: "Running",
  });
  assert.equal(stolen.status, 409);
  assert.equal(stolen.body?.code, "PT409");

  const directWrite = await fetch(`${url}/rest/v1/saved_sessions`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${outsider.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: outsider.id,
      name: "X",
      title: "X",
      sport: "R",
    }),
  });
  assert.equal(
    directWrite.status,
    403,
    "no client role may write the library table directly",
  );

  console.log(
    `M3-13 saved-session concurrency PASS: ${ROUNDS} same-revision edit races each produced one winner and one PT409 stale loser with no blended row; a delete raced against an edit resolved the same way; cross-owner edit and direct table write were both refused.`,
  );
} finally {
  await Promise.all(users.map(deleteOwner));
}

function editAt(token, savedSessionId, expectedRevision, name) {
  return rawChange(token, {
    p_operation: "edit",
    p_saved_session_id: savedSessionId,
    p_expected_revision: expectedRevision,
    p_name: name,
    p_title: "Tempo run",
    p_sport: "Running",
  });
}

async function createOwner(label) {
  const email = `m3-13-${label}-${crypto.randomUUID()}@example.test`;
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
    `${url}/rest/v1/rpc/apply_saved_session_change`,
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
