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

const PROFILE_COLUMNS = "user_id, created_at" as const;

export type Profile = {
  userId: string;
  createdAt: string;
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
  };
}

function mapPersistenceError(code: string | undefined): Error {
  void code;
  return new ProfilePersistenceError();
}
