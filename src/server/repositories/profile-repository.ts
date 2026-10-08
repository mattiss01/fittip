import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { UNITS_SYSTEMS } from "@/lib/profile/body-measures";
import {
  GENDERS,
  type ProfileDetailsView,
  type WeightEntryView,
} from "@/lib/profile/profile-contract";
import type { SetupStateView } from "@/lib/setup/setup-steps";
import type { Database } from "@/lib/supabase/database.types";
import {
  WEEKDAYS,
  type TrainingSetupView,
} from "@/lib/training/training-setup";
import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";

const PROFILE_COLUMNS = "user_id, created_at, timezone_name" as const;
const PROFILE_DETAIL_COLUMNS =
  "timezone_name, display_name, birth_date, height_cm, gender, units_system, sports, sessions_per_week, unavailable_days, availability_note, training_places, home_equipment, setup_step, setup_finished_at, setup_skipped_at" as const;
const SETUP_STATE_COLUMNS =
  "setup_step, setup_finished_at, setup_skipped_at" as const;
const WEIGHT_ENTRY_COLUMNS = "measured_on, weight_kg" as const;

/** What `saveDetails` writes; the weight goes to the history, not here. */
export type ProfileDetailsChange = {
  displayName: string;
  birthDate: string | null;
  gender: ProfileDetailsView["gender"];
  unitsSystem: NonNullable<ProfileDetailsView["unitsSystem"]>;
  heightCm: number | null;
  weightKg: number | null;
};

/**
 * A weight typed in pounds comes back a few grams off the kilograms it was
 * shown from. Closer than this to the latest entry, it is the same weight
 * shown again, not a new measurement.
 */
const SAME_WEIGHT_KG = 0.05;

/** A year of daily entries and some: what Settings lists. */
const WEIGHT_HISTORY_LIMIT = 400;

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

  /**
   * The owner's details and sports with their latest weight, or `null` before
   * the profile exists.
   */
  async getDetails(): Promise<ProfileDetailsView | null> {
    const userId = await this.getVerifiedUserId();
    const [profile, weight] = await Promise.all([
      this.client
        .from("profiles")
        .select(PROFILE_DETAIL_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle(),
      this.client
        .from("weight_entries")
        .select(WEIGHT_ENTRY_COLUMNS)
        .eq("user_id", userId)
        .order("measured_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (profile.error || weight.error) throw new ProfilePersistenceError();
    if (!profile.data) return null;
    const row = profile.data;
    return {
      displayName: row.display_name,
      birthDate: row.birth_date,
      // A stored value outside the ones the app knows is shown as not given.
      gender: GENDERS.find((gender) => gender === row.gender) ?? null,
      unitsSystem:
        UNITS_SYSTEMS.find((units) => units === row.units_system) ?? null,
      heightCm: row.height_cm,
      timezoneName: row.timezone_name,
      sports: row.sports,
      latestWeightKg: weight.data?.weight_kg ?? null,
      training: {
        sessionsPerWeek: row.sessions_per_week,
        unavailableDays: WEEKDAYS.filter((day) =>
          row.unavailable_days.includes(day),
        ),
        availabilityNote: row.availability_note,
        trainingPlaces: row.training_places,
        homeEquipment: row.home_equipment,
      },
      setup: toSetupState(row),
    };
  }

  /**
   * Where guided setup stands. It is three columns of the profile since
   * 6 Oct 2026: nothing waits in a draft, so there is no draft to ask.
   */
  async getSetupState(): Promise<SetupStateView> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .select(SETUP_STATE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new ProfilePersistenceError();
    return data
      ? toSetupState(data)
      : { step: null, finished: false, skipped: false };
  }

  /**
   * What the layout over Home needs, in one read: whether setup is still to
   * be done, and the owner's sports for the fields that offer them.
   */
  async getHomeShell(): Promise<{ setupOpen: boolean; sports: string[] }> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .select("setup_finished_at, sports")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new ProfilePersistenceError();
    return {
      setupOpen: !data || data.setup_finished_at === null,
      sports: data?.sports ?? [],
    };
  }

  /** Begins setup at its first screen, unless it was begun or finished. */
  async startSetup(): Promise<void> {
    await this.ensureCurrentProfile();
    const userId = await this.getVerifiedUserId();
    const { error } = await this.client
      .from("profiles")
      .update({ setup_step: 1 })
      .eq("user_id", userId)
      .is("setup_step", null)
      .is("setup_finished_at", null);
    if (error) throw new ProfilePersistenceError();
  }

  /** The screen the owner is on, so that setup reopens there. */
  async saveSetupStep(step: number): Promise<void> {
    await this.updateOwnRow({ setup_step: step });
  }

  /** "Continue later": the next sign-in asks about setup instead of opening it. */
  async skipSetup(step?: number): Promise<void> {
    await this.updateOwnRow({
      setup_skipped_at: new Date().toISOString(),
      ...(step === undefined ? {} : { setup_step: step }),
    });
  }

  /** Done once, setup is not offered again. */
  async finishSetup(): Promise<void> {
    await this.updateOwnRow({ setup_finished_at: new Date().toISOString() });
  }

  /** Only the parts given are written; the others keep what they hold. */
  async saveTrainingSetup(change: Partial<TrainingSetupView>): Promise<void> {
    await this.updateOwnRow({
      ...(change.sessionsPerWeek === undefined
        ? {}
        : { sessions_per_week: change.sessionsPerWeek }),
      ...(change.unavailableDays === undefined
        ? {}
        : { unavailable_days: change.unavailableDays }),
      ...(change.availabilityNote === undefined
        ? {}
        : { availability_note: change.availabilityNote }),
      ...(change.trainingPlaces === undefined
        ? {}
        : { training_places: change.trainingPlaces }),
      ...(change.homeEquipment === undefined
        ? {}
        : { home_equipment: change.homeEquipment }),
    });
  }

  private async updateOwnRow(
    change: Database["public"]["Tables"]["profiles"]["Update"],
  ): Promise<void> {
    await this.ensureCurrentProfile();
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .update(change)
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (error) throw mapDetailsError(error.code);
    if (!data) throw new ProfilePersistenceError();
  }

  /**
   * Saves "About you". A weight is recorded for `measuredOn`, the owner's own
   * day, unless it is the latest entry shown back unchanged.
   */
  async saveDetails(
    change: ProfileDetailsChange,
    measuredOn: string,
  ): Promise<void> {
    await this.ensureCurrentProfile();
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .update({
        display_name: change.displayName,
        birth_date: change.birthDate,
        gender: change.gender,
        units_system: change.unitsSystem,
        height_cm: change.heightCm,
      })
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (error) throw mapDetailsError(error.code);
    if (!data) throw new ProfilePersistenceError();

    if (change.weightKg === null) return;
    const latest = (await this.listWeightEntries(1))[0];
    if (
      latest &&
      Math.abs(latest.weightKg - change.weightKg) < SAME_WEIGHT_KG
    ) {
      return;
    }
    await this.recordWeight(measuredOn, change.weightKg);
  }

  /** The units measures are shown and typed in; nothing stored changes. */
  async saveUnits(
    unitsSystem: ProfileDetailsChange["unitsSystem"],
  ): Promise<void> {
    await this.ensureCurrentProfile();
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .update({ units_system: unitsSystem })
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (error) throw mapDetailsError(error.code);
    if (!data) throw new ProfilePersistenceError();
  }

  async saveSports(sports: string[]): Promise<void> {
    await this.ensureCurrentProfile();
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("profiles")
      .update({ sports })
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
    if (error) throw mapDetailsError(error.code);
    if (!data) throw new ProfilePersistenceError();
  }

  /** Newest first. */
  async listWeightEntries(
    limit: number = WEIGHT_HISTORY_LIMIT,
  ): Promise<WeightEntryView[]> {
    const userId = await this.getVerifiedUserId();
    const { data, error } = await this.client
      .from("weight_entries")
      .select(WEIGHT_ENTRY_COLUMNS)
      .eq("user_id", userId)
      .order("measured_on", { ascending: false })
      .limit(limit);
    if (error) throw new ProfilePersistenceError();
    return data.map((row) => ({
      measuredOn: row.measured_on,
      weightKg: row.weight_kg,
    }));
  }

  /**
   * One entry a day: a second weight on the same day corrects the first. It is
   * an update and then, if the day had none, an insert, because the grant
   * allows only the weight to be updated and an upsert would ask for more.
   */
  async recordWeight(measuredOn: string, weightKg: number): Promise<void> {
    const userId = await this.getVerifiedUserId();
    const updated = await this.client
      .from("weight_entries")
      .update({ weight_kg: weightKg })
      .eq("user_id", userId)
      .eq("measured_on", measuredOn)
      .select("measured_on");
    if (updated.error) throw mapDetailsError(updated.error.code);
    if (updated.data.length > 0) return;

    const inserted = await this.client.from("weight_entries").insert({
      user_id: userId,
      measured_on: measuredOn,
      weight_kg: weightKg,
    });
    if (inserted.error) throw mapDetailsError(inserted.error.code);
  }

  async deleteWeightEntry(measuredOn: string): Promise<void> {
    const userId = await this.getVerifiedUserId();
    const { error } = await this.client
      .from("weight_entries")
      .delete()
      .eq("user_id", userId)
      .eq("measured_on", measuredOn);
    if (error) throw new ProfilePersistenceError();
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

function toSetupState(
  row: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "setup_step" | "setup_finished_at" | "setup_skipped_at"
  >,
): SetupStateView {
  return {
    step: row.setup_step,
    finished: row.setup_finished_at !== null,
    skipped: row.setup_skipped_at !== null,
  };
}

export async function createProfileRepository(): Promise<ProfileRepository> {
  return new ProfileRepository(await createServerUserClient());
}

function toProfile(
  row: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "user_id" | "created_at" | "timezone_name"
  >,
): Profile {
  return {
    userId: row.user_id,
    createdAt: row.created_at,
    timezoneName: row.timezone_name,
  };
}

/** A value a table check refused is the caller's to correct; the rest is not. */
function mapDetailsError(code: string | undefined): Error {
  return code === "23514"
    ? new ProfileValidationError()
    : new ProfilePersistenceError();
}

function mapPersistenceError(code: string | undefined): Error {
  void code;
  return new ProfilePersistenceError();
}
