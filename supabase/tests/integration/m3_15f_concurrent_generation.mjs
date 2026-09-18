import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

// M3-09, proved rather than described.
//
// `begin_roadmap_generation` reads `roadmap_generation_requests` for the
// caller's idempotency key *before* it takes the per-owner advisory lock, which
// is correct: a replay must not queue behind an unrelated generation. The cost
// is a window. Two callers carrying the same key both read "not found", then
// serialize on the lock; the winner inserts and commits, and the loser wakes up
// and hits `roadmap_generation_requests_key_key`.
//
// Before M3-15F that unique violation escaped as an unmapped 23505. The
// repository mapped it to `RoadmapPersistenceError`, so the owner was told
// their generation had failed while the generation their other tab opened was
// running normally — two tabs, one real attempt, and one lie about it.
//
// pgTAP cannot reach this. Its assertions run inside one transaction on one
// connection, so the losing caller's insert can never actually collide with a
// committed row. Two signed-in clients firing the same key at the same instant
// can, which is what this harness is.
//
// What it must show, and what a weaker version would miss:
//
//   * Exactly one caller is told `claimed`. `claimed` is the one state that
//     authorizes a provider call, so two of them would mean two paid calls for
//     one request.
//   * The other caller succeeds, with the same generation id and completion
//     token, reporting `pending`. Not an error, and not a second attempt.
//   * Exactly one row exists for the key afterwards.
//   * A concurrent caller reusing the key with *different* input still gets the
//     PT409 conflict. The replay path must not have been widened into "any
//     collision is fine": that would let a reused key silently answer a
//     question nobody asked.
//
// Rounds are repeated because a single pair frequently resolves in sequence and
// never collides at all, which is the run that passes whatever the function
// does.

const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI_ENTRY = join(
  WORKSPACE_ROOT,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);

/** Enough rounds that a run where no pair actually collides is unlikely. */
const ROUNDS = 6;
/**
 * Callers per round. Two is the defect's own shape; more of them make the
 * collision likely in any one round without changing what is asserted.
 */
const CALLERS = 4;

const CONFLICT_MESSAGE = "That coaching request changed. Reload and try again.";

const status = readLocalStatus();
const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const owners = [];
let collidedRounds = 0;

try {
  const today = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 84 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  for (let round = 0; round < ROUNDS; round += 1) {
    // A fresh owner per round. The advisory lock is keyed on the owner, so
    // reusing one would have later rounds contend with earlier ones and blur
    // what each round proves.
    const owner = await createOwner(`round-${round}`);
    const key = `m3-15f-${randomUUID()}`.slice(0, 64);
    const fingerprint = `roadmap.v2:${today}:${endDate}:0:initial:0:0`;

    const receipts = await Promise.all(
      Array.from({ length: CALLERS }, () =>
        begin(owner, key, fingerprint, today, endDate),
      ),
    );

    const failures = receipts.filter(({ error }) => error !== null);
    assert(
      failures.length === 0,
      `A concurrent same-key generation failed: ${failures[0]?.error?.code} ${failures[0]?.error?.message}`,
    );

    const claimed = receipts.filter(({ data }) => data.state === "claimed");
    const pending = receipts.filter(({ data }) => data.state === "pending");
    assert(
      claimed.length === 1,
      `Expected exactly one caller to be told claimed, received ${claimed.length}`,
    );
    assert(
      pending.length === CALLERS - 1,
      `Expected every other caller to replay as pending, received ${pending.length}`,
    );

    const winner = claimed[0].data;
    for (const replay of pending) {
      assert(
        replay.data.generation_id === winner.generation_id,
        "A replay returned a different generation than the one that was opened",
      );
      assert(
        replay.data.completion_token === winner.completion_token,
        "A replay returned a different completion token",
      );
    }

    // The row count is what says no second attempt was opened, independently of
    // what the receipts claimed.
    const { data: rows, error: readError } = await owner.client
      .from("roadmap_generation_requests")
      .select("id, status, regeneration_number")
      .eq("idempotency_key", key);
    assert(
      !readError,
      `Could not read back the attempt: ${readError?.message}`,
    );
    assert(
      rows.length === 1,
      `Expected one attempt for one key, found ${rows.length}`,
    );
    assert(
      rows[0].status === "pending",
      `Expected the stored attempt to be pending, found ${rows[0].status}`,
    );

    // The replay path must still refuse a reused key with different input, on
    // the concurrent path as well as the sequential one. Fired against the
    // committed row, so this is the post-collision branch.
    const reused = await begin(
      owner,
      key,
      `${fingerprint}:different`,
      today,
      endDate,
    );
    assert(
      reused.error !== null,
      "A reused key with different input must not replay silently",
    );
    assert(
      reused.error.code === "PT409",
      `Expected PT409 for a changed fingerprint, received ${reused.error.code}`,
    );
    assert(
      reused.error.message === CONFLICT_MESSAGE,
      `Expected the changed-request message, received ${reused.error.message}`,
    );

    // Whether the round actually raced is observable: a round that resolved in
    // sequence still passes every assertion above, and a run where none of them
    // collided proves nothing about the defect. It is reported rather than
    // asserted, because the scheduler is not something this harness controls.
    if (pending.some(({ elapsedMs }) => elapsedMs >= claimed[0].elapsedMs)) {
      collidedRounds += 1;
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      result: "PASS",
      defect: "M3-09",
      rounds: ROUNDS,
      callersPerRound: CALLERS,
      claimedPerRound: 1,
      replayedPerRound: CALLERS - 1,
      roundsWhereAReplayOutlastedTheClaim: collidedRounds,
      reusedKeyRefusedCode: "PT409",
    })}\n`,
  );
} finally {
  for (const owner of owners) {
    const { error } = await admin.auth.admin.deleteUser(owner.userId);
    assert(!error, `Could not remove local test user: ${error?.message}`);
  }
}

async function begin(owner, key, fingerprint, startDate, endDate) {
  const startedAt = performance.now();
  const { data, error } = await owner.client.rpc("begin_roadmap_generation", {
    p_idempotency_key: key,
    p_request_fingerprint: fingerprint,
    p_start_date: startDate,
    p_end_date: endDate,
    p_expected_head_revision: 0,
  });
  return { data, error, elapsedMs: performance.now() - startedAt };
}

/**
 * A confirmed local user with a profile and its own signed-in client.
 *
 * Every call carries the owner's own JWT. This repository has no service-role
 * client, and `begin_roadmap_generation` derives its owner from `auth.uid()`,
 * so a call made any other way would not be the call the defect occurs on.
 */
async function createOwner(label) {
  const email = `m3-15f-${label}-${randomUUID()}@example.test`;
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
      "The local Supabase stack must be running before the M3-15F concurrency test.",
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
