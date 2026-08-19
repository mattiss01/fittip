import assert from "node:assert/strict";

// M3-14 acceptance criterion 6: two simultaneous materializations must produce
// one writer, no duplicate occurrence, and no blended row.
//
// Each round adds one series that fires exactly once, on its own date, and then
// races two top-ups at the same expected revision. Two outcomes are legitimate
// for the loser and both are asserted for: it either loses the revision race
// and gets one honest PT409, or it recomputes after the winner committed, finds
// nothing missing and reports `unchanged`. What is never legitimate is two
// writers, two occurrences on one rule date, a revision that moved twice, or a
// row blending two rounds' templates.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROUNDS = 10;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("The local Supabase test environment is required.");
}

const users = [];
let applied = 0;
let conflicted = 0;

try {
  const owner = await createOwner("owner", "UTC");
  const outsider = await createOwner("outsider", "UTC");
  const today = new Date().toISOString().slice(0, 10);
  let revision = 0;

  for (let round = 0; round < ROUNDS; round += 1) {
    const seriesId = crypto.randomUUID();
    const occurrenceDate = shift(today, round);
    const title = `Round ${round}`;

    const added = await rawChange(owner.token, {
      p_expected_plan_revision: revision,
      p_idempotency_key: crypto.randomUUID(),
      p_provenance: "owner_manual",
      p_changes: [
        {
          operation: "add_series",
          seriesId,
          series: {
            // An interval of 365 days makes the rule fire exactly once inside
            // the fourteen-day window, so each round owns one date and the
            // ten-per-date cap is never in play.
            frequency: "daily",
            intervalCount: 365,
            startDate: occurrenceDate,
            title,
            sport: "Running",
            activities: [
              {
                position: 0,
                name: "Easy running",
                sport: "Running",
                measurementMode: "duration_intensity",
                target: { duration_minutes: 40, intensity: "easy" },
              },
            ],
          },
        },
      ],
    });
    assert.equal(added.status, 200, JSON.stringify(added));
    revision = added.body.plan_revision;

    const attempts = await Promise.all([
      materialize(owner.token, revision),
      materialize(owner.token, revision),
    ]);
    const statuses = attempts.map(({ status }) => status).toSorted();
    assert.ok(
      statuses.every((status) => status === 200 || status === 409),
      `round ${round}: a top-up must answer or refuse, never fail; ${JSON.stringify(attempts)}`,
    );

    const writers = attempts.filter(
      ({ status, body }) => status === 200 && body?.result === "applied",
    );
    assert.equal(
      writers.length,
      1,
      `round ${round}: exactly one materialization may write; ${JSON.stringify(attempts)}`,
    );
    assert.equal(
      writers[0].body.created_count,
      1,
      `round ${round}: the winner writes exactly the one missing occurrence`,
    );
    assert.deepEqual(
      writers[0].body.skipped,
      [],
      `round ${round}: nothing was skipped, so nothing is reported as skipped`,
    );

    const loser = attempts.find((attempt) => attempt !== writers[0]);
    if (loser.status === 409) {
      assert.equal(loser.body?.code, "PT409");
      assert.match(loser.body?.message ?? "", /Reload and try again\./);
      conflicted += 1;
    } else {
      assert.equal(
        loser.body?.result,
        "unchanged",
        `round ${round}: a loser that did not conflict must report unchanged; ${JSON.stringify(loser)}`,
      );
      assert.equal(loser.body?.created_count, 0);
      assert.equal(
        loser.body?.change_set_id,
        null,
        `round ${round}: an unchanged top-up appends no change set`,
      );
    }
    applied += 1;

    const plan = await get(
      owner.token,
      "/rest/v1/rolling_plans?select=revision",
    );
    assert.equal(
      plan[0].revision,
      revision + 1,
      `round ${round}: the revision advances exactly once for one expansion`,
    );
    revision = plan[0].revision;

    const expansions = await get(
      owner.token,
      "/rest/v1/rolling_plan_change_sets?select=id&provenance=eq.series_expansion",
    );
    assert.equal(
      expansions.length,
      round + 1,
      `round ${round}: one expansion change set per round, never two`,
    );

    const occurrences = await get(
      owner.token,
      `/rest/v1/rolling_plan_sessions?select=id,title,sport,local_date,occurrence_date,has_diverged&series_id=eq.${seriesId}`,
    );
    assert.equal(
      occurrences.length,
      1,
      `round ${round}: one rule date yields one occurrence, never two`,
    );
    assert.deepEqual(
      {
        title: occurrences[0].title,
        sport: occurrences[0].sport,
        local_date: occurrences[0].local_date,
        occurrence_date: occurrences[0].occurrence_date,
        has_diverged: occurrences[0].has_diverged,
      },
      {
        title,
        sport: "Running",
        local_date: occurrenceDate,
        occurrence_date: occurrenceDate,
        has_diverged: false,
      },
      `round ${round}: the stored occurrence is this round's template, not a blend`,
    );

    const activities = await get(
      owner.token,
      `/rest/v1/rolling_plan_activities?select=id,name&session_id=eq.${occurrences[0].id}`,
    );
    assert.equal(
      activities.length,
      1,
      `round ${round}: the occurrence carries exactly one copied activity, not a doubled one`,
    );
  }

  // Nothing anywhere holds two occurrences of one rule date.
  const everyOccurrence = await get(
    owner.token,
    "/rest/v1/rolling_plan_sessions?select=series_id,occurrence_date&series_id=not.is.null",
  );
  const keys = everyOccurrence.map(
    (row) => `${row.series_id}|${row.occurrence_date}`,
  );
  assert.equal(
    new Set(keys).size,
    keys.length,
    "no rule date gained a second occurrence across the whole run",
  );
  assert.equal(everyOccurrence.length, ROUNDS);

  // A second owner's top-up writes nothing here and reads nothing of it.
  const outsiderTopUp = await materialize(outsider.token, 0);
  assert.equal(outsiderTopUp.status, 200, JSON.stringify(outsiderTopUp));
  assert.equal(outsiderTopUp.body.result, "unchanged");
  assert.equal(outsiderTopUp.body.created_count, 0);
  assert.deepEqual(
    await get(outsider.token, "/rest/v1/rolling_plan_series?select=id"),
    [],
    "another owner reads no series",
  );
  assert.deepEqual(
    await get(
      outsider.token,
      "/rest/v1/rolling_plan_sessions?select=id&series_id=not.is.null",
    ),
    [],
    "and no occurrence of one",
  );

  const directWrite = await fetch(`${url}/rest/v1/rolling_plan_series`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${outsider.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: outsider.id,
      plan_id: crypto.randomUUID(),
      frequency: "daily",
      interval_count: 1,
      start_date: today,
      title: "Direct",
      sport: "Running",
    }),
  });
  assert.equal(
    directWrite.status,
    403,
    "no client role may write the series table directly",
  );

  console.log(
    `M3-14 materialization concurrency PASS: ${applied} simultaneous top-up races each produced exactly one writer, one occurrence per rule date, one expansion change set and one revision advance; ${conflicted} of ${applied} losers were refused with an honest PT409 and the rest reported unchanged without appending a change set; ${ROUNDS} rule dates ended with ${ROUNDS} occurrences and no duplicate or blended row; a second owner's top-up wrote nothing, read nothing, and a direct table write was refused.`,
  );
} finally {
  await Promise.all(users.map(deleteOwner));
}

function shift(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function materialize(token, expectedPlanRevision) {
  return rpc(token, "materialize_rolling_plan_series", {
    p_expected_plan_revision: expectedPlanRevision,
    p_idempotency_key: crypto.randomUUID(),
  });
}

function rawChange(token, body) {
  return rpc(token, "apply_rolling_plan_change_set", body);
}

async function rpc(token, name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
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

async function createOwner(label, timezoneName) {
  const email = `m3-14-${label}-${crypto.randomUUID()}@example.test`;
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
