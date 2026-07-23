import { describe, expect, it } from "vitest";

import {
  readSupabasePublicEnvironment,
  SupabaseEnvironmentError,
} from "@/lib/supabase/env";

describe("readSupabasePublicEnvironment", () => {
  it("accepts safe local public coordinates", () => {
    expect(
      readSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_test",
    });
  });

  it.each([
    [{}, "NEXT_PUBLIC_SUPABASE_URL"],
    [
      {
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      "NEXT_PUBLIC_SUPABASE_URL",
    ],
    [
      {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      },
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ],
  ])("reports the invalid variable name without a value", (source, name) => {
    expect(() => readSupabasePublicEnvironment(source)).toThrow(
      new SupabaseEnvironmentError(name),
    );
  });

  it.each([
    ["a modern secret key", "sb_secret_do-not-log-this"],
    [
      "a legacy service-role JWT",
      [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        "eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ",
        "fake-signature-not-a-real-key",
      ].join("."),
    ],
  ])("rejects %s without echoing it", (_description, unsafeKey) => {
    expect(() =>
      readSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: unsafeKey,
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

    try {
      readSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: unsafeKey,
      });
    } catch (error) {
      expect(String(error)).not.toContain(unsafeKey);
    }
  });
});
