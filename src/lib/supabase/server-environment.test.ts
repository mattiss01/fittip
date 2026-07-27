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
    "http://abcdefghijklmnopqrst.supabase.co",
    "https://localhost",
    "https://localhost.",
    "https://127.0.0.1",
    "https://127.0.0.2",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
    "https://user:password@abcdefghijklmnopqrst.supabase.co",
    "https://abcdefghijklmnopqrst.supabase.co:443",
    "https://abcdefghijklmnopqrst.supabase.co/auth/v1",
    "https://abcdefghijklmnopqrst.supabase.co?x=1",
    "https://abcdefghijklmnopqrst.supabase.co#fragment",
    "https://abcdefghijklmnopqrst.evil.example",
    "https://abcdefghijklmnopqrstu.supabase.co",
    "https://ABCdefghijklmnopqrst.supabase.co",
  ])("rejects invalid founder staging Supabase URL %s", (url) => {
    expect(() =>
      readServerSupabaseEnvironment({
        FITTIP_RUNTIME_MODE: "founder-staging",
        FITTIP_OWNER_USER_ID: OWNER_ID,
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      }),
    ).toThrow(new SupabaseEnvironmentError("NEXT_PUBLIC_SUPABASE_URL"));
  });

  it.each([
    "https://abcdefghijklmnopqrst.supabase.co",
    "https://abcdefghijklmnopqrst.supabase.co/",
  ])("accepts exact founder-staging Supabase API origin %s", (url) => {
    expect(
      readServerSupabaseEnvironment({
        VERCEL_ENV: "production",
        FITTIP_RUNTIME_MODE: "founder-staging",
        FITTIP_OWNER_USER_ID: OWNER_ID,
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      }),
    ).toMatchObject({ url });
  });
});
