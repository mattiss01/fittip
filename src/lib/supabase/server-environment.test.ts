import { describe, expect, it } from "vitest";

import { SupabaseEnvironmentError } from "@/lib/supabase/env";
import { readServerSupabaseEnvironment } from "@/lib/supabase/server-environment";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const PUBLISHABLE_KEY = "sb_publishable_test";

describe("readServerSupabaseEnvironment", () => {
  it("keeps HTTP local Supabase coordinates valid off Vercel", () => {
    expect(
      readServerSupabaseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      }),
    ).toMatchObject({ url: "http://127.0.0.1:54321" });
  });

  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "https://localhost:54321",
    "https://127.0.0.1:54321",
  ])("rejects founder staging non-HTTPS URL %s", (url) => {
    expect(() =>
      readServerSupabaseEnvironment({
        FITTIP_RUNTIME_MODE: "founder-staging",
        FITTIP_OWNER_USER_ID: OWNER_ID,
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      }),
    ).toThrow(new SupabaseEnvironmentError("NEXT_PUBLIC_SUPABASE_URL"));
  });

  it("accepts an HTTPS founder-staging Supabase URL", () => {
    expect(
      readServerSupabaseEnvironment({
        VERCEL_ENV: "production",
        FITTIP_RUNTIME_MODE: "founder-staging",
        FITTIP_OWNER_USER_ID: OWNER_ID,
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      }),
    ).toMatchObject({ url: "https://project.supabase.co" });
  });
});
