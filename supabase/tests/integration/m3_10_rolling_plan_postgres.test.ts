import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { PostgresRollingPlanAdapter } from "@/server/repositories/rolling-plan-repository";
import { RollingPlan } from "@/server/rolling-plan/rolling-plan";
import { registerRollingPlanContract } from "@/server/rolling-plan/rolling-plan-contract";

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

      const { error: profileError } = await ownerClient
        .from("profiles")
        .insert({ user_id: userId });
      if (profileError)
        throw new Error("Could not create the contract profile.");

      return {
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
