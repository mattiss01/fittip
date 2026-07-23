export type SupabasePublicEnvironment = {
  url: string;
  publishableKey: string;
};

export class SupabaseEnvironmentError extends Error {
  constructor(variableName: string) {
    super(`Invalid or missing ${variableName}.`);
    this.name = "SupabaseEnvironmentError";
  }
}

const URL_VARIABLE = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VARIABLE = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

export function readSupabasePublicEnvironment(
  environment: Record<string, string | undefined> = process.env,
): SupabasePublicEnvironment {
  const url = environment[URL_VARIABLE]?.trim();
  const publishableKey = environment[KEY_VARIABLE]?.trim();

  if (!url || !isHttpUrl(url)) {
    throw new SupabaseEnvironmentError(URL_VARIABLE);
  }

  if (
    !publishableKey ||
    publishableKey === "replace-with-local-publishable-key" ||
    publishableKey.startsWith("sb_secret_")
  ) {
    throw new SupabaseEnvironmentError(KEY_VARIABLE);
  }

  return { url, publishableKey };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
