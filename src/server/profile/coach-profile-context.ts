import "server-only";

import { GENDERS } from "@/lib/profile/profile-contract";
import {
  AVAILABILITY_NOTE_MAX_LENGTH,
  HOME_EQUIPMENT_MAX_COUNT,
  TRAINING_NAME_MAX_LENGTH,
  TRAINING_PLACES_MAX_COUNT,
} from "@/lib/training/training-setup";
import type {
  CoachAIAthleteReference,
  CoachAITrainingSetupReference,
  CoachAIWeekdayName,
} from "@/server/ai/contracts";

/**
 * ADR-023: what a coaching AI may read of the owner's profile.
 *
 * Deny by default, as ADR-012 does for goals and ADR-013 for training history.
 * The profile holds a name, a birth date, a time zone, a units choice, a list
 * of sports and the state of guided setup; none of those is copied here, and
 * nothing spreads the record, so a column added to the profile later is
 * invisible to a provider until this file and ADR-023 change together.
 *
 * Two things leave:
 *
 * - **The athlete's basics**: age in whole years, gender, height and the
 *   latest weight. The birth date stays behind; the coach needs how old, not
 *   which day. The name is never read by this module at all.
 * - **The training setup**: how often, when not, where and with what. It left
 *   the coach's sight on 6 October 2026, when setup stopped writing these as
 *   memory notes, and nothing had put it back.
 *
 * It lives outside `src/server/ai` for the reason the other data-shaping
 * modules do: `server-boundary.test.ts` keeps repositories out of that module,
 * and this file's input is a repository record.
 */

/** The profile fields assembly is handed, already owner-scoped. */
export type CoachProfileRecords = {
  birthDate: string | null;
  gender: string | null;
  heightCm: number | null;
  latestWeightKg: number | null;
  training: {
    sessionsPerWeek: number | null;
    unavailableDays: readonly string[];
    availabilityNote: string | null;
    trainingPlaces: readonly string[];
    homeEquipment: readonly string[];
  };
};

export type CoachProfileSelection = {
  athlete: CoachAIAthleteReference;
  trainingSetup: CoachAITrainingSetupReference;
};

const WEEKDAYS: Record<string, CoachAIWeekdayName> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** An owner with no profile row yet: nothing known, nothing set up. */
export const EMPTY_COACH_PROFILE: CoachProfileSelection = {
  athlete: { age: null, gender: null, heightCm: null, weightKg: null },
  trainingSetup: {
    sessionsPerWeek: null,
    unavailableDays: [],
    availabilityNote: null,
    trainingPlaces: [],
    homeEquipment: [],
  },
};

export function selectCoachProfileContext(
  records: CoachProfileRecords | null | undefined,
  today: string,
): CoachProfileSelection {
  if (!records) return EMPTY_COACH_PROFILE;
  const training = records.training;

  return {
    athlete: {
      age: ageInYears(records.birthDate, today),
      // A stored value outside the ones the app knows is not given.
      gender: GENDERS.find((gender) => gender === records.gender) ?? null,
      heightCm: plausible(records.heightCm, 50, 260),
      weightKg: plausible(records.latestWeightKg, 20, 400),
    },
    trainingSetup: {
      sessionsPerWeek: plausible(training.sessionsPerWeek, 1, 21),
      unavailableDays: training.unavailableDays
        .map((day) => WEEKDAYS[day.toLowerCase()])
        .filter((day): day is CoachAIWeekdayName => day !== undefined),
      availabilityNote: bounded(
        training.availabilityNote,
        AVAILABILITY_NOTE_MAX_LENGTH,
      ),
      trainingPlaces: names(training.trainingPlaces, TRAINING_PLACES_MAX_COUNT),
      homeEquipment: names(training.homeEquipment, HOME_EQUIPMENT_MAX_COUNT),
    },
  };
}

/**
 * Whole years on the owner's own today. Null for a date that is missing,
 * malformed, in the future, or further back than anyone trains from: a wrong
 * age is worse for a coach than none.
 */
function ageInYears(birthDate: string | null, today: string): number | null {
  if (
    birthDate === null ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today)
  ) {
    return null;
  }
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  // Not yet had this year's birthday: month and day compare as text.
  const age = today.slice(5) < birthDate.slice(5) ? years - 1 : years;
  return age >= 0 && age <= 120 ? age : null;
}

function plausible(
  value: number | null,
  min: number,
  max: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

function bounded(value: string | null, max: number): string | null {
  if (value === null) return null;
  const clean = value.trim();
  return clean.length === 0 ? null : clean.slice(0, max);
}

function names(values: readonly string[], maxCount: number): string[] {
  return values
    .map((value) => value.trim().slice(0, TRAINING_NAME_MAX_LENGTH))
    .filter((value) => value.length > 0)
    .slice(0, maxCount);
}
