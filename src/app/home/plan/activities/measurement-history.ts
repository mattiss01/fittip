import "server-only";

import { requireAllowedVerifiedUser } from "@/lib/auth/verified-user";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import { TRAINING_MEASUREMENT_MODES } from "@/lib/training/measurement";
import {
  latestModeBySport,
  type MeasuredActivity,
  type ModeBySport,
} from "@/lib/training/measurement-default";

/**
 * Enough recent rows to have seen every sport the owner trains, without
 * reading their whole history to start one field.
 */
const RECENT_ROWS = 200;

/**
 * How the owner last measured each sport, from what they logged and what they
 * planned, newest first across both. An added activity starts from it
 * (`startingMode`).
 *
 * Only a starting point, so a read that fails costs nothing but the
 * prefill: every row then starts as "Not measured", as it did before. An
 * authentication failure is the page's to answer, and its own read says so.
 */
export async function readMeasurementHistory(): Promise<ModeBySport> {
  try {
    const client = await createServerUserClient();
    const userId = await requireAllowedVerifiedUser(client);
    // RLS confines both reads already; the predicate is repeated because RLS
    // is the backstop rather than the only check.
    const [logged, planned] = await Promise.all([
      client
        .from("completion_activities")
        .select("sport, measurement_mode, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(RECENT_ROWS),
      client
        .from("rolling_plan_activities")
        .select("sport, measurement_mode, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(RECENT_ROWS),
    ]);
    if (logged.error || planned.error) return {};
    const rows = [...(logged.data ?? []), ...(planned.data ?? [])]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .flatMap((row): MeasuredActivity[] =>
        isMode(row.measurement_mode)
          ? [{ sport: row.sport, measurementMode: row.measurement_mode }]
          : [],
      );
    return latestModeBySport(rows);
  } catch {
    return {};
  }
}

function isMode(
  value: string,
): value is (typeof TRAINING_MEASUREMENT_MODES)[number] {
  return (TRAINING_MEASUREMENT_MODES as readonly string[]).includes(value);
}
