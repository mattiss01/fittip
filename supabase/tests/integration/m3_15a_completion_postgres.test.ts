import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";

import { isoDateInTimezone } from "@/lib/date/local-date";
import type { Database } from "@/lib/supabase/database.types";
import {
  CONTRACT_PLANNED_SESSION,
  registerCompletionLogContract,
} from "@/server/completions/completion-log-contract";
import { CompletionLog } from "@/server/completions/completion-log";
import { PostgresCompletionLogAdapter } from "@/server/repositories/completion-log-repository";
import { PostgresRollingPlanAdapter } from "@/server/repositories/rolling-plan-repository";
import { RollingPlan } from "@/server/rolling-plan/rolling-plan";

const CONTRACT_TIMEZONE = "UTC";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isLocalUrl =
  typeof url === "string" &&
  /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);

if (serviceRoleKey && !isLocalUrl) {
  throw new Error("The real completion contract only runs against localhost.");
}

if (url && publishableKey && serviceRoleKey && isLocalUrl) {
  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  registerCompletionLogContract("the real Postgres adapter", async () => {
    const email = `m3-15a-contract-${randomUUID()}@example.test`;
    const password = `Local-${randomUUID()}-9`;
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createError || !created.user) {
      throw new Error("Could not create the local contract owner.");
    }

    const userId = created.user.id;
    try {
      const ownerClient = createClient<Database>(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInError } = await ownerClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw new Error("Could not sign in the contract owner.");

      // A completion anchors its local date in this stored zone, exactly as the
      // Plan derives owner-local today from it.
      const { error: profileError } = await ownerClient
        .from("profiles")
        .insert({ user_id: userId, timezone_name: CONTRACT_TIMEZONE });
      if (profileError)
        throw new Error("Could not create the contract profile.");

      const plan = new RollingPlan(new PostgresRollingPlanAdapter(ownerClient));
      const planRevision = async () =>
        (await plan.getPlanSlice("2026-01-01", "2026-01-01")).revision;

      return {
        completions: new CompletionLog(
          new PostgresCompletionLogAdapter(ownerClient),
        ),
        today: isoDateInTimezone(new Date(), CONTRACT_TIMEZONE),
        addPlanSession: async (localDate, title) => {
          const sessionId = randomUUID();
          await plan.applyChangeSet(
            {
              idempotencyKey: randomUUID(),
              provenance: "owner_manual",
              changes: [
                {
                  operation: "add",
                  sessionId,
                  session: {
                    ...CONTRACT_PLANNED_SESSION,
                    localDate,
                    title,
                    activities: CONTRACT_PLANNED_SESSION.activities.map(
                      (activity) => ({ ...activity, isLocked: false }),
                    ),
                  },
                },
              ],
            },
            await planRevision(),
          );
          return sessionId;
        },
        editPlanSession: async (sessionId, title) => {
          await plan.applyChangeSet(
            {
              idempotencyKey: randomUUID(),
              provenance: "owner_manual",
              changes: [
                {
                  operation: "edit",
                  sessionId,
                  session: { title, sport: "Cycling", activities: [] },
                },
              ],
            },
            await planRevision(),
          );
        },
        // The owner's own column-scoped grant is what makes this possible; no
        // privileged client is used to set up any part of this contract.
        clearTimezone: async () => {
          const { error } = await ownerClient
            .from("profiles")
            .update({ timezone_name: null })
            .eq("user_id", userId);
          if (error) throw new Error("Could not clear the contract zone.");
        },
        dispose: async () => {
          const { error } = await admin.auth.admin.deleteUser(userId);
          if (error) throw new Error("Could not remove the contract owner.");
        },
      };
    } catch (error) {
      await admin.auth.admin.deleteUser(userId);
      throw error;
    }
  });
} else {
  describe.skip("completion log through the real Postgres adapter", () => {
    it("runs in the local Supabase CI job", () => undefined);
  });
}
