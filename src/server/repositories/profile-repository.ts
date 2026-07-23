import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";

const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;
const PROFILE_COLUMNS = "user_id, username, created_at" as const;

export type Profile = {
  userId: string;
  username: string;
  createdAt: string;
};

export class ProfileAuthenticationError extends Error {
  constructor() {
    super("An authenticated FitTip user is required.");
    this.name = "ProfileAuthenticationError";
  }
}

export class InvalidUsernameError extends Error {
  constructor() {
    super(
      "Username must contain 3-30 lowercase letters, numbers, or underscores and begin with a letter.",
    );
    this.name = "InvalidUsernameError";
  }
}

export class UsernameUnavailableError extends Error {
  constructor() {
    super("That username is unavailable.");
    this.name = "UsernameUnavailableError";
  }
}

export class ProfilePersistenceError extends Error {
  constructor() {
    super("The profile operation could not be completed.");
    this.name = "ProfilePersistenceError";
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): string {
  const normalized = normalizeUsername(username);

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new InvalidUsernameError();
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

  async createCurrentProfile(username: string): Promise<Profile> {
    const userId = await this.getVerifiedUserId();
    const normalizedUsername = validateUsername(username);
    const { data, error } = await this.client
      .from("profiles")
      .insert({
        user_id: userId,
        username: normalizedUsername,
      })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      throw mapPersistenceError(error.code);
    }

    return toProfile(data);
  }

  private async getVerifiedUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getClaims();
    const userId = data?.claims.sub;

    if (error || typeof userId !== "string" || userId.length === 0) {
      throw new ProfileAuthenticationError();
    }

    return userId;
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
    username: row.username,
    createdAt: row.created_at,
  };
}

function mapPersistenceError(code: string | undefined): Error {
  if (code === "23505") {
    return new UsernameUnavailableError();
  }

  if (code === "23514") {
    return new InvalidUsernameError();
  }

  return new ProfilePersistenceError();
}
