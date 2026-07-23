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

  it("rejects a secret key without echoing it", () => {
    const secret = "sb_secret_do-not-log-this";

    expect(() =>
      readSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

    try {
      readSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
