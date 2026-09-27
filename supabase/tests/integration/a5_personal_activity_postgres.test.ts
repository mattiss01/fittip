import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  PersonalActivityConflictError,
  PersonalActivityLibrary,
  PersonalActivityNameTakenError,
} from "@/server/personal-activities/personal-activities";
import { PostgresPersonalActivityAdapter } from "@/server/repositories/personal-activity-repository";

/**
 * A5 against real PostgREST: the parts a mock cannot prove.
 *
 * An edit or removal matches `updated_at` exactly as it was read, so the
 * guard only works if the value survives PostgREST's serialization, the query
 * string, and Postgres's comparison unchanged. A rounding trigger, a cast in
 * the select, or a trip through `Date` would make every edit a conflict — safe,
 * but broken — and only a real round trip notices.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isLocalUrl =
  typeof url === "string" &&
  /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);

if (serviceRoleKey && !isLocalUrl) {
  throw new Error("The A5 adapter contract only runs against localhost.");
}

const enabled = Boolean(url && publishableKey && serviceRoleKey && isLocalUrl);

describe.runIf(enabled)("personal activities on the real adapter", () => {
  // Built in `beforeAll`, not here: Vitest still collects this body when the
  // suite is skipped, and a client with no key throws at construction.
  let admin: ReturnType<typeof createClient<Database>>;
  let userId: string | undefined;
  let library: PersonalActivityLibrary;

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `a5-contract-${crypto.randomUUID()}@example.test`;
    const password = `Local-${crypto.randomUUID()}-9`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error("Could not create the owner.");
    userId = created.user.id;

    const owner = createClient<Database>(url!, publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await owner.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw new Error("Could not sign the owner in.");
    const { error: profileError } = await owner
      .from("profiles")
      .insert({ user_id: userId });
    if (profileError) throw new Error("Could not create the owner's profile.");

    library = new PersonalActivityLibrary(
      new PostgresPersonalActivityAdapter(owner),
    );
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("edits with the token as read and refuses the same token again", async () => {
    const created = await library.applyChange({
      operation: "create",
      activity: {
        name: "Rudern",
        sport: "Strength",
        measurementMode: "unmeasured",
      },
    });

    const edited = await library.applyChange({
      operation: "edit",
      personalActivityId: created.id,
      expectedUpdatedAt: created.updatedAt,
      activity: {
        name: "Rudern Kabel",
        sport: "Strength",
        measurementMode: "sets_reps_load",
        target: { sets: 3, reps: 10 },
      },
    });
    expect(edited.name).toBe("Rudern Kabel");
    expect(edited.updatedAt).not.toBe(created.updatedAt);

    await expect(
      library.applyChange({
        operation: "edit",
        personalActivityId: created.id,
        expectedUpdatedAt: created.updatedAt,
        activity: {
          name: "Stale",
          sport: "Strength",
          measurementMode: "unmeasured",
        },
      }),
    ).rejects.toThrow(PersonalActivityConflictError);

    // A removal uses the same guard, and the list then leaves the row out.
    await library.applyChange({
      operation: "archive",
      personalActivityId: created.id,
      expectedUpdatedAt: edited.updatedAt,
    });
    await expect(library.list()).resolves.toEqual([]);
  });

  it("refuses a second active definition under one name", async () => {
    await library.applyChange({
      operation: "create",
      activity: {
        name: "Latzug",
        sport: "Strength",
        measurementMode: "unmeasured",
      },
    });
    await expect(
      library.applyChange({
        operation: "create",
        activity: {
          name: " latzug ",
          sport: "Rowing",
          measurementMode: "unmeasured",
        },
      }),
    ).rejects.toThrow(PersonalActivityNameTakenError);
  });
});
