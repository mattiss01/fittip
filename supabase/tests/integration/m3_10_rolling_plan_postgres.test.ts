import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { isoDateInTimezone } from "@/lib/date/local-date";
import { PostgresRollingPlanAdapter } from "@/server/repositories/rolling-plan-repository";
import { RollingPlan } from "@/server/rolling-plan/rolling-plan";
import { registerRollingPlanContract } from "@/server/rolling-plan/rolling-plan-contract";

const CONTRACT_TIMEZONE = "UTC";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isLocalUrl =
  typeof url === "string" &&
  /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);

if (serviceRoleKey && !isLocalUrl) {
  throw new Error(
    "The real rolling-plan contract only runs against localhost.",
  );
}

if (url && publishableKey && serviceRoleKey && isLocalUrl) {
  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  registerRollingPlanContract("the real Postgres adapter", async () => {
    const email = `m3-10-contract-${crypto.randomUUID()}@example.test`;
    const password = `Local-${crypto.randomUUID()}-9`;
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

      // M3-12 derives owner-local today from this stored zone, so the contract
      // owner confirms one exactly as the Plan surface does.
      const { error: profileError } = await ownerClient
        .from("profiles")
        .insert({ user_id: userId, timezone_name: CONTRACT_TIMEZONE });
      if (profileError)
        throw new Error("Could not create the contract profile.");

      return {
        today: isoDateInTimezone(new Date(), CONTRACT_TIMEZONE),
        // The owner's own column-scoped grant is what makes this possible; no
        // privileged client is used to set up any part of this contract.
        clearTimezone: async () => {
          const { error } = await ownerClient
            .from("profiles")
            .update({ timezone_name: null })
            .eq("user_id", userId);
          if (error) throw new Error("Could not clear the contract zone.");
        },
        plan: new RollingPlan(new PostgresRollingPlanAdapter(ownerClient)),
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
  describe.skip("rolling plan module through the real Postgres adapter", () => {
    it("runs in the local Supabase CI job", () => undefined);
  });
}
