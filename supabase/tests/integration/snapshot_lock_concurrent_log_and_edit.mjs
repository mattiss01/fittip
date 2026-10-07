import assert from "node:assert/strict";

// A log and an edit of the same planned session, sent at once (7 Oct 2026).
//
// `apply_completion_change` holds the planned row from before it reads the
// snapshot, and every plan verb asks for that row `for update`. So whichever
// of the two commits first, the log's stored snapshot is the session as the
// plan holds it: either the edit landed first and the log was measured against
// the edited session, or the log landed first and the edit was refused as a
// change to a logged session. The state this rules out is a log that carries
// the title from before an edit the plan kept.
//
// The window that produced that state was one function call wide, so a round
// that passes does not prove the lock; it is the invariant over many rounds
// that this asserts. Both orders have to have happened for the run to count:
// one in which every edit lost, or every edit won, says nothing about the
// other side and fails.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROUNDS = 40;
const TIMEZONE = "UTC";
const today = new Date().toISOString().slice(0, 10);

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("The local Supabase test environment is required.");
}

const users = [];

try {
  const owner = await createOwner("owner");
  let revision = 0;
  let editsKept = 0;
  let editsRefused = 0;

  for (let round = 0; round < ROUNDS; round += 1) {
    const sessionId = crypto.randomUUID();
    const planned = await planChange(owner.token, revision, [
      {
        operation: "add",
        sessionId,
        session: {
          // A day holds at most ten active sessions and a logged one stays
          // active, so each round plans on a day of its own. The log is a
          // skip written today, which a later day's session accepts.
          localDate: dayFromToday(round),
          position: 0,
          title: `Planned ${round}`,
          sport: "Running",
          isLocked: false,
          activities: [],
        },
      },
    ]);
    assert.equal(planned.status, 200, JSON.stringify(planned));
    revision += 1;

    // Alternate which request is sent first, so neither order is favoured by
    // the order the two are handed to the network.
    const send = [
      () =>
        completionChange(owner.token, {
          p_operation: "create",
          p_completion: {
            planSessionId: sessionId,
            status: "skipped",
            actualLocalDate: today,
            activities: [],
          },
        }),
      () =>
        planChange(owner.token, revision, [
          {
            operation: "edit",
            sessionId,
            session: {
              title: `Edited ${round}`,
              sport: "Running",
              activities: [],
            },
          },
        ]),
    ];
    const [log, edit] =
      round % 2 === 0
        ? await Promise.all([send[0](), send[1]()])
        : (await Promise.all([send[1](), send[0]()])).toReversed();

    assert.equal(
      log.status,
      200,
      `round ${round}: the log is written whichever side wins; ${JSON.stringify(log)}`,
    );
    assert.ok(
      edit.status === 200 || edit.body?.code === "PT425",
      `round ${round}: the edit lands or is refused as a change to a logged session; ${JSON.stringify(edit)}`,
    );
    if (edit.status === 200) {
      revision += 1;
      editsKept += 1;
    } else {
      editsRefused += 1;
    }

    const [stored] = await get(
      owner.token,
      `/rest/v1/completions?select=planned_snapshot&plan_session_id=eq.${sessionId}`,
    );
    const [row] = await get(
      owner.token,
      `/rest/v1/rolling_plan_sessions?select=title&id=eq.${sessionId}`,
    );
    assert.equal(
      row.title,
      edit.status === 200 ? `Edited ${round}` : `Planned ${round}`,
      `round ${round}: the plan holds the edit exactly when the edit was accepted`,
    );
    assert.equal(
      stored.planned_snapshot.title,
      row.title,
      `round ${round}: the log was measured against the session the plan holds`,
    );
  }

  assert.ok(
    editsKept > 0 && editsRefused > 0,
    `both orders must occur for the run to prove anything: the edit landed first ${editsKept} times and was refused ${editsRefused} times in ${ROUNDS} rounds`,
  );

  console.log(
    `Snapshot lock PASS: ${ROUNDS} simultaneous log-and-edit pairs each left a log whose planned snapshot is the session the plan holds; the edit landed first ${editsKept} times and was refused as a change to a logged session ${editsRefused} times.`,
  );
} finally {
  await Promise.all(users.map(deleteOwner));
}

function dayFromToday(offset) {
  const day = new Date(`${today}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

async function planChange(token, expectedRevision, changes) {
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
        p_expected_plan_revision: expectedRevision,
        p_idempotency_key: crypto.randomUUID(),
        p_provenance: "owner_manual",
        p_changes: changes,
      }),
    },
  );
  return { status: response.status, body: await response.json() };
}

async function completionChange(token, body) {
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

async function createOwner(label) {
  const email = `snapshot-lock-${label}-${crypto.randomUUID()}@example.test`;
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
