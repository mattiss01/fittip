import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI_ENTRY = join(
  WORKSPACE_ROOT,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const CONFLICT_DEADLINE_MS = 5_000;

const status = readLocalStatus();
const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
const userClient = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const userEmail = `m1-concurrency-${randomUUID()}@example.test`;
const userPassword = `M1-${randomUUID()}-Aa1!`;
let userId;

try {
  const {
    data: { user },
    error: createError,
  } = await admin.auth.admin.createUser({
    email: userEmail,
    password: userPassword,
    email_confirm: true,
  });
  assert(
    !createError && user,
    `Could not create local test user: ${createError?.message}`,
  );
  userId = user.id;

  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: userEmail,
    password: userPassword,
  });
  assert(
    !signInError,
    `Could not sign in local test user: ${signInError?.message}`,
  );

  const { error: profileError } = await userClient
    .from("profiles")
    .insert({ user_id: userId });
  assert(
    !profileError,
    `Could not create local test profile: ${profileError?.message}`,
  );

  const raceStartedAt = performance.now();
  const results = await Promise.all([
    savePlan("Concurrent plan A"),
    savePlan("Concurrent plan B"),
  ]);
  const raceElapsedMs = performance.now() - raceStartedAt;

  const successes = results.filter(
    ({ data, error, status: httpStatus }) =>
      data !== null && error === null && httpStatus === 200,
  );
  const conflicts = results.filter(
    ({ data, error, status: httpStatus }) =>
      data === null &&
      error?.code === "PT409" &&
      httpStatus === 409 &&
      error.message === "The training plan changed before this save.",
  );

  assert(
    successes.length === 1,
    `Expected one success, received ${successes.length}`,
  );
  assert(
    conflicts.length === 1,
    `Expected one PT409 conflict, received ${conflicts.length}`,
  );
  assert(
    raceElapsedMs < CONFLICT_DEADLINE_MS,
    `Conflict was not prompt: ${Math.round(raceElapsedMs)}ms`,
  );

  const { count: versionCount, error: versionError } = await userClient
    .from("detailed_plan_versions")
    .select("id", { count: "exact", head: true });
  assert(
    !versionError,
    `Could not count plan versions: ${versionError?.message}`,
  );
  assert(
    versionCount === 1,
    `Expected one plan version, received ${versionCount}`,
  );

  const { count: headCount, error: headCountError } = await userClient
    .from("detailed_plan_heads")
    .select("user_id", { count: "exact", head: true });
  assert(
    !headCountError,
    `Could not count plan heads: ${headCountError?.message}`,
  );
  assert(headCount === 1, `Expected one plan head, received ${headCount}`);

  const { data: head, error: headError } = await userClient
    .from("detailed_plan_heads")
    .select("revision, current_version_id")
    .single();
  assert(!headError && head, `Could not read plan head: ${headError?.message}`);
  assert(
    head.revision === 1,
    `Expected head revision one, received ${head.revision}`,
  );
  assert(
    head.current_version_id === successes[0].data.id,
    "The plan head does not identify the successful version",
  );

  process.stdout.write(
    `${JSON.stringify({
      result: "PASS",
      simultaneousRequests: 2,
      successes: successes.length,
      conflicts: conflicts.length,
      conflictCode: conflicts[0].error.code,
      conflictHttpStatus: conflicts[0].status,
      planVersions: versionCount,
      planHeads: headCount,
      headRevision: head.revision,
      elapsedMs: Math.round(raceElapsedMs),
    })}\n`,
  );
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    assert(!error, `Could not remove local test user: ${error?.message}`);
  }
}

function savePlan(title) {
  return userClient
    .rpc("save_manual_plan_version", {
      p_expected_revision: 0,
      p_day_count: 1,
      p_start_date: "2026-07-28",
      p_timezone_name: "Europe/Berlin",
      p_sessions: [
        {
          local_date: "2026-07-28",
          position: 0,
          title,
          sport: "Running",
          activities: [],
        },
      ],
    })
    .retry(false);
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
      "The local Supabase stack must be running before the M1-01 concurrency test.",
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
