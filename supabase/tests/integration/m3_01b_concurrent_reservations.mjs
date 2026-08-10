import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

// M3-01B decision 8. `reserve_ai_spend` checks the daily and total ceilings in
// the WHERE clause of the INSERT that writes the reservation, which is one
// statement but not, on its own, safe: an INSERT ... SELECT ... WHERE does not
// lock the rows it aggregates, so under READ COMMITTED two concurrent
// reservations both read the same under-ceiling total and both commit. The
// per-owner advisory lock is what closes that race, and it is the only reason
// the durable ceilings are real rather than advisory.
//
// Nothing else in the repository uses `lock_timeout` with a `lock_not_available`
// handler, so this harness exists to prove the pattern rather than to assume it.
// It runs against the local stack in the `database` CI job, beside the M1-01 and
// M2-01 harnesses.

const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI_ENTRY = join(
  WORKSPACE_ROOT,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);

// Mirrors the constants inside the migration. They are duplicated deliberately:
// the assertions below are only meaningful if this file states the ceiling it
// expects rather than reading whatever the function happens to enforce.
const PER_REQUEST_CEILING_MICRO_USD = 8_000;
const DAILY_CEILING_MICRO_USD = 2_000_000;
const LOCK_TIMEOUT_MS = 3_000;
const RATE_CARD_VERSION = "m3-01b-concurrency-harness";

// See the boundary race below: both numbers were measured against a copy of the
// function with the advisory lock removed, not chosen for symmetry.
const BOUNDARY_ROUNDS = 4;
const CONTENDERS = 12;

// The three refusals the boundary must keep apart. A test that accepts any of
// them for any reason would pass while the ledger reported exhaustion as
// contention, which is the difference between "try again" and "you are done for
// today".
const CEILING_MESSAGE = "Coaching spend ceiling reached.";
const CONTENTION_MESSAGE = "A coaching suggestion is already being prepared.";
const SETTLED_MESSAGE = "That coaching spend reservation is not open.";

const status = readLocalStatus();
const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const owners = [];

try {
  assert(
    new Set([CEILING_MESSAGE, CONTENTION_MESSAGE, SETTLED_MESSAGE]).size === 3,
    "The three refusal messages must stay distinguishable",
  );

  // ---------------------------------------------------------------------
  // Race one, repeated: reservations that each fit and together do not.
  //
  // A fresh owner per round, seeded to exactly one reservation of headroom,
  // then CONTENDERS reservations of that exact amount fired at once. Every
  // round must admit exactly one.
  //
  // The round count and the contender count are both measured rather than
  // guessed. Removing the advisory lock from the function and leaving the rest
  // of it alone breached the ceiling in five of six rounds at twelve
  // contenders -- up to ten of the twelve committing, for 2,072,000 against a
  // 2,000,000 ceiling -- because under READ COMMITTED they all read the same
  // 1,992,000 and all satisfied `1,992,000 + 8,000 <= 2,000,000`. Two
  // contenders in a single round was not enough: the pair usually resolved in
  // sequence and the harness passed with the lock removed, which is exactly the
  // test that proves nothing. Four rounds put the odds of missing a lock-free
  // regression under one in two hundred.
  // ---------------------------------------------------------------------
  let boundaryElapsedMs = 0;
  let saturated;
  for (let round = 0; round < BOUNDARY_ROUNDS; round += 1) {
    saturated = await createOwner(`round-${round}`);
    await seedToHeadroom(saturated);

    const startedAt = performance.now();
    const contest = await Promise.all(
      Array.from({ length: CONTENDERS }, () =>
        reserve(saturated.client, PER_REQUEST_CEILING_MICRO_USD),
      ),
    );
    boundaryElapsedMs = Math.max(
      boundaryElapsedMs,
      performance.now() - startedAt,
    );

    const admitted = contest.filter(
      ({ data, error, status: code }) => data && error === null && code === 200,
    );
    assert(
      admitted.length === 1,
      `Round ${round}: expected exactly one reservation to commit, received ${admitted.length}`,
    );

    // Every loser must say which ceiling stopped it. PT402 is exhaustion and
    // PT409 is contention; accepting either would make the harness pass
    // whichever way the function was wrong, and the two mean opposite things to
    // the caller -- "you are done for today" against "try again".
    for (const refusal of contest.filter(({ error }) => error !== null)) {
      assert(
        refusal.error.code === "PT402",
        `Round ${round}: expected the ceiling denial PT402, received ${refusal.error.code}`,
      );
      assert(
        refusal.status === 402,
        `Round ${round}: expected HTTP 402 for the ceiling denial, received ${refusal.status}`,
      );
      assert(
        refusal.error.message === CEILING_MESSAGE,
        `Round ${round}: expected the ceiling message, received ${refusal.error.message}`,
      );
    }

    const atCeiling = await dailySpend(saturated);
    assert(
      atCeiling === DAILY_CEILING_MICRO_USD,
      `Round ${round}: expected the day to hold exactly the ceiling, found ${atCeiling}`,
    );
  }

  assert(
    boundaryElapsedMs < LOCK_TIMEOUT_MS,
    `The serialized contenders did not resolve inside the lock timeout: ${Math.round(boundaryElapsedMs)}ms`,
  );

  const first = await createOwner("first");
  const second = await createOwner("second");

  // ---------------------------------------------------------------------
  // Race two: the ceiling aggregate is per owner.
  //
  // The saturated owner is refused while two others reserving at the same
  // moment commit. An owner-blind `sum()` fails here and cannot not fail: by
  // this point the four boundary rounds have put 8,000,000 micro-USD on the
  // table across their owners, so a global aggregate refuses both newcomers and
  // `unaffectedOne` fires.
  //
  // **This does not prove the lock is per owner**, and the elapsed-time
  // assertion below must not be read as proving it. Replacing the migration's
  // `pg_advisory_xact_lock(62004, hashtext(v_user_id::text))` with a global
  // `pg_advisory_xact_lock(62004)` leaves this block passing: the three
  // transactions serialize, but each holds the lock for single-digit
  // milliseconds, so nothing here can tell "no contention" from "contention
  // resolved in 2ms". The elapsed bound only catches a lock held past
  // `lock_timeout`. The lock's per-owner keying is read from the migration, not
  // demonstrated here.
  // ---------------------------------------------------------------------
  const isolationStartedAt = performance.now();
  const [exhausted, unaffectedOne, unaffectedTwo] = await Promise.all([
    reserve(saturated.client, 1),
    reserve(first.client, PER_REQUEST_CEILING_MICRO_USD),
    reserve(second.client, PER_REQUEST_CEILING_MICRO_USD),
  ]);
  const isolationElapsedMs = performance.now() - isolationStartedAt;

  assert(
    exhausted.error?.code === "PT402",
    `A full day must refuse even one micro-USD: ${exhausted.error?.code}`,
  );
  assert(
    unaffectedOne.error === null && unaffectedOne.data,
    `A different owner must not inherit the refusal: ${unaffectedOne.error?.message}`,
  );
  assert(
    unaffectedTwo.error === null && unaffectedTwo.data,
    `A third owner must not inherit the refusal: ${unaffectedTwo.error?.message}`,
  );
  // Catches a lock held past its timeout, and nothing finer. See above.
  assert(
    isolationElapsedMs < LOCK_TIMEOUT_MS,
    `A reservation waited past the lock timeout: ${Math.round(isolationElapsedMs)}ms`,
  );
  assert(
    (await dailySpend(first)) === PER_REQUEST_CEILING_MICRO_USD,
    "The first owner's day must hold only its own reservation",
  );
  assert(
    (await dailySpend(second)) === PER_REQUEST_CEILING_MICRO_USD,
    "The second owner's day must hold only its own reservation",
  );

  // ---------------------------------------------------------------------
  // Race three: a reservation settles once, whichever settlement arrives first.
  //
  // `settled_at is null` is evaluated under the row lock the UPDATE itself
  // takes, so the loser matches no row and is told the reservation is closed --
  // a different refusal from either ceiling, and one the caller must be able to
  // ignore rather than turn into a failed proposal.
  // ---------------------------------------------------------------------
  const token = unaffectedOne.data.settlement_token;
  const settlements = await Promise.all([
    settle(first.client, token, 4_000),
    settle(first.client, token, 6_000),
  ]);
  const settled = settlements.filter(({ error }) => error === null);
  const rejected = settlements.filter(({ error }) => error !== null);
  assert(
    settled.length === 1,
    `Expected exactly one settlement to land, received ${settled.length}`,
  );
  assert(
    rejected[0].error.code === "PT409",
    `Expected the closed-reservation PT409, received ${rejected[0].error.code}`,
  );
  assert(
    rejected[0].status === 409,
    `Expected HTTP 409 for a closed reservation, received ${rejected[0].status}`,
  );
  assert(
    rejected[0].error.message === SETTLED_MESSAGE,
    `Expected the closed-reservation message, received ${rejected[0].error.message}`,
  );
  assert(
    rejected[0].error.message !== CEILING_MESSAGE,
    "A closed reservation must not be reported as exhaustion",
  );

  const chargedRow = await rows(first);
  assert(
    chargedRow.length === 1 &&
      chargedRow[0].charged_micro_usd === settled[0].data.charged_micro_usd,
    "The stored charge must match the settlement that won",
  );
  assert(
    [4_000, 6_000].includes(chargedRow[0].charged_micro_usd),
    `The stored charge came from neither settlement: ${chargedRow[0].charged_micro_usd}`,
  );

  process.stdout.write(
    `${JSON.stringify({
      result: "PASS",
      dailyCeilingMicroUsd: DAILY_CEILING_MICRO_USD,
      boundaryRounds: BOUNDARY_ROUNDS,
      contendersPerRound: CONTENDERS,
      admittedPerRound: 1,
      boundaryRefusedCode: "PT402",
      slowestRoundMs: Math.round(boundaryElapsedMs),
      isolationElapsedMs: Math.round(isolationElapsedMs),
      concurrentOwnersAdmitted: 2,
      settlementsLanded: settled.length,
      settlementRefusedCode: rejected[0].error.code,
    })}\n`,
  );
} finally {
  for (const owner of owners) {
    const { error } = await admin.auth.admin.deleteUser(owner.userId);
    assert(!error, `Could not remove local test user: ${error?.message}`);
  }
}

/**
 * A confirmed local user with a profile and its own signed-in client. Every
 * reservation carries the owner's own JWT, because that is the situation
 * decision 8 exists for: this repository has no service-role client, so the
 * party the ceiling constrains is the party whose token writes it.
 */
async function createOwner(label) {
  const email = `m3-01b-${label}-${randomUUID()}@example.test`;
  const password = `M3-${randomUUID()}-Aa1!`;

  const {
    data: { user },
    error: createError,
  } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert(
    !createError && user,
    `Could not create local test user: ${createError?.message}`,
  );

  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const owner = { userId: user.id, client };
  owners.push(owner);

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert(
    !signInError,
    `Could not sign in local test user: ${signInError?.message}`,
  );

  const { error: profileError } = await client
    .from("profiles")
    .insert({ user_id: user.id });
  assert(
    !profileError,
    `Could not create local test profile: ${profileError?.message}`,
  );

  return owner;
}

/**
 * Fills an owner's day to exactly one reservation of headroom.
 *
 * Reservations are capped at 8,000 each, so filling 2,000,000 with open
 * reservations would take 250 round trips per round. Settlements are not capped
 * at the per-request ceiling -- `settle_ai_spend` accepts up to 1,000,000
 * because it records what the provider actually billed, which can exceed what
 * was reserved -- so two settled rows reach the same place in four calls and
 * also exercise the settled branch of the daily sum.
 */
async function seedToHeadroom(owner) {
  const each = (DAILY_CEILING_MICRO_USD - PER_REQUEST_CEILING_MICRO_USD) / 2;
  for (let seed = 0; seed < 2; seed += 1) {
    const held = await reserve(owner.client, PER_REQUEST_CEILING_MICRO_USD);
    assert(
      held.error === null && held.data,
      `Could not seed a reservation: ${held.error?.message}`,
    );
    const closed = await settle(owner.client, held.data.settlement_token, each);
    assert(
      closed.error === null,
      `Could not seed a settlement: ${closed.error?.message}`,
    );
  }

  const seeded = await dailySpend(owner);
  assert(
    seeded === DAILY_CEILING_MICRO_USD - PER_REQUEST_CEILING_MICRO_USD,
    `Expected the seeded day to sit one reservation below the ceiling, found ${seeded}`,
  );
}

/**
 * Retries are disabled on purpose. A retried reservation is a second row and a
 * second hold on the ceiling, so a transport hiccup must surface rather than be
 * quietly re-sent -- the same reason the application's atomic RPCs disable them.
 */
function reserve(client, reservedMicroUsd) {
  return client
    .rpc("reserve_ai_spend", {
      p_operation: "create_roadmap",
      p_reserved_micro_usd: reservedMicroUsd,
      p_rate_card_version: RATE_CARD_VERSION,
      p_currency: "USD",
    })
    .retry(false);
}

function settle(client, settlementToken, chargedMicroUsd) {
  return client
    .rpc("settle_ai_spend", {
      p_settlement_token: settlementToken,
      p_charged_micro_usd: chargedMicroUsd,
    })
    .retry(false);
}

/**
 * Read back through the owner's own SELECT grant, which deliberately excludes
 * `settlement_token`. Naming it here would fail, which is the point.
 */
async function rows(owner) {
  const { data, error } = await owner.client
    .from("ai_spend_reservations")
    .select("reserved_micro_usd, charged_micro_usd, settled_at, expires_at");
  assert(!error, `Could not read the spend ledger: ${error?.message}`);
  return data;
}

/** The same arithmetic the function applies, evaluated from outside it. */
async function dailySpend(owner) {
  const now = Date.now();
  return (await rows(owner)).reduce((total, row) => {
    if (row.settled_at !== null) return total + row.charged_micro_usd;
    if (Date.parse(row.expires_at) > now) return total + row.reserved_micro_usd;
    return total;
  }, 0);
}

function readLocalStatus() {
  let output;
  try {
    output = execFileSync(
      process.execPath,
      [SUPABASE_CLI_ENTRY, "status", "--output", "json"],
      {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    throw new Error(
      "The local Supabase stack must be running before the M3-01B concurrency test.",
    );
  }

  const parsed = JSON.parse(output);
  for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
    assert(
      typeof parsed[key] === "string" && parsed[key].length > 0,
      `Local Supabase status did not provide ${key}.`,
    );
  }
  return parsed;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
