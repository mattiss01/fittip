import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";

const PROFILE_COLUMNS = "user_id, created_at, timezone_name" as const;

export type Profile = {
  userId: string;
  createdAt: string;
  /** The owner's confirmed IANA zone, or null before they have confirmed one. */
  timezoneName: string | null;
};

export class ProfileAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "ProfileAuthenticationError";
  }
}

export class ProfilePersistenceError extends Error {
  constructor() {
    super("The profile operation could not be completed.");
    this.name = "ProfilePersistenceError";
  }
}

export class ProfileValidationError extends Error {
  constructor() {
    super("The profile value is not a usable IANA time zone.");
    this.name = "ProfileValidationError";
  }
}

/**
 * The database is the authority: `profiles_timezone_name_check` validates the
 * name against `pg_catalog.pg_timezone_names`. This rejects the obvious cases
 * before a round trip, and keeps an unbounded browser string out of a query.
 */
export function parseTimezoneName(value: unknown): string {
  if (typeof value !== "string") throw new ProfileValidationError();
  const normalized = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9+_\-/]{0,99}$/.test(normalized))
    throw new ProfileValidationError();
  try {
    new Intl.DateTimeFormat("en", { timeZone: normalized });
  } catch {
    throw new ProfileValidationError();
  }
  return normalized;
}

export class ProfileRepository {
  constructor(
    private readonly client: SupabaseClient<Database> | ServerUserClient,
  ) {}

  async getCurrentProfile(): Promise<Profile | null> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw mapPersistenceError(error.code);
    }

    return data ? toProfile(data) : null;
  }

  async createCurrentProfile(): Promise<Profile> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .insert({ user_id: userId })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      throw mapPersistenceError(error.code);
    }

    return toProfile(data);
  }

  async ensureCurrentProfile(): Promise<Profile> {
    const existing = await this.getCurrentProfile();
    return existing ?? this.createCurrentProfile();
  }

  /**
   * Stores the zone the owner confirmed. The grant behind this is scoped to
   * `timezone_name`, so no other profile column can be written from here.
   */
  async confirmTimezone(timezoneName: unknown): Promise<Profile> {
    const parsed = parseTimezoneName(timezoneName);
    await this.ensureCurrentProfile();
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .update({ timezone_name: parsed })
      .eq("user_id", userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw error.code === "23514"
        ? new ProfileValidationError()
        : mapPersistenceError(error.code);
    }
    if (!data) throw new ProfilePersistenceError();
    return toProfile(data);
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new ProfileAuthenticationError(error);
      }
      throw new ProfileAuthenticationError();
    }
  }
}

export async function createProfileRepository(): Promise<ProfileRepository> {
  return new ProfileRepository(await createServerUserClient());
}

function toProfile(
  row: Database["public"]["Tables"]["profiles"]["Row"],
): Profile {
  return {
    userId: row.user_id,
    createdAt: row.created_at,
    timezoneName: row.timezone_name,
  };
}

function mapPersistenceError(code: string | undefined): Error {
  void code;
  return new ProfilePersistenceError();
}
