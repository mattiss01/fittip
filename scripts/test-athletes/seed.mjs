// Creates the test athletes on the LOCAL Supabase stack, each a full account
// with a profile, goals, memory, a library, a plan with history, logs and (for
// some) a roadmap. Re-running replaces them: each athlete's account is deleted
// first, which takes every row of theirs with it.
//
//   node scripts/test-athletes/seed.mjs            all five
//   node scripts/test-athletes/seed.mjs mia lena   only these
//
// It reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
// SUPABASE_SERVICE_ROLE_KEY, and asks `supabase status` for any that are
// missing. It refuses any URL that is not on this machine.
//
// Writes go through the same RPCs the app calls, signed in as the athlete, so
// they meet the same rules. The exception is the past of the plan: every plan
// operation refuses a date before today, so past sessions, the series they
// belong to and their cancellations are inserted directly with psql, the way
// CLAUDE.md seeds an owner's plan. Logs against them then go through
// `apply_completion_change` again.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { addDays, sql, todayIn, weekdayOf } from "./lib.mjs";

const PASSWORD = "fittip-local";
const DB_CONTAINER = "supabase_db_fittip";
const here = dirname(fileURLToPath(import.meta.url));

const env = readEnvironment();
const athletes = await loadAthletes(process.argv.slice(2));

for (const athlete of athletes) {
  const started = Date.now();
  await seedAthlete(athlete);
  console.log(
    `${athlete.email.padEnd(28)} ready in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}
console.log(`\nPassword for every account: ${PASSWORD}`);

// ---------------------------------------------------------------------------

async function seedAthlete(athlete) {
  const today = todayIn(athlete.profile.timezone);
  const day = (offset) => addDays(today, offset);

  await deleteAccount(athlete);
  const user = await createAccount(athlete);
  const api = client(user.token);

  // Profile, as finished setup leaves it.
  const p = athlete.profile;
  await api.insert("profiles", {
    user_id: user.id,
    timezone_name: p.timezone,
    display_name: athlete.displayName,
    birth_date: p.birthDate,
    height_cm: p.heightCm,
    gender: p.gender,
    units_system: p.units,
    sports: p.sports,
    sessions_per_week: p.sessionsPerWeek,
    unavailable_days: p.unavailableDays ?? [],
    availability_note: p.availabilityNote ?? null,
    training_places: p.trainingPlaces ?? [],
    home_equipment: p.homeEquipment ?? [],
    setup_finished_at: new Date().toISOString(),
  });
  for (const [offset, kg] of athlete.weights ?? []) {
    await api.insert("weight_entries", {
      user_id: user.id,
      measured_on: day(offset),
      weight_kg: kg,
    });
  }

  // Goals, then what became of the ones that are no longer active.
  const goals = {};
  let goalRevision = 0;
  for (const goal of athlete.goals ?? []) {
    const receipt = await api.rpc("apply_goal_change", {
      p_expected_collection_revision: goalRevision,
      p_operation: "create",
      p_title: goal.title,
      p_desired_outcome: goal.outcome,
      p_sports: goal.sports,
      p_target_date: goal.target === undefined ? null : day(goal.target),
      p_priority_tier: goal.tier,
    });
    goals[goal.key] = receipt.goal_id;
    goalRevision = receipt.collection_revision;
  }
  for (const goal of athlete.goals ?? []) {
    if (!goal.then) continue;
    const receipt = await api.rpc("apply_goal_change", {
      p_expected_collection_revision: goalRevision,
      p_operation: goal.then,
      p_goal_id: goals[goal.key],
    });
    goalRevision = receipt.collection_revision;
  }

  // Memory. All of it is the athlete's own, so active on save; `then:
  // "disable"` archives an item the way the Memory page does.
  let memoryRevision = 0;
  for (const item of athlete.memory ?? []) {
    const receipt = await api.rpc("apply_memory_change", {
      p_expected_collection_revision: memoryRevision,
      p_operation: "create",
      p_memory_type: item.type,
      p_content: item.content,
      p_expires_on: item.expires === undefined ? null : day(item.expires),
    });
    memoryRevision = receipt.collection_revision;
    if (item.then) {
      const changed = await api.rpc("apply_memory_change", {
        p_expected_collection_revision: memoryRevision,
        p_operation: item.then,
        p_item_id: receipt.item_id,
      });
      memoryRevision = changed.collection_revision;
    }
  }

  // The library, then everything that refers to it.
  const library = {};
  for (const entry of athlete.library ?? []) {
    const [row] = await api.insert("personal_activities", {
      user_id: user.id,
      name: entry.name,
      sport: entry.sport,
      description: entry.description ?? null,
      measurement_mode: toMode(entry.kind),
      default_measurement: entry.value ?? null,
    });
    library[entry.key] = row.id;
  }
  const planned = (activities = []) =>
    activities.map((activity, position) => ({
      ...(activity.lib ? { personalActivityId: library[activity.lib] } : {}),
      position,
      name: activity.name,
      sport: activity.sport,
      ...(activity.instructions ? { instructions: activity.instructions } : {}),
      measurementMode: activity.measurementMode,
      ...(activity.value ? { target: activity.value } : {}),
    }));

  for (const saved of athlete.saved ?? []) {
    await api.rpc("apply_saved_session_change", {
      p_operation: "create",
      p_name: saved.name,
      p_title: saved.title,
      p_sport: saved.sport,
      p_intent: saved.intent ?? null,
      p_expected_duration_minutes: saved.minutes ?? null,
      p_note: saved.note ?? null,
      p_activities: planned(saved.activities),
    });
  }

  // The plan. Future one-off sessions go first through the change set, which
  // also creates the plan row everything else hangs from.
  const future = (athlete.sessions ?? []).filter((s) => s.day >= 0);
  const past = (athlete.sessions ?? []).filter((s) => s.day < 0);
  const futureIds = future.map(() => crypto.randomUUID());
  const positions = new Map();
  const nextPosition = (date) => {
    const position = positions.get(date) ?? 0;
    positions.set(date, position + 1);
    return position;
  };
  let planRevision = (
    await api.rpc("apply_rolling_plan_change_set", {
      p_expected_plan_revision: 0,
      p_idempotency_key: crypto.randomUUID(),
      p_provenance: "owner_manual",
      p_changes: [
        // An empty change set is refused, so a plan with nothing ahead
        // starts from a recovery label that is taken off again below.
        ...(future.length === 0
          ? [
              {
                operation: "set_recovery_day",
                localDate: today,
                isRecoveryDay: true,
              },
            ]
          : []),
        ...future.map((session, index) => ({
          operation: "add",
          sessionId: futureIds[index],
          session: {
            localDate: day(session.day),
            position: nextPosition(day(session.day)),
            ...sessionContent(session),
            activities: planned(session.activities),
          },
        })),
      ],
    })
  ).plan_revision;
  if (future.length === 0) {
    planRevision = (
      await api.rpc("apply_rolling_plan_change_set", {
        p_expected_plan_revision: planRevision,
        p_idempotency_key: crypto.randomUUID(),
        p_provenance: "owner_manual",
        p_changes: [
          {
            operation: "set_recovery_day",
            localDate: today,
            isRecoveryDay: false,
          },
        ],
      })
    ).plan_revision;
  }
  const [{ id: planId }] = await api.select(
    `rolling_plans?select=id&user_id=eq.${user.id}`,
  );

  // The past, written directly: every series (whatever its start, so the
  // materializer below can fill its future), the occurrences it already had,
  // and past one-off sessions.
  const statements = [];
  const logs = [];
  const insertSession = (row, activities) => {
    statements.push(
      `insert into public.rolling_plan_sessions (id, user_id, plan_id, local_date, position, title, sport, intent, expected_duration_minutes, note, status, cancelled_at, series_id, occurrence_date) values (${[
        row.id,
        user.id,
        planId,
        row.date,
        row.position,
        row.title,
        row.sport,
        row.intent,
        row.minutes,
        row.note,
        row.cancel ? "cancelled" : "active",
        row.cancel ? new Date().toISOString() : null,
        row.seriesId,
        row.seriesId ? row.date : null,
      ]
        .map(sql)
        .join(", ")});`,
    );
    for (const activity of activities) {
      statements.push(
        `insert into public.rolling_plan_activities (user_id, plan_id, session_id, personal_activity_id, position, name, sport, instructions, measurement_mode, target) values (${[
          user.id,
          planId,
          row.id,
          activity.personalActivityId,
          activity.position,
          activity.name,
          activity.sport,
          activity.instructions,
          activity.measurementMode,
          activity.target,
        ]
          .map(sql)
          .join(", ")});`,
      );
    }
    if (typeof row.cancel === "string") {
      statements.push(
        `insert into public.rolling_plan_session_cancellations (session_id, user_id, reason) values (${sql(row.id)}, ${sql(user.id)}, ${sql(row.cancel)});`,
      );
    }
  };

  const futureCancels = [];
  for (const series of athlete.series ?? []) {
    const seriesId = crypto.randomUUID();
    const activities = planned(series.activities);
    statements.push(
      `insert into public.rolling_plan_series (id, user_id, plan_id, frequency, interval_count, weekdays, start_date, end_date, title, sport, intent, expected_duration_minutes, note) values (${[
        seriesId,
        user.id,
        planId,
        "weekly",
        series.every ?? 1,
      ]
        .map(sql)
        .join(", ")}, array[${series.weekdays.join(",")}]::smallint[], ${[
        day(series.start),
        series.end === undefined ? null : day(series.end),
        series.title,
        series.sport,
        series.intent,
        series.minutes,
        series.note,
      ]
        .map(sql)
        .join(", ")});`,
    );
    for (const activity of activities) {
      statements.push(
        `insert into public.rolling_plan_series_activities (user_id, series_id, personal_activity_id, position, name, sport, instructions, measurement_mode, target) values (${[
          user.id,
          seriesId,
          activity.personalActivityId,
          activity.position,
          activity.name,
          activity.sport,
          activity.instructions,
          activity.measurementMode,
          activity.target,
        ]
          .map(sql)
          .join(", ")});`,
      );
    }
    let occurrence = 0;
    const last = Math.min(-1, series.end ?? -1);
    for (let offset = series.start; offset <= last; offset += 1) {
      const date = day(offset);
      if (!series.weekdays.includes(weekdayOf(date))) continue;
      if (
        series.every > 1 &&
        Math.floor((offset - series.start) / 7) % series.every
      )
        continue;
      const outcome = series.past?.(occurrence, date) ?? null;
      occurrence += 1;
      const id = crypto.randomUUID();
      insertSession(
        {
          id,
          date,
          position: nextPosition(date),
          seriesId,
          title: series.title,
          sport: series.sport,
          intent: series.intent,
          minutes: series.minutes,
          note: series.note,
          cancel: outcome?.cancel,
        },
        activities,
      );
      if (outcome && !outcome.cancel)
        logs.push({ sessionId: id, date, planned: activities, log: outcome });
    }
    for (const cancel of series.cancelAhead ?? []) {
      futureCancels.push({ seriesId, ...cancel });
    }
  }

  for (const session of past) {
    const id = crypto.randomUUID();
    const date = day(session.day);
    const activities = planned(session.activities);
    insertSession(
      {
        id,
        date,
        position: nextPosition(date),
        seriesId: null,
        title: session.title,
        sport: session.sport,
        intent: session.intent,
        minutes: session.minutes,
        note: session.note,
        cancel: session.cancel,
      },
      activities,
    );
    if (session.log)
      logs.push({ sessionId: id, date, planned: activities, log: session.log });
  }
  psql(`begin;\n${statements.join("\n")}\ncommit;`);

  // Fill the thirteen-week window from the series, a hundred at a time.
  for (let pass = 0; pass < 12; pass += 1) {
    const receipt = await api.rpc("materialize_rolling_plan_series", {
      p_expected_plan_revision: planRevision,
      p_idempotency_key: crypto.randomUUID(),
    });
    planRevision = receipt.plan_revision;
    if (receipt.result === "unchanged") break;
  }

  // Ahead: cancelled occurrences and recovery labels.
  const ahead = [];
  for (const cancel of futureCancels) {
    const sessions = await api.select(
      `rolling_plan_sessions?select=id&series_id=eq.${cancel.seriesId}&occurrence_date=gte.${day(cancel.from)}&occurrence_date=lte.${day(cancel.to)}`,
    );
    for (const session of sessions) {
      ahead.push({
        operation: "cancel",
        sessionId: session.id,
        reason: cancel.reason,
      });
    }
  }
  future.forEach((session, index) => {
    if (session.cancel) {
      ahead.push({
        operation: "cancel",
        sessionId: futureIds[index],
        reason: session.cancel,
      });
    }
  });
  for (const offset of athlete.recoveryDays ?? []) {
    ahead.push({
      operation: "set_recovery_day",
      localDate: day(offset),
      isRecoveryDay: true,
    });
  }
  if (ahead.length > 0) {
    planRevision = (
      await api.rpc("apply_rolling_plan_change_set", {
        p_expected_plan_revision: planRevision,
        p_idempotency_key: crypto.randomUUID(),
        p_provenance: "owner_manual",
        p_changes: ahead,
      })
    ).plan_revision;
  }

  // Logs, oldest first, the way they would have been written.
  const unplanned = (athlete.unplanned ?? []).map((entry) => ({
    date: day(entry.day),
    log: { ...entry, status: "unplanned" },
  }));
  const allLogs = [...logs, ...unplanned].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  for (const entry of allLogs) {
    await api.rpc("apply_completion_change", {
      p_operation: "create",
      p_completion: completionInput(entry, library),
    });
  }

  // The roadmap, written by hand as the owner can, and its ticks.
  if (athlete.roadmap) {
    const r = athlete.roadmap;
    const content = {
      schemaVersion: "fittip.roadmap.v4",
      title: r.title,
      ...(r.summary ? { summary: r.summary } : {}),
      startDate: today,
      endDate: day(r.end),
      phases: r.phases.map((phase) => ({
        title: phase.title,
        focus: phase.focus,
        startDate: day(phase.start),
        endDate: day(phase.end),
        goalAttention: phase.attention.map(([goal, level]) => ({
          goalId: goals[goal],
          level,
        })),
        milestones: phase.milestones.map((milestone) => ({
          title: milestone.title,
          ...(milestone.details
            ? { observableCriterion: milestone.details }
            : {}),
          targetDate: day(milestone.day),
          goalIds: (milestone.goals ?? []).map((goal) => goals[goal]),
        })),
      })),
    };
    const receipt = await api.rpc("write_roadmap", {
      p_content: content,
      p_expected_head_revision: 0,
    });
    for (const [phaseIndex, phase] of r.phases.entries()) {
      for (const [milestoneIndex, milestone] of phase.milestones.entries()) {
        if (!milestone.reached) continue;
        await api.rpc("set_roadmap_milestone_reached", {
          p_version_id: receipt.version_id,
          p_phase_index: phaseIndex,
          p_milestone_index: milestoneIndex,
          p_reached: true,
        });
      }
    }
  }
}

function sessionContent(session) {
  return {
    title: session.title,
    sport: session.sport,
    ...(session.intent ? { intent: session.intent } : {}),
    ...(session.minutes ? { expectedDurationMinutes: session.minutes } : {}),
    ...(session.note ? { note: session.note } : {}),
  };
}

/**
 * A log in the shape `apply_completion_change` takes. For a planned session
 * each planned activity is logged as done at its target unless `actual` says
 * otherwise: an entry per planned position, `null` for one left out. `extra`
 * appends activities that were not planned.
 */
function completionInput({ sessionId, date, planned = [], log }, library) {
  const flags = log.flags ?? {};
  const loggedActivities = [];
  if (log.status === "completed" || log.status === "partially_completed") {
    planned.forEach((activity, index) => {
      const actual = log.actual ? log.actual[index] : activity.target;
      if (actual === null) return;
      loggedActivities.push({
        ...(activity.personalActivityId
          ? { personalActivityId: activity.personalActivityId }
          : {}),
        position: loggedActivities.length,
        plannedPosition: activity.position,
        name: activity.name,
        sport: activity.sport,
        measurementMode: activity.measurementMode,
        actualMeasurement: actual ?? activity.target ?? null,
      });
    });
  }
  for (const activity of log.status === "unplanned"
    ? (log.activities ?? [])
    : (log.extra ?? [])) {
    loggedActivities.push(
      loggedActivity(activity, loggedActivities.length, library),
    );
  }

  const input = {
    status: log.status,
    actualLocalDate: date,
    activities: loggedActivities,
    painReported: flags.pain ?? false,
    illnessReported: flags.illness ?? false,
    injuryReported: flags.injury ?? false,
    severeFatigueReported: flags.fatigue ?? false,
  };
  if (sessionId) input.planSessionId = sessionId;
  if (log.status === "unplanned") {
    input.title = log.title;
    input.sport = log.sport;
  }
  if (log.minutes !== undefined) input.durationMinutes = log.minutes;
  if (log.effort !== undefined) input.perceivedEffort = log.effort;
  if (log.note) input.note = log.note;
  if (log.status === "replaced") {
    const r = log.replacement;
    input.replacement = {
      title: r.title,
      sport: r.sport,
      ...(r.minutes !== undefined ? { durationMinutes: r.minutes } : {}),
      ...(r.effort !== undefined ? { perceivedEffort: r.effort } : {}),
      activities: (r.activities ?? []).map((activity, position) =>
        loggedActivity(activity, position, library),
      ),
    };
  }
  return input;
}

function loggedActivity(activity, position, library) {
  return {
    ...(activity.lib ? { personalActivityId: library[activity.lib] } : {}),
    position,
    name: activity.name,
    sport: activity.sport,
    measurementMode: activity.measurementMode,
    actualMeasurement: activity.value ?? null,
  };
}

function toMode(kind) {
  return {
    run: "time_distance_pace",
    lift: "sets_reps_load",
    effort: "duration_intensity",
    skill: "skill_repetitions",
    custom: "custom",
    none: "unmeasured",
  }[kind];
}

// ---------------------------------------------------------------------------
// Local Supabase plumbing.

function readEnvironment() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishable || !serviceRole) {
    const status = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["supabase", "status", "-o", "env"],
      { encoding: "utf8", shell: process.platform === "win32" },
    );
    const values = Object.fromEntries(
      status.stdout
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z_]+)="?([^"]*)"?$/))
        .filter(Boolean)
        .map(([, key, value]) => [key, value]),
    );
    url ??= values.API_URL;
    publishable ??= values.PUBLISHABLE_KEY;
    serviceRole ??= values.SERVICE_ROLE_KEY;
  }
  if (!url || !publishable || !serviceRole) {
    throw new Error(
      "Start the local Supabase stack first (npx supabase start).",
    );
  }
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`Refusing to seed ${host}: test athletes are local only.`);
  }
  return { url, publishable, serviceRole };
}

async function request(path, { key, token, method = "GET", body, prefer }) {
  const response = await fetch(`${env.url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${method} ${path.split("?")[0]} → ${response.status}: ${text}`,
    );
  }
  return text ? JSON.parse(text) : null;
}

function client(token) {
  const key = env.publishable;
  return {
    rpc: (name, args) =>
      request(`/rest/v1/rpc/${name}`, {
        key,
        token,
        method: "POST",
        body: args,
      }),
    insert: (table, row) =>
      request(`/rest/v1/${table}`, {
        key,
        token,
        method: "POST",
        body: row,
        prefer: "return=representation",
      }),
    select: (path) => request(`/rest/v1/${path}`, { key, token }),
  };
}

async function deleteAccount({ id, email }) {
  const key = env.serviceRole;
  const { users } = await request("/auth/v1/admin/users?per_page=1000", {
    key,
  });
  for (const user of users.filter((u) => u.email === email || u.id === id)) {
    // Deleting the auth user alone fails: a log restricts the deletion of its
    // planned session, and plan, saved-session and log activities hold their
    // library entry with no action. Logs and plans go first, then the rest
    // cascades from the user.
    psql(
      `begin;
       delete from public.completions where user_id = ${sql(user.id)};
       delete from public.rolling_plans where user_id = ${sql(user.id)};
       delete from public.saved_sessions where user_id = ${sql(user.id)};
       commit;`,
    );
    await request(`/auth/v1/admin/users/${user.id}`, { key, method: "DELETE" });
  }
}

async function createAccount({ id, email }) {
  const created = await request("/auth/v1/admin/users", {
    key: env.serviceRole,
    method: "POST",
    body: { id, email, password: PASSWORD, email_confirm: true },
  });
  const session = await request("/auth/v1/token?grant_type=password", {
    key: env.publishable,
    method: "POST",
    body: { email, password: PASSWORD },
  });
  return { id: created.id, token: session.access_token };
}

function psql(script) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
    ],
    { input: script, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.error}`);
  }
}

async function loadAthletes(keys) {
  const folder = join(here, "athletes");
  const all = [];
  for (const file of readdirSync(folder)
    .filter((f) => f.endsWith(".mjs"))
    .sort()) {
    const { default: athlete } = await import(
      pathToFileURL(join(folder, file)).href
    );
    all.push(athlete);
  }
  if (keys.length === 0) return all;
  const chosen = all.filter((athlete) => keys.includes(athlete.key));
  const unknown = keys.filter((key) => !all.some((a) => a.key === key));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown athlete: ${unknown.join(", ")}. Known: ${all.map((a) => a.key).join(", ")}`,
    );
  }
  return chosen;
}
