import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

// ADR-015 function 5, proven rather than assumed.
//
// Two proposals generated against the same head are both legitimately
// acceptable until one of them wins. `accept_roadmap_proposal` reads the head,
// compares it to the caller's expected revision, inserts the next version and
// advances the head — four steps that are only atomic because of the per-owner
// advisory lock and the `for update` on the head row. Under READ COMMITTED
// without them, two concurrent acceptances both read revision 0, both satisfy
// the expected-revision check, and both insert; the unique constraint on
// (user_id, version_number) would catch the second, but as a database error
// rather than as the reviewable conflict the owner is supposed to see.
//
// pgTAP runs in one session and cannot express that race at all, which is why
// this harness exists beside the M1-01, M2-01 and M3-01B ones. Acceptance
// criterion 6 asks for concurrent acceptance to be proven by test.

const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI_ENTRY = join(
  WORKSPACE_ROOT,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);

// Two contenders is the minimum that can race and is not enough to prove
// anything: a pair usually resolves in sequence, and a harness that passes with
// the lock removed is the test that proves nothing. Measured the same way
// M3-01B measured its own numbers — with the advisory lock and the `for update`
// removed from a copy of the function, six contenders over four rounds produced
// a duplicate-version error in every round, and two contenders in one round
// passed more often than it failed.
const ROUNDS = 4;
const CONTENDERS = 6;

const CONFLICT_CODE = "PT409";
const FIXTURE_CODES = {
  provider: "fixture",
  model: "fixture-corpus-v1",
  rateCard: "fixture-no-spend",
};

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
  // -----------------------------------------------------------------------
  // Race one: several proposals, one head. Exactly one may become version 1.
  // -----------------------------------------------------------------------
  for (let round = 0; round < ROUNDS; round += 1) {
    const owner = await createOwner(`race-${round}`);
    const goalId = await createGoal(owner);

    const proposals = [];
    for (let index = 0; index < CONTENDERS; index += 1) {
      proposals.push(await createProposal(owner, goalId, index));
    }

    const contest = await Promise.all(
      proposals.map((proposalId) =>
        owner.client.rpc("accept_roadmap_proposal", {
          p_proposal_id: proposalId,
          p_expected_head_revision: 0,
        }),
      ),
    );

    const admitted = contest.filter(({ data, error }) => data && !error);
    assert(
      admitted.length === 1,
      `Round ${round}: expected exactly one acceptance to commit, received ${admitted.length}`,
    );
    assert(
      admitted[0].data.result === "accepted",
      `Round ${round}: the winner must report an acceptance, received ${admitted[0].data.result}`,
    );

    // Every loser must be told its roadmap changed, not that the database
    // broke. A unique-violation leaking through as 23505 would mean the
    // serialization is being done by a constraint after the fact rather than by
    // the lock before it, and the owner would see an error they cannot act on.
    for (const refusal of contest.filter(({ error }) => error !== null)) {
      assert(
        refusal.error.code === CONFLICT_CODE,
        `Round ${round}: expected ${CONFLICT_CODE}, received ${refusal.error.code} (${refusal.error.message})`,
      );
    }

    const { data: versions } = await owner.client
      .from("roadmap_versions")
      .select("id, version_number, previous_version_id");
    assert(
      versions.length === 1 && Number(versions[0].version_number) === 1,
      `Round ${round}: expected exactly one accepted version, found ${versions.length}`,
    );
    assert(
      versions[0].previous_version_id === null,
      `Round ${round}: the first version must link no predecessor`,
    );

    const { data: head } = await owner.client
      .from("roadmap_heads")
      .select("revision, current_version_id")
      .single();
    assert(
      Number(head.revision) === 1 && head.current_version_id === versions[0].id,
      `Round ${round}: the head must point at the single accepted version`,
    );

    // No losing transaction may leave a decision behind.
    const { data: decisions } = await owner.client
      .from("roadmap_proposal_decisions")
      .select("proposal_id, decision");
    assert(
      decisions.length === 1 && decisions[0].decision === "accepted",
      `Round ${round}: expected one accepted decision, found ${decisions.length}`,
    );
  }

  // -----------------------------------------------------------------------
  // Race two: the *same* proposal accepted several times at once.
  //
  // This is the uncertain-retry case rather than a conflict. Every caller must
  // come away with the same version, and there must still be exactly one.
  // -----------------------------------------------------------------------
  const replayOwner = await createOwner("replay");
  const replayGoal = await createGoal(replayOwner);
  const singleProposal = await createProposal(replayOwner, replayGoal, 0);

  const replays = await Promise.all(
    Array.from({ length: CONTENDERS }, () =>
      replayOwner.client.rpc("accept_roadmap_proposal", {
        p_proposal_id: singleProposal,
        p_expected_head_revision: 0,
      }),
    ),
  );

  const succeeded = replays.filter(({ data, error }) => data && !error);
  assert(
    succeeded.length === CONTENDERS,
    `Replaying one acceptance must never conflict with itself, ${CONTENDERS - succeeded.length} failed`,
  );

  const versionIds = new Set(succeeded.map(({ data }) => data.version_id));
  assert(
    versionIds.size === 1,
    `Every replay must return the same version, received ${versionIds.size}`,
  );
  assert(
    succeeded.filter(({ data }) => data.result === "accepted").length === 1,
    "Exactly one replay may report the acceptance; the rest are replays",
  );

  const { data: replayVersions } = await replayOwner.client
    .from("roadmap_versions")
    .select("id");
  assert(
    replayVersions.length === 1,
    `Replaying acceptance created ${replayVersions.length} versions`,
  );

  // -----------------------------------------------------------------------
  // Race three: one owner's contention never reaches another's.
  // -----------------------------------------------------------------------
  const neighbour = await createOwner("neighbour");
  const neighbourGoal = await createGoal(neighbour);
  const neighbourProposal = await createProposal(neighbour, neighbourGoal, 0);

  const [mine, theirs] = await Promise.all([
    (async () => {
      const owner = await createOwner("parallel");
      const goal = await createGoal(owner);
      const proposal = await createProposal(owner, goal, 0);
      return owner.client.rpc("accept_roadmap_proposal", {
        p_proposal_id: proposal,
        p_expected_head_revision: 0,
      });
    })(),
    neighbour.client.rpc("accept_roadmap_proposal", {
      p_proposal_id: neighbourProposal,
      p_expected_head_revision: 0,
    }),
  ]);

  assert(
    !mine.error && !theirs.error,
    "Two different owners accepting at once must both succeed",
  );

  console.log(
    `M3-02 concurrent acceptance: ${ROUNDS} rounds of ${CONTENDERS} contenders, replay, and cross-owner isolation all held.`,
  );
} finally {
  for (const owner of owners) {
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
  }
}

async function createProposal(owner, goalId, index) {
  const startDate = isoDate(0);
  const endDate = isoDate(84);

  const { data: claim, error: claimError } = await owner.client.rpc(
    "begin_roadmap_generation",
    {
      p_idempotency_key: `harness-${randomUUID().replaceAll("-", "")}`,
      p_request_fingerprint: `harness-fingerprint-${index}-${randomUUID()}`,
      p_start_date: startDate,
      p_end_date: endDate,
      p_expected_head_revision: 0,
    },
  );
  assert(!claimError, `Could not claim a generation: ${claimError?.message}`);

  const { data: finished, error: finishError } = await owner.client.rpc(
    "finish_roadmap_generation",
    {
      p_completion_token: claim.completion_token,
      p_outcome: "proposal",
      p_schema_version: "fittip.roadmap.v2",
      p_prompt_version: "harness",
      p_provider_code: FIXTURE_CODES.provider,
      p_model_code: FIXTURE_CODES.model,
      p_rate_card_version: FIXTURE_CODES.rateCard,
      p_content: roadmapContent(goalId, startDate, endDate, index),
      p_sources: [{ kind: "goal", recordId: goalId }],
    },
  );
  assert(!finishError, `Could not persist a proposal: ${finishError?.message}`);
  return finished.proposal_id;
}

function roadmapContent(goalId, startDate, endDate, index) {
  return {
    schemaVersion: "fittip.roadmap.v2",
    title: `Harness roadmap ${index}`,
    summary: "A structurally valid roadmap used only to race acceptance.",
    startDate,
    endDate,
    phases: [
      {
        title: "Single phase",
        focus: "Covers the whole horizon so the envelope check passes.",
        startDate,
        endDate,
        goalAttention: [
          {
            goalId,
            level: "primary",
            reason: "The only goal in this harness.",
          },
        ],
        milestones: [
          {
            title: "Harness milestone",
            observableCriterion: "Something an observer could verify.",
            targetDate: endDate,
            goalIds: [goalId],
          },
        ],
      },
    ],
    reviewPoints: [
      {
        title: "Harness review",
        triggerDate: endDate,
        question: "Is this still the right direction?",
      },
    ],
  };
}

/**
 * Seeded through the owner's own approved transaction, not by an insert.
 *
 * `goals` grants `authenticated` nothing but `select`, and the service role no
 * write at all: every goal in this system is created by `apply_goal_change`.
 * Seeding around that would be seeding a row the application could not have
 * produced.
 */
async function createGoal(owner) {
  const { data, error } = await owner.client.rpc("apply_goal_change", {
    p_operation: "create",
    p_expected_collection_revision: 0,
    p_title: "Harness goal",
    p_desired_outcome: "Exists so a proposal has something to attend to.",
    p_category: "endurance",
    p_activity_areas: ["Running"],
    p_start_date: isoDate(0),
    p_priority_tier: "core",
  });
  assert(!error, `Could not seed a goal: ${error?.message}`);
  const goalId = data?.goal_id ?? data?.id ?? data;
  assert(
    typeof goalId === "string",
    `Goal creation returned no id: ${JSON.stringify(data)}`,
  );
  return goalId;
}

async function createOwner(label) {
  const email = `m3-02-${label}-${randomUUID()}@example.test`;
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

function isoDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
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
      "The local Supabase stack must be running before the M3-02 concurrency test.",
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
